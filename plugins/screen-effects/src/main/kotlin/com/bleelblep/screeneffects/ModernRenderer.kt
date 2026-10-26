package com.bleelblep.screeneffects

import android.annotation.TargetApi
import android.content.res.Resources
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.view.View
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/** Never instantiated on the legacy path. Owns all objects with newer Android API signatures. */
@TargetApi(33)
internal class ModernRenderer : EffectRenderer {
	private val ripples = WeakHashMap<View, Ripple>()
	private var validated = false
	override fun validate() {
		if (validated) return
		validated = true
		val sources = STYLES.mapValues { it.value.shader } + (STYLE_LENS to LENS_SHADER) +
			(STYLE_JELLY to JELLY_SHADER) + (STYLE_BLACKHOLE to BLACKHOLE_SHADER)
		for ((id, source) in sources) runCatching { RuntimeShader(source) }
			.onFailure { Rendering.failed("effect", id, it, "modern") }
		for ((id, filter) in FILTERS) runCatching { RuntimeShader(filter.shader) }
			.onFailure { Rendering.failed("filter", id, it, "modern") }
	}
	override fun tap(view: View, id: String, x: Float, y: Float, strength: Float) {
		val style = STYLES[id] ?: return
		var ripple = ripples[view]
		if (ripple == null || ripple.style !== style) {
			ripple?.cancel()
			ripple = Ripple(view, style)
			ripples[view] = ripple
		}
		ripple.animate(x, y, strength)
	}
	override fun finger(view: View, id: String): FingerEffect? = when (id) {
		STYLE_LENS -> Lens(view)
		STYLE_JELLY -> Jelly(view)
		STYLE_BLACKHOLE -> BlackHole(view)
		else -> null
	}
	override fun filter(id: String) = FilterEngine.set(id, emptySet())
	override val wiping get() = FrostMask.active
	override fun wipe(view: View, x: Float, y: Float, start: Boolean) = FrostMask.wipe(view, x, y, start)
	override fun clear() {
		FilterEngine.set(FILTER_NONE, emptySet())
		ripples.values.toList().forEach { it.cancel() }
		ripples.clear()
		FrostMask.reset()
		Compositor.clearAll()
	}
	override fun arcade(view: View): ArcadeShader? = runCatching { ModernArcadeShader(view, ARCADE_CRT) }.getOrNull()
	// A look that doesn't compile on this phone gives null, and the finish plays without it.
	override fun finishLook(view: View, source: String): ArcadeShader? = runCatching { ModernArcadeShader(view, source) }.getOrNull()
}

/** A full-screen shader over a finish: Arcade's CRT, or a combo skin's look. Same four uniforms. */
@TargetApi(33)
private class ModernArcadeShader(view: View, source: String) : ArcadeShader {
	private val root = WeakReference(view)
	private val shader = RuntimeShader(source)
	override fun frame(strength: Float, seconds: Float) {
		val view = root.get() ?: return
		runCatching {
			shader.setFloatUniform("size", view.width.toFloat(), view.height.toFloat())
			shader.setFloatUniform("density", Resources.getSystem().displayMetrics.density)
			shader.setFloatUniform("strength", strength)
			shader.setFloatUniform("time", seconds)
			Compositor.setTransient(view, this, RenderEffect.createRuntimeShaderEffect(shader, "img"))
		}.onFailure { clear() }
	}
	override fun clear() { root.get()?.let { Compositor.setTransient(it, this, null) } }
}
