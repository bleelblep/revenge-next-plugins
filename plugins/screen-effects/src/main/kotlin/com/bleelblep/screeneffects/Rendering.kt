package com.bleelblep.screeneffects

import android.view.View
import java.util.concurrent.ConcurrentHashMap

/** Only API-24-safe types cross this boundary. Shader classes are loaded by ModernRenderer only. */
internal interface EffectRenderer {
	fun validate() {}
	fun tap(view: View, id: String, x: Float, y: Float, strength: Float)
	fun finger(view: View, id: String): FingerEffect? = null
	fun filter(id: String)
	val wiping: Boolean get() = false
	fun wipe(view: View, x: Float, y: Float, start: Boolean) {}
	fun arcade(view: View): ArcadeShader? = null
	/** A combo skin finish's screen effect (FinishLooks.kt). None on the legacy renderer. */
	fun finishLook(view: View, source: String): ArcadeShader? = null
	fun clear()
}

internal interface FingerEffect {
	fun press(x: Float, y: Float, intensity: Float)
	fun move(x: Float, y: Float)
	fun release()
	fun cancel()
}

internal interface ArcadeShader {
	fun frame(strength: Float, seconds: Float)
	fun clear()
}

internal val EFFECT_IDS = listOf("none", "ripple", "shockwave", "swirl", "glitch", "pixel", "ink", "inkmono", "timejump", "lens", "jelly", "blackhole")
internal val FILTER_IDS = listOf("none", "crt", "nightvision", "vaporwave", "vhs", "dreamy", "oldfilm", "frost", "rainbowpuffs", "flux")
internal const val FILTER_NONE = "none"
internal fun isFilter(id: String) = id in FILTER_IDS

/** Descriptions are also the capability contract shown by JS and the quick pickers. */
internal val LEGACY_EFFECTS = mapOf(
	"shockwave" to "An expanding bright ring and glow. Does not bend the screen.",
	"ink" to "Colourful ink blooms with wobbly edges and dissolves. No refraction or content sampling.",
	"inkmono" to "Black ink on light themes, white on dark, blooming with wobbly edges. No refraction or content sampling.",
)
/** Legacy effects drawn as overlays, with no capture needed. */
internal val CANVAS_EFFECTS = LEGACY_EFFECTS.keys

/** With Legacy distortions on (the default), effects that bend a live capture of the window. */
private const val CAPTURE_NOTE = "Experimental OpenGL version: bends a live, reduced-resolution capture of one window, so it looks a little soft. Video, camera and TextureView content can't be captured."
private const val CAPTURE_FALLBACK = " Falls back to the overlay version when capture isn't possible."
internal val LEGACY_FILTERS = mapOf(
	"crt" to "Scanlines, a soft vignette and rounded screen corners. No curvature or colour bleed.",
	"oldfilm" to "Warm tint, animated grain, scratches, dust and flicker at 24 fps. Original content colours remain underneath.",
	"nightvision" to "Green tint, fixed grain and an eyepiece vignette. Does not turn content monochrome or lift shadows.",
	"vaporwave" to "Pink, violet and cyan colour washes with scanlines. Original content colours remain underneath; no luminance-based recolouring.",
	"dreamy" to "Slow pastel clouds and rising, twinkling sparkles, capped at 20 fps. No whirlpool distortion or true bloom.",
	"vhs" to "Animated static, rolling tracking bands, flicker and bottom-edge tape noise, capped near 24 fps. No pixel displacement or RGB separation.",
	"frost" to "A frosty white haze your finger wipes clear, frosting back over about ten seconds. No blur: content shows faintly through.",
	"rainbowpuffs" to "Stepped pixel rainbow bands and twinkling stars round the screen edges, at 20 fps.",
	"flux" to "A blue tint, a glowing edge, jagged arcs crackling along it and the double lightning flash, at 20 fps. No colour grading of content.",
)

/** Whether the legacy tier can draw this effect right now. */
private fun legacyEffect(id: String) = id in CANVAS_EFFECTS || (Settings.legacyRipple && id in CAPTURE_EFFECTS)

