@file:JvmName("AnsiColoursPlugin")

package com.bleelblep.ansicolours

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.XposedHelpers
import io.github.revenge.plugins.plugin

/**
 * Colours ```ansi code blocks in chat, which mobile otherwise prints with the escape codes showing.
 *
 * Chat text is drawn natively: `CodeStyle.renderCodeBlock` (Discord 348 and 349.5) adds the block's
 * background, margin and code font, then calls the private `renderCode(builder, node, rc)` to append
 * the highlighted text. For `ansi` blocks this replaces only that inner call, so the block keeps
 * Discord's own frame and font. Single-line renderings (reply previews) go through
 * `TextUtilsKt.appendInlineCodeWithPadding` instead; there the codes are just stripped.
 *
 * Matches desktop: only 0 (reset), 1 (bold), 4 (underline), 30-37 and 40-47 do anything; every
 * other code is consumed and ignored. Colours are desktop's (Solarized-based) values.
 */

private const val CODE_STYLE = "com.discord.chat.presentation.textutils.CodeStyle"
private const val TEXT_UTILS = "com.discord.chat.presentation.textutils.TextUtilsKt"

private val ESCAPE = Regex("\u001B\\[([0-9;]*)m")

private val FOREGROUND = intArrayOf(
	0xFF4F545C.toInt(), 0xFFDC322F.toInt(), 0xFF859900.toInt(), 0xFFB58900.toInt(),
	0xFF268BD2.toInt(), 0xFFD33682.toInt(), 0xFF2AA198.toInt(), 0xFFFFFFFF.toInt(),
)
private val BACKGROUND = intArrayOf(
	0xFF002B36.toInt(), 0xFFCB4B16.toInt(), 0xFF586E75.toInt(), 0xFF657B83.toInt(),
	0xFF839496.toInt(), 0xFF6C71C4.toInt(), 0xFF93A1A1.toInt(), 0xFFFDF6E3.toInt(),
)

private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

private fun isAnsi(lang: Any?) = (lang as? String)?.trim()?.equals("ansi", ignoreCase = true) == true

/** Appends [content] without its escape codes, styled by them unless [plain]. */
private fun appendAnsi(builder: SpannableStringBuilder, content: String, plain: Boolean) {
	var fg = -1
	var bg = -1
	var bold = false
	var underline = false

	fun append(text: CharSequence) {
		if (text.isEmpty()) return
		val start = builder.length
		builder.append(text)
		if (plain) return
		val end = builder.length
		val flags = Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
		if (fg >= 0) builder.setSpan(ForegroundColorSpan(FOREGROUND[fg]), start, end, flags)
		if (bg >= 0) builder.setSpan(BackgroundColorSpan(BACKGROUND[bg]), start, end, flags)
		// Discord's DiscordFontSpan, applied over the whole block afterwards, turns a bold style
		// into its CodeBold face rather than dropping it.
		if (bold) builder.setSpan(StyleSpan(Typeface.BOLD), start, end, flags)
		if (underline) builder.setSpan(UnderlineSpan(), start, end, flags)
	}

	var last = 0
	for (match in ESCAPE.findAll(content)) {
		append(content.subSequence(last, match.range.first))
		last = match.range.last + 1
		val params = match.groupValues[1]
		if (params.isEmpty()) {
			fg = -1; bg = -1; bold = false; underline = false
			continue
		}
		for (part in params.split(';')) {
			when (val code = part.toIntOrNull() ?: continue) {
				0 -> { fg = -1; bg = -1; bold = false; underline = false }
				1 -> bold = true
				4 -> underline = true
				in 30..37 -> fg = code - 30
				in 40..47 -> bg = code - 40
			}
		}
	}
	append(content.subSequence(last, content.length))
}

private val renderCodeHook = object : XC_MethodHook() {
	override fun beforeHookedMethod(param: MethodHookParam) {
		runCatching {
			val node = param.args[1] ?: return
			if (!isAnsi(XposedHelpers.callMethod(node, "getLang"))) return
			val builder = param.args[0] as? SpannableStringBuilder ?: return
			val content = XposedHelpers.callMethod(node, "getContent") as? String ?: return
			// A hidden spoiler hides text with a later span; colours on top could show through.
			val hidden = runCatching {
				XposedHelpers.callMethod(param.args[2], "spoilerIsHidden") as Boolean
			}.getOrDefault(false)
			appendAnsi(builder, content, plain = hidden)
			param.result = null
		}.onFailure { XposedBridge.log("[ANSI Colours] render failed, using Discord's: $it") }
	}
}

private val inlineCodeHook = object : XC_MethodHook() {
	override fun beforeHookedMethod(param: MethodHookParam) {
		val text = param.args[1] as? CharSequence ?: return
		if (text.indexOf('\u001B') < 0) return
		param.args[1] = ESCAPE.replace(text, "")
	}
}

val ansiColoursPlugin = plugin {
	start {
		runCatching {
			val method = classLoader.loadClass(CODE_STYLE).declaredMethods
				.first { it.name == "renderCode" && it.parameterTypes.size == 3 }
			unhooks += XposedBridge.hookMethod(method, renderCodeHook)
		}.onFailure {
			log.e("could not hook CodeStyle.renderCode", it)
			errors.tryEmit(it)
		}

		// Reply previews only; missing it just leaves the codes visible there.
		runCatching {
			val method = classLoader.loadClass(TEXT_UTILS).declaredMethods
				.first { it.name == "appendInlineCodeWithPadding" && it.parameterTypes.size == 2 }
			unhooks += XposedBridge.hookMethod(method, inlineCodeHook)
		}.onFailure { log.w("could not hook appendInlineCodeWithPadding: ${it.message}") }
	}

	stop {
		unhooks.forEach { it.unhook() }
		unhooks.clear()
	}
}
