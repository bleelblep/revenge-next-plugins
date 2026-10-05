@file:JvmName("DreamscapePlugin")
package com.bleelblep.dreamscape

import android.os.Handler
import android.os.Looper
import com.bleelblep.dreamscape.core.*
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val main = Handler(Looper.getMainLooper())
@Volatile private var active = false
private fun post(action: () -> Unit) { main.post { if (active) runCatching(action).onFailure { android.util.Log.e("Dreamscape", "Native effect failed", it) } } }

val dreamscape = plugin {
	start {
		active = true; post { Engine.start() }
		registerNativeAsyncMethod("${manifest.id}.configure") { args ->
			val map = args.firstOrNull() as? Map<*, *> ?: return@registerNativeAsyncMethod false
			val config = Config.parse(map)
			withContext(Dispatchers.Main) { check(active); Engine.configure(config); true }
		}
		registerNativeAsyncMethod("${manifest.id}.disable") { _ -> withContext(Dispatchers.Main) { Engine.configure(Config()); true } }
		registerNativeAsyncMethod("${manifest.id}.clear") { _ -> withContext(Dispatchers.Main) { Engine.clear(); "Temporary effects cleared" } }
		registerNativeAsyncMethod("${manifest.id}.status") { _ -> withContext(Dispatchers.Main) { Engine.status() } }
		registerNativeAsyncMethod("${manifest.id}.preview") { args ->
			val scene = Scene.parse(args.firstOrNull() as? Map<*, *>) ?: return@registerNativeAsyncMethod "Invalid scene"
			withContext(Dispatchers.Main) {
				check(active && Engine.config.enabled) { "Enable Dreamscape before previewing a scene." }
				Engine.preview(scene)
				check(Engine.status()["attached"] == true) { "No focused Discord window. Bring Discord to the foreground." }
				"Playing ${scene.world} for 12 seconds"
			}
		}
		registerNativeAsyncMethod("${manifest.id}.cast") { args ->
			val name = args.firstOrNull() as? String ?: return@registerNativeAsyncMethod false
			if (name !in setOf("portal", "frost", "prism", "meteor")) return@registerNativeAsyncMethod false
			withContext(Dispatchers.Main) {
				check(active && Engine.config.enabled && Engine.config.spellbook) { "Enable Dreamscape and Spellbook first." }
				check(Engine.status()["attached"] == true) { "Bring Discord to the foreground." }
				Engine.cast(name); "Casting $name"
			}
		}
		registerNativeAsyncMethod("${manifest.id}.gesture") { _ -> withContext(Dispatchers.Main) {
			check(active && Engine.config.enabled && Engine.config.spellbook) { "Enable Dreamscape and Spellbook first." }
			check(Engine.status()["attached"] == true) { "Bring Discord to the foreground." }
			Engine.gesture(); "Draw on the canvas, or tap × to cancel"
		} }
	}
	stop {
		active = false; main.removeCallbacksAndMessages(null); main.post { Engine.stop() }
	}
}
