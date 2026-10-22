@file:JvmName("AnsiColoursPlugin")

package com.bleelblep.ansicolours

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import io.github.revenge.plugins.PluginScope
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.DexFinder
import java.lang.reflect.Constructor
import java.lang.reflect.Field
import java.lang.reflect.Modifier

/**
 * Colours ```ansi code blocks in chat, which mobile otherwise prints with the escape codes showing.
 *
 * Chat text is drawn natively: `CodeStyle.renderCodeBlock` (Discord 348 and 349.5) adds the block's
 * background, margin and code font, then calls the private `renderCode(builder, node, rc)` to append
 * the highlighted text. For `ansi` blocks this replaces only that inner call, so the block keeps
 * Discord's own frame and font. Single-line renderings (reply previews) go through
 * `TextUtilsKt.appendInlineCodeWithPadding` instead, which gets the same colours.
 *
 * Discord 352.2+ is R8-minified and both of those are inlined away; see [Minified].
 *
 * Matches desktop: only 0 (reset), 1 (bold), 4 (underline), 30-37 and 40-47 do anything; every
 * other code is consumed and ignored. Colours are desktop's (Solarized-based) values.
 */

private const val CODE_STYLE = "com.discord.chat.presentation.textutils.CodeStyle"
private const val TEXT_UTILS = "com.discord.chat.presentation.textutils.TextUtilsKt"

private val ESCAPE = Regex("\u001B\\[([0-9;]*)m")
private val LANG_LINE = Regex("^\\s*ansi[ \\t]*\\r?\\n", RegexOption.IGNORE_CASE)

private val FOREGROUND = intArrayOf(
	0xFF4F545C.toInt(), 0xFFDC322F.toInt(), 0xFF859900.toInt(), 0xFFB58900.toInt(),
	0xFF268BD2.toInt(), 0xFFD33682.toInt(), 0xFF2AA198.toInt(), 0xFFFFFFFF.toInt(),
)
private val BACKGROUND = intArrayOf(
	0xFF002B36.toInt(), 0xFFCB4B16.toInt(), 0xFF586E75.toInt(), 0xFF657B83.toInt(),
	0xFF839496.toInt(), 0xFF6C71C4.toInt(), 0xFF93A1A1.toInt(), 0xFFFDF6E3.toInt(),
)

private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

/** Whether appendInlineCodeWithPadding's text parameter accepts a SpannableStringBuilder. */
@Volatile private var inlineTakesSpans = false

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
			val lang = XposedHelpers.callMethod(node, "getLang")
			val raw = XposedHelpers.callMethod(node, "getContent") as? String ?: return
			// Search results drop the block's language (lang ""), leaving "ansi" as the first line
			// of the content, so an unlabelled block counts when it carries escape codes.
			val unlabelled = (lang as? String).isNullOrBlank() && ESCAPE.containsMatchIn(raw)
			val content = if (unlabelled) raw.replaceFirst(LANG_LINE, "") else raw
			if (!isAnsi(lang) && !unlabelled) return
			val builder = param.args[0] as? SpannableStringBuilder ?: return
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
		// Coloured like the block when the parameter takes a CharSequence; a String one just strips.
		if (!inlineTakesSpans) {
			param.args[1] = ESCAPE.replace(text, "")
			return
		}
		param.args[1] = runCatching {
			SpannableStringBuilder().also { appendAnsi(it, text.toString(), plain = false) }
		}.getOrElse { ESCAPE.replace(text, "") }
	}
}

/**
 * Discord 352.2+ (R8-minified): CodeStyle and TextUtilsKt are gone, and renderCode and
 * appendInlineCodeWithPadding are inlined into their callers. Both callers are reached from
 * toSpannable, the static `(List<ContentNode>, RenderContext, builder, boolean)` method that draws a
 * message's nodes, so that one method is hooked instead. Before it runs, ansi code-block nodes in
 * its list are swapped for copies without the escape codes (lang "", so Discord draws them plain
 * with its own frame and font, as a block or on one line). After it runs, the colours are laid over
 * the text it appended. Quotes recurse through the same method, each call with its own frame.
 */
private object Minified {
	private lateinit var codeBlock: Class<*>
	private lateinit var create: Constructor<*>
	private lateinit var lang: Field
	private lateinit var content: Field
	private lateinit var inQuote: Field
	private val spoilerFields = HashMap<Class<*>, Field?>()

	/** The builder's length when toSpannable started, and the raw text of each block it swapped. */
	private class Frame(val start: Int, val blocks: List<String>)
	private val frames = ThreadLocal.withInitial { ArrayDeque<Frame?>() }

	fun install(finder: DexFinder): XC_MethodHook.Unhook {
		codeBlock = finder.findClass { matcher { usingStrings("CodeBlockContentNode(lang=") } }
			?: error("CodeBlockContentNode not found")
		create = codeBlock.declaredConstructors.single {
			it.parameterTypes.contentEquals(arrayOf(String::class.java, String::class.java, Integer.TYPE, java.lang.Boolean.TYPE))
		}.apply { isAccessible = true }
		// Field names are R8's, so lang and content are told apart with a probe (7 = all fields set).
		val probe = create.newInstance("\u0001lang", "\u0001content", 7, false)
		val fields = codeBlock.declaredFields.filter { !Modifier.isStatic(it.modifiers) }.onEach { it.isAccessible = true }
		lang = fields.single { it.get(probe) == "\u0001lang" }
		content = fields.single { it.get(probe) == "\u0001content" }
		inQuote = fields.single { it.type == java.lang.Boolean.TYPE }
		val toSpannable = finder.findMethod {
			matcher {
				modifiers(Modifier.STATIC)
				returnType("void")
				paramCount(4)
				usingStrings("spoiler:", "_caret", "_guild")
				usingNumbers(8288)
			}
		} ?: error("toSpannable not found")
		return XposedBridge.hookMethod(toSpannable, hook)
	}

