package com.bleelblep.scenes

import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.util.TreeMap
import java.util.WeakHashMap

internal data class Config(val enabled: Boolean = false, val scene: String = "aurora", val intensity: Float = .65f,
	val speed: Float = .6f, val fps: Int = 60, val reducedMotion: Boolean = false) {
	companion object {
		fun parse(m: Map<*, *>): Config {
			fun number(key: String, fallback: Float, lo: Float, hi: Float) = (m[key] as? Number)?.toFloat()?.takeIf { it.isFinite() }?.coerceIn(lo, hi) ?: fallback
			return Config(m["enabled"] as? Boolean ?: false, (m["scene"] as? String)?.takeIf { it in Atmospheres.ids } ?: "aurora",
				number("intensity", .65f, .1f, 1f), number("speed", .6f, .1f, 1.5f),
				(m["fps"] as? Number)?.toInt()?.takeIf { it in setOf(30, 60, 90) } ?: 60, m["reducedMotion"] as? Boolean ?: false)
		}
	}
}

/** Shares the exact JDK/Android registry types used by VFX across plugin class loaders. */
internal object Layers {
	@Suppress("UNCHECKED_CAST")
	fun set(view: View, effect: RenderEffect?) {
		val props = System.getProperties()
		val table = synchronized(props) {
			(props["bleelblep.renderLayers.v1"] as? WeakHashMap<View, TreeMap<String, RenderEffect>>)
				?: WeakHashMap<View, TreeMap<String, RenderEffect>>().also { props["bleelblep.renderLayers.v1"] = it }
		}
		val layers = table.getOrPut(view) { TreeMap() }
		if (effect == null) layers.remove("16-scenes") else layers["16-scenes"] = effect
		var combined: RenderEffect? = null
		for (layer in layers.values) combined = if (combined == null) layer else RenderEffect.createChainEffect(layer, combined)
		view.setRenderEffect(combined)
		if (layers.isEmpty()) table.remove(view)
	}
}

internal object Engine {
	private val handler = Handler(Looper.getMainLooper())
	private var running = false
	private var config = Config()
	private var root: View? = null
	private var shader: RuntimeShader? = null
	private var error: String? = null
	private var scheduled = false
	private var nextFrame = 0L
	private var lastFrame = 0L
	private var time = 0f
	private var meterAt = 0L
	private var frames = 0
	private var updateFps = 0
	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(nanos: Long) {
			scheduled = false
			val view = root ?: return
			if (!running || !config.enabled || !view.isShown || !view.hasWindowFocus() || !view.isAttachedToWindow) { detach(); return }
			if (nanos < nextFrame) { schedule(); return }
			val interval = 1_000_000_000L / config.fps
			nextFrame = if (nextFrame == 0L || nanos - nextFrame > interval * 2) nanos + interval else nextFrame + interval
			if (lastFrame != 0L && !config.reducedMotion) time += ((nanos-lastFrame)/1_000_000_000f).coerceIn(0f, .1f)*config.speed
			lastFrame = nanos
			draw()
			val now = SystemClock.uptimeMillis()
			if (meterAt == 0L) meterAt = now
			frames++
			if (now-meterAt >= 1000) { updateFps = (frames*1000L/(now-meterAt)).toInt(); frames = 0; meterAt = now }
			schedule()
		}
	}
	private val monitor = object : Runnable {
		override fun run() { if (running) { refresh(); handler.postDelayed(this, 500) } }
	}
	private fun roots(): List<View> = runCatching {
		val c = Class.forName("android.view.WindowManagerGlobal")
		val instance = c.getMethod("getInstance").invoke(null)
		val field = c.getDeclaredField("mViews").apply { isAccessible = true }
		(field.get(instance) as? List<*>)?.filterIsInstance<View>().orEmpty()
	}.getOrDefault(emptyList())
	private fun refresh() {
		if (!config.enabled || Build.VERSION.SDK_INT < 33 || error != null) { detach(); return }
		val current = roots().lastOrNull { it.isAttachedToWindow && it.isShown && it.hasWindowFocus() && it.width > 0 && it.height > 0 }
		if (current !== root) { detach(); root = current; draw() }
		schedule()
	}
	private fun schedule() {
		if (!scheduled && running && config.enabled && !config.reducedMotion && root != null && error == null) {
			scheduled = true; Choreographer.getInstance().postFrameCallback(frame)
		}
	}
	private fun detach() {
		Choreographer.getInstance().removeFrameCallback(frame); scheduled = false
		if (Build.VERSION.SDK_INT >= 33) root?.let { Layers.set(it, null) }
		root = null; nextFrame = 0; lastFrame = 0; meterAt = 0; frames = 0; updateFps = 0
	}
	private fun draw() {
		if (Build.VERSION.SDK_INT < 33) return
		val view = root ?: return
		runCatching {
			val s = shader ?: RuntimeShader(Atmospheres.SOURCE).also { shader = it }
			s.setFloatUniform("size", view.width.toFloat(), view.height.toFloat())
			s.setFloatUniform("density", view.resources.displayMetrics.density)
			s.setFloatUniform("time", time)
			s.setFloatUniform("strength", config.intensity)
			s.setFloatUniform("scene", Atmospheres.ids.indexOf(config.scene).toFloat())
			Layers.set(view, RenderEffect.createRuntimeShaderEffect(s, "img"))
			view.invalidate()
		}.onFailure { error = it.message ?: it.javaClass.simpleName; detach() }
	}
	fun start() { running = true; handler.removeCallbacks(monitor); handler.post(monitor) }
	fun stop() { running = false; handler.removeCallbacks(monitor); detach(); shader = null }
	fun configure(next: Config): Map<String, Any> {
		val changedScene = config.scene != next.scene
		config = next; error = null; nextFrame = 0; lastFrame = 0
		if (changedScene) time = 0f
		Choreographer.getInstance().removeFrameCallback(frame); scheduled = false
		refresh(); draw(); schedule()
		return status()
	}
	fun status(): Map<String, Any> = mapOf(
		"message" to when {
			Build.VERSION.SDK_INT < 33 -> "Scenes requires Android 13 or newer."
			!config.enabled -> "Atmosphere stopped"
			error != null -> "Shader failed: $error"
			root == null -> "Waiting for a focused Discord window"
			config.reducedMotion -> "Atmosphere visible · motion frozen"
			else -> "Atmosphere playing"
		},
		"scene" to config.scene, "enabled" to config.enabled, "attached" to (root != null),
		"targetFps" to config.fps, "updateFps" to if (config.reducedMotion) 0 else updateFps,
		"displayHz" to (root?.display?.refreshRate ?: 0f), "shaderError" to (error ?: "OK"),
	)
}
