@file:JvmName("ScenesPlugin")
package com.bleelblep.scenes

import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val main = Handler(Looper.getMainLooper())
@Volatile private var active = false

val scenes = plugin {
	start {
		active = true
		main.post { if (active) Engine.start() }
		registerNativeAsyncMethod("${manifest.id}.configure") { args ->
			val config = Config.parse(args.firstOrNull() as? Map<*, *> ?: error("Expected scene settings"))
			withContext(Dispatchers.Main) { check(active) { "Scenes is stopped" }; Engine.configure(config) }
		}
		registerNativeAsyncMethod("${manifest.id}.status") { _ -> withContext(Dispatchers.Main) { Engine.status() } }
		registerNativeAsyncMethod("${manifest.id}.disable") { _ -> withContext(Dispatchers.Main) { Engine.configure(Config()) } }
	}
	stop {
		active = false
		main.removeCallbacksAndMessages(null)
		main.post { Engine.stop() }
	}
}