	private val hook = object : XC_MethodHook() {
		override fun beforeHookedMethod(param: MethodHookParam) {
			val frame = runCatching { swap(param) }
				.onFailure { XposedBridge.log("[ANSI Colours] could not strip escapes: $it") }
				.getOrNull()
			frames.get()!!.addLast(frame)
		}

		override fun afterHookedMethod(param: MethodHookParam) {
			val frame = frames.get()!!.removeLastOrNull() ?: return
			runCatching { colour(param, frame) }
				.onFailure { XposedBridge.log("[ANSI Colours] could not colour: $it") }
		}
	}

	private fun swap(param: XC_MethodHook.MethodHookParam): Frame? {
		val nodes = param.args[0] as? List<*> ?: return null
		val builder = param.args[2] as? SpannableStringBuilder ?: return null
		val blocks = mutableListOf<String>()
		val swapped = nodes.map { node ->
			if (node == null || !codeBlock.isInstance(node)) return@map node
			val label = lang.get(node) as? String
			val raw = content.get(node) as? String ?: return@map node
			// Search results drop the block's language, as in renderCodeHook.
			val unlabelled = label.isNullOrBlank() && ESCAPE.containsMatchIn(raw)
			if (!isAnsi(label) && !unlabelled) return@map node
			val text = if (unlabelled) raw.replaceFirst(LANG_LINE, "") else raw
			blocks += text
			create.newInstance("", ESCAPE.replace(text, ""), 7, inQuote.get(node))
		}
		if (blocks.isEmpty()) return null
		param.args[0] = ArrayList(swapped)
		return Frame(builder.length, blocks)
	}

	private fun colour(param: XC_MethodHook.MethodHookParam, frame: Frame) {
		if (spoilerHidden(param.args[1])) return
		val builder = param.args[2] as? SpannableStringBuilder ?: return
		val drawn = builder.toString()
		var cursor = frame.start
		for (raw in frame.blocks) {
			val styled = SpannableStringBuilder().also { appendAnsi(it, raw, plain = false) }
			val plain = styled.toString()
			// As a block the text is drawn as is; on one line its newlines become spaces. Either may
			// come out trimmed, so the trimmed forms are tried too, shifted by what the trim removed.
			val trimmed = plain.trim()
			val lead = plain.indexOf(trimmed)
			val match = listOf(plain to 0, plain.replace('\n', ' ') to 0, trimmed to lead, trimmed.replace('\n', ' ') to lead)
				.firstNotNullOfOrNull { (text, shift) ->
					drawn.indexOf(text, cursor).takeIf { it >= 0 }?.let { Triple(it, shift, text.length) }
				} ?: continue
			val (at, shift, length) = match
			for (span in styled.getSpans(0, styled.length, Any::class.java)) {
				val start = styled.getSpanStart(span) - shift
				val end = minOf(styled.getSpanEnd(span) - shift, length)
				if (start < 0 || end <= start) continue
				builder.setSpan(span, at + start, at + end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
			}
			cursor = at + length
		}
	}

	/** RenderContext's spoiler state is an enum (None / Hidden / Revealed); its getters are inlined away. */
	private fun spoilerHidden(rc: Any?): Boolean {
		if (rc == null) return false
		val field = synchronized(spoilerFields) {
			spoilerFields.getOrPut(rc.javaClass) {
				rc.javaClass.declaredFields.firstOrNull { f ->
					!Modifier.isStatic(f.modifiers) && f.type.isEnum &&
						f.type.enumConstants.orEmpty().any { (it as Enum<*>).name == "Hidden" }
				}?.apply { isAccessible = true }
			}
		} ?: return false
		return (field.get(rc) as? Enum<*>)?.name == "Hidden"
	}
}

/** The host's DexFinder, or null on hosts older than 1.9.1, which don't have one. */
private fun PluginScope.finderOrNull(): DexFinder? = runCatching { dexFinder }.getOrNull()

val ansiColoursPlugin = plugin {
	start {
		// Discord 352.2+: CodeStyle no longer exists by name.
		if (runCatching { classLoader.loadClass(CODE_STYLE) }.isFailure) {
			runCatching {
				val finder = finderOrNull() ?: error("Discord is minified and this Revenge can't find its classes (needs 1.9.1+)")
				unhooks += Minified.install(finder)
			}.onFailure {
				log.e("could not hook toSpannable", it)
				errors.tryEmit(it)
			}
			return@start
		}

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
			inlineTakesSpans = method.parameterTypes[1].isAssignableFrom(SpannableStringBuilder::class.java)
			unhooks += XposedBridge.hookMethod(method, inlineCodeHook)
		}.onFailure { log.w("could not hook appendInlineCodeWithPadding: ${it.message}") }
	}

	stop {
		unhooks.forEach { it.unhook() }
		unhooks.clear()
	}
}
