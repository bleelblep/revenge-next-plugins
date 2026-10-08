@file:JvmName("LiveMarkdownPlugin")

package com.bleelblep.livemarkdown

import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.Spanned
import android.text.TextWatcher
import android.util.Log
import android.widget.TextView
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeMethod
import org.json.JSONObject
import java.io.File
import java.util.WeakHashMap

/**
 * Styles markdown in the message box as you type it. Discord's box is `DCDChatInput`; its own
 * styling (mentions, emoji) arrives from JS as "chat nodes" that become `DCDInputSpan`s, and
 * `ChatInputRootView.clearAndApplyChatNodes` only ever removes those (checked on 348), so spans
 * of ours survive alongside. Only spans are added: the text Discord reads and sends is untouched.
 *
 * A TextWatcher is attached the first time a box changes (hooked through `TextView.onTextChanged`,
 * which DCDChatInput doesn't override) and re-parses the whole text after every edit; messages are
 * at most a few thousand characters, so that's cheap.
 */

internal object Settings {
	@Volatile var headings = true
	@Volatile var dimMarkers = true
	@Volatile var monoCode = true
}

private const val SETTINGS_FILE = "settings.json"
private const val CHAT_INPUT = "com.discord.chat.input.views.DCDChatInput"
/** Discord's link blue. */
private const val LINK_COLOR = 0xFF00A8FC.toInt()

private val unhooks = mutableListOf<Unhook>()
private val mainHandler = Handler(Looper.getMainLooper())
private val watchers = WeakHashMap<TextView, TextWatcher>()
@Volatile private var chatInputClass: Class<*>? = null

private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)

private class Wanted(val start: Int, val end: Int, val span: MdSpan) {
	val id = "${span.key}@$start-$end"
}

private fun wantedSpans(view: TextView, text: String): List<Wanted> {
	val color = view.currentTextColor
	val out = ArrayList<Wanted>()
	fun add(run: Run, span: MdSpan) { out += Wanted(run.start, run.end, span) }
	for (run in Markdown.parse(text)) {
		when (run.kind) {
			Kind.MARKER -> if (Settings.dimMarkers) add(run, ColorMd(withAlpha(color, 0x66)))
			Kind.BOLD -> add(run, StyleMd(Typeface.BOLD))
			Kind.ITALIC -> add(run, StyleMd(Typeface.ITALIC))
			Kind.UNDERLINE -> add(run, UnderlineMd())
			Kind.STRIKE -> add(run, StrikeMd())
			Kind.SPOILER -> add(run, BackgroundMd(withAlpha(color, 0x38)))
			Kind.CODE -> {
				add(run, BackgroundMd(withAlpha(color, 0x1F)))
				if (Settings.monoCode) add(run, MonoMd())
			}
			Kind.LINK -> add(run, ColorMd(LINK_COLOR))
			Kind.H1, Kind.H2, Kind.H3 -> {
				add(run, StyleMd(Typeface.BOLD))
				if (Settings.headings) add(run, SizeMd(when (run.kind) { Kind.H1 -> 1.5f; Kind.H2 -> 1.3f; else -> 1.15f }))
			}
			Kind.SUBTEXT -> {
				add(run, ColorMd(withAlpha(color, 0xA6)))
				if (Settings.headings) add(run, SizeMd(0.85f))
			}
			Kind.QUOTE -> add(run, ColorMd(withAlpha(color, 0x80)))
		}
	}
	return out
}

/** Brings the box's spans in line with its text, adding and removing only what changed. */
private fun restyle(view: TextView, text: Editable) {
	runCatching {
		val wanted = wantedSpans(view, text.toString()).associateBy { it.id }
		val have = HashMap<String, Any>()
		for (span in text.getSpans(0, text.length, MdSpan::class.java)) {
			val id = "${span.key}@${text.getSpanStart(span)}-${text.getSpanEnd(span)}"
			if (id in wanted && id !in have) have[id] = span else text.removeSpan(span)
		}
		for ((id, w) in wanted) {
			if (id in have || w.end > text.length) continue
			text.setSpan(w.span, w.start, w.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
		}
	}.onFailure { Log.w("LiveMarkdown", "restyle failed: $it") }
}

private fun clear(view: TextView) {
	val text = view.text as? Editable ?: return
	for (span in text.getSpans(0, text.length, MdSpan::class.java)) text.removeSpan(span)
}

private fun onTextChanged(param: HookParam) {
	val view = param.thisObject as? TextView ?: return
	if (view.javaClass !== chatInputClass || watchers.containsKey(view)) return
	val watcher = object : TextWatcher {
		override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
		override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
		override fun afterTextChanged(s: Editable) = restyle(view, s)
	}
	view.addTextChangedListener(watcher)
	watchers[view] = watcher
	(view.text as? Editable)?.let { restyle(view, it) }
}

private fun settingsMap() = mapOf(
	"headings" to Settings.headings,
	"dimMarkers" to Settings.dimMarkers,
	"monoCode" to Settings.monoCode,
)

private fun applySettings(get: (String) -> Any?) {
	(get("headings") as? Boolean)?.let { Settings.headings = it }
	(get("dimMarkers") as? Boolean)?.let { Settings.dimMarkers = it }
	(get("monoCode") as? Boolean)?.let { Settings.monoCode = it }
}

val liveMarkdownPlugin = plugin {
	start {
		val file = File(storageDir, SETTINGS_FILE)
		if (file.exists()) {
			runCatching {
				val json = JSONObject(file.readText())
				applySettings { key -> if (json.has(key)) json.get(key) else null }
			}.onFailure { log.w("could not read settings: ${it.message}") }
		}

		chatInputClass = runCatching { classLoader.loadClass(CHAT_INPUT) }.getOrNull()
		if (chatInputClass == null) {
			log.w("$CHAT_INPUT not found on this Discord version")
			errors.tryEmit(IllegalStateException("Message box class not found on this Discord version"))
		}

		runCatching {
			val method = TextView::class.java.getDeclaredMethod(
				"onTextChanged",
				CharSequence::class.java,
				Int::class.javaPrimitiveType,
				Int::class.javaPrimitiveType,
				Int::class.javaPrimitiveType,
			)
			unhooks += hookMethod(method, after = ::onTextChanged)
		}.onFailure {
			log.e("could not hook TextView.onTextChanged", it)
			errors.tryEmit(it)
		}

		registerNativeMethod("${manifest.id}.getSettings") { _ -> settingsMap() }
		registerNativeMethod("${manifest.id}.setSettings") { args ->
			val patch = args.firstOrNull() as? Map<*, *> ?: emptyMap<Any, Any>()
			applySettings { patch[it] }
			runCatching { file.writeText(JSONObject(settingsMap()).toString()) }
				.onFailure { log.w("could not save settings: ${it.message}") }
			mainHandler.post {
				for (view in watchers.keys.toList()) (view.text as? Editable)?.let { restyle(view, it) }
			}
			settingsMap()
		}
	}

	stop {
		unhooks.forEach { it.unhook() }
		unhooks.clear()
		mainHandler.post {
			for ((view, watcher) in watchers.entries.toList()) {
				runCatching {
					view.removeTextChangedListener(watcher)
					clear(view)
				}
			}
			watchers.clear()
		}
	}
}