private fun legacyDescription(kind: String, id: String): String? = when {
	kind == "filter" -> LEGACY_FILTERS[id]
	Settings.legacyRipple && id in CAPTURE_EFFECTS -> CAPTURE_NOTE + if (id in CANVAS_EFFECTS) CAPTURE_FALLBACK else ""
	else -> LEGACY_EFFECTS[id]
}

/** Main-thread rendering, with thread-safe diagnostic snapshots for native bridge readers. */
internal object Rendering {
	private var modern: EffectRenderer? = null
	private val failures = ConcurrentHashMap<String, String>()
	val tier get() = if (SHADERS_SUPPORTED) "modern" else "legacy"
	private fun key(kind: String, id: String, tier: String = this.tier) = "$tier:$kind:$id"
	fun failed(kind: String, id: String, error: Throwable, tier: String = this.tier) {
		failures[key(kind, id, tier)] = "Renderer failed to initialize or draw this effect."
		XposedBridge.log("[VFX] $tier $kind/$id failed: $error")
	}

	fun available(kind: String, id: String): Boolean = id == "none" ||
		(id in (if (kind == "filter") FILTER_IDS else EFFECT_IDS) &&
			(SHADERS_SUPPORTED || (if (kind == "filter") id in LEGACY_FILTERS else legacyEffect(id))) &&
			!failures.containsKey(key(kind, id)))

	fun capabilities(kind: String): Map<String, Map<String, Any>> {
		val hardware = windowRoots(null).lastOrNull()?.isHardwareAccelerated
		return (if (kind == "filter") FILTER_IDS else EFFECT_IDS).associateWith { id ->
			val description = legacyDescription(kind, id)
			val available = available(kind, id) && (id == "none" || hardware != false)
			buildMap {
				put("available", available)
				put("renderer", if (id == "none") "none" else if (SHADERS_SUPPORTED) "agsl" else if (kind == "effect" && Settings.legacyRipple && id in CAPTURE_EFFECTS) "opengl" else "canvas")
				put("quality", if (SHADERS_SUPPORTED || id == "none") "full" else "approximate")
				if (!SHADERS_SUPPORTED && description != null) put("description", description)
				if (!available) put("reason", failures[key(kind, id)] ?: if (hardware == false)
					"The current window is not hardware accelerated." else if (kind == "effect" && id in CAPTURE_EFFECTS && !SHADERS_SUPPORTED && !Settings.legacyRipple)
					"Turn Legacy distortions back on in Debug." else "Requires a content renderer; no legacy version yet.")
			}
		}
	}

	private fun renderer(): EffectRenderer = if (SHADERS_SUPPORTED) {
		modern ?: ModernRenderer().also { modern = it; it.validate() }
	} else LegacyRenderer

	fun validate() { renderer().validate() }
	fun tap(view: View, id: String, x: Float, y: Float, strength: Float) {
		if (!view.isHardwareAccelerated || !available("effect", id) || id == "none") return
		runCatching { renderer().tap(view, id, x, y, strength) }.onFailure { failed("effect", id, it) }
	}
	fun finger(view: View, id: String): FingerEffect? {
		if (!view.isHardwareAccelerated || !available("effect", id)) return null
		return runCatching { renderer().finger(view, id) }.onFailure { failed("effect", id, it) }.getOrNull()
	}
	fun filter(id: String) {
		val engine = renderer()
		runCatching { engine.filter(if (available("filter", id)) id else FILTER_NONE) }.onFailure {
			failed("filter", id, it)
			runCatching { engine.filter(FILTER_NONE) }
		}
	}
	val wiping get() = renderer().wiping
	fun wipe(view: View, x: Float, y: Float, start: Boolean) {
		if (wiping) renderer().wipe(view, x, y, start)
	}
	fun arcade(view: View): ArcadeShader? = if (SHADERS_SUPPORTED && view.isHardwareAccelerated) renderer().arcade(view) else null
	fun finishLook(view: View, id: String): ArcadeShader? {
		if (!SHADERS_SUPPORTED || !view.isHardwareAccelerated) return null
		val source = FINISH_LOOKS[id] ?: return null
		return renderer().finishLook(view, source)
	}
	fun clear() {
		RainbowPuffs.clear()
		LegacyCapture.stop()
		modern?.clear()
		LegacyRenderer.clear()
	}
}
