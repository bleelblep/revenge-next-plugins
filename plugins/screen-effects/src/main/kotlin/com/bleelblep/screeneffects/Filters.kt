package com.bleelblep.screeneffects

import android.annotation.TargetApi
import android.content.res.Resources
import android.os.Build
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.util.WeakHashMap

/**
 * Screen filters: a shader over every window, all the time, underneath the tap effects (see
 * [Compositor]). Each shader declares only the uniforms its [Filter.bind] sets, because setting a
 * uniform a shader doesn't declare throws.
 *
 * A static filter costs one shader pass whenever the screen redraws anyway. An animated one (VHS)
 * redraws 30 times a second even when nothing moves, so it costs battery; the settings page says so.
 */
internal class Filter(
	val id: String,
	val shader: String,
	val animated: Boolean,
	val bind: RuntimeShader.(width: Float, height: Float, density: Float, seconds: Float) -> Unit,
)

/** Curved glass, scanlines, a soft vignette and a hint of colour bleed. */
private const val CRT = """
uniform shader img;
uniform float2 size;
uniform float density;
half4 main(float2 p) {
    float2 uv = p / size * 2.0 - 1.0;
    uv *= 1.0 + 0.045 * (uv.yx * uv.yx);
    if (abs(uv.x) > 1.0 || abs(uv.y) > 1.0) return half4(0.0, 0.0, 0.0, 1.0);
    float2 q = (uv + 1.0) * 0.5 * size;
    float bleed = 1.2 * density;
    half4 c = img.eval(q);
    c.r = img.eval(q + float2(bleed, 0.0)).r;
    c.b = img.eval(q - float2(bleed, 0.0)).b;
    float scan = 0.82 + 0.18 * sin(q.y / density * 3.14159265);
    float vignette = smoothstep(1.35, 0.55, length(uv * float2(0.9, 1.0)));
    return half4(c.rgb * half(scan * vignette), c.a);
}
"""

/** Green phosphor, lifted shadows, fixed grain and a round eyepiece. */
private const val NIGHT_VISION = """
uniform shader img;
uniform float2 size;
half4 main(float2 p) {
    half4 c = img.eval(p);
    float l = dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722));
    l = pow(l, 0.7) * 1.25;
    float grain = fract(sin(dot(floor(p / 2.0), float2(12.9898, 78.233))) * 43758.5453);
    l *= 0.9 + 0.2 * grain;
    float2 uv = p / size * 2.0 - 1.0;
    uv.x *= size.x / size.y;
    float eyepiece = smoothstep(1.25, 0.85, length(uv));
    float3 green = float3(0.25, 1.0, 0.35) * l * eyepiece;
    return half4(half3(green) * c.a, c.a);
}
"""

/** Pink-to-cyan duotone with soft scanlines. */
private const val VAPORWAVE = """
uniform shader img;
uniform float density;
half4 main(float2 p) {
    half4 c = img.eval(p);
    float l = dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722));
    float3 shadow = float3(0.30, 0.05, 0.45);
    float3 mid = float3(1.00, 0.35, 0.75);
    float3 light = float3(0.45, 1.00, 1.00);
    float3 tone = l < 0.5 ? mix(shadow, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
    float scan = 0.9 + 0.1 * sin(p.y / density * 2.2);
    return half4(half3(tone * scan) * c.a, c.a);
}
"""

/** Wobbling lines, a tracking band rolling down the screen, colour smear and static. Animated. */
internal const val VHS = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
float hash(float2 v) { return fract(sin(dot(v, float2(12.9898, 78.233))) * 43758.5453); }
half4 main(float2 p) {
    float wobble = sin(p.y * 0.02 / density + time * 3.0) * 1.2 * density;
    float bandY = fract(time * 0.12) * (size.y + 120.0 * density) - 60.0 * density;
    float band = 1.0 - smoothstep(0.0, 18.0 * density, abs(p.y - bandY));
    float jitter = (hash(float2(floor(p.y / (3.0 * density)), floor(time * 30.0))) - 0.5) * 10.0 * density * band;
    float2 q = p + float2(wobble + jitter, 0.0);
    float smear = 2.5 * density;
    half4 c = img.eval(q);
    c.r = img.eval(q + float2(smear, 0.0)).r;
    c.b = img.eval(q - float2(smear, 0.0)).b;
    float3 rgb = mix(float3(c.rgb), float3(dot(float3(c.rgb), float3(0.3, 0.59, 0.11))), 0.25);
    float noise = hash(p + floor(time * 30.0)) * 0.08 * c.a;
    rgb += noise + band * 0.08 * c.a;
    return half4(half3(rgb), c.a);
}
"""

/**
 * Dreamy: like drifting through a daydream. Pastel colour washes slowly roll across the screen,
 * soft clouds drift past, two slow whirlpools wander about gently twisting what's under them,
 * bright things bloom with a tinted glow, colours fringe softly towards the edges, a pastel haze
 * rims the screen, and tiny motes twinkle as they float up. Animated, but slow, so it's calm
 * rather than busy.
 */
internal const val DREAMY = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
float hash(float2 v) { return fract(sin(dot(v, float2(12.9898, 78.233))) * 43758.5453); }
float3 hsv(float h, float s, float v) {
    float3 k = clamp(abs(fract(h + float3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(float3(1.0), k, s);
}
float noise(float2 x) {
    float2 i = floor(x);
    float2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float clouds(float2 x) {
    return noise(x) * 0.55 + noise(x * 2.1 + 3.7) * 0.3 + noise(x * 4.3 + 7.1) * 0.15;
}
float2 whirl(float2 p, float2 center, float radius, float angle) {
    float2 d = p - center;
    float f = 1.0 - smoothstep(0.0, radius, length(d));
    float a = angle * f * f;
    float ca = cos(a);
    float sa = sin(a);
    return center + float2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
}
half4 main(float2 p) {
    float2 uv = p / size;
    float2 sway = float2(sin(uv.y * 6.0 + time * 0.7), cos(uv.x * 5.0 + time * 0.6)) * 2.0 * density;
    float2 q = p + sway;
    float reach = min(size.x, size.y) * 0.45;
    float2 w1 = size * float2(0.5 + 0.35 * sin(time * 0.11), 0.5 + 0.35 * cos(time * 0.08));
    float2 w2 = size * float2(0.5 + 0.35 * cos(time * 0.07 + 2.0), 0.5 + 0.35 * sin(time * 0.09 + 1.0));
    q = whirl(q, w1, reach, 0.9 * sin(time * 0.25));
    q = whirl(q, w2, reach * 0.8, -0.8 * sin(time * 0.21 + 1.3));
    half4 c = img.eval(q);
    float2 cuv = uv * 2.0 - 1.0;
    float edge = dot(cuv, cuv);
    float2 fringe = cuv * edge * 3.0 * density;
    float3 rgb = float3(float(img.eval(q + fringe).r), float(c.g), float(img.eval(q - fringe).b));
    float r = 9.0 * density;
    float s = r * 0.70710678;
    float3 blur = (float3(img.eval(q + float2(r, 0.0)).rgb) + float3(img.eval(q - float2(r, 0.0)).rgb)
        + float3(img.eval(q + float2(0.0, r)).rgb) + float3(img.eval(q - float2(0.0, r)).rgb)
        + float3(img.eval(q + float2(s, s)).rgb) + float3(img.eval(q - float2(s, s)).rgb)
        + float3(img.eval(q + float2(s, -s)).rgb) + float3(img.eval(q + float2(-s, s)).rgb)) / 8.0;
    rgb += max(blur - 0.5, 0.0) * 1.4 * float3(1.0, 0.85, 1.0);
    float hue = fract(uv.x * 0.35 + uv.y * 0.25 + time * 0.03 + 0.15 * sin(uv.y * 3.0 + time * 0.2));
    float3 tint = hsv(hue, 0.45, 1.0);
    rgb = mix(rgb, rgb * tint * 1.15 + (1.0 - rgb) * tint * 0.25, 0.55);
    float l = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, float3(l), 0.1) * 0.92 + 0.08;
    float2 cloudUv = uv * float2(2.2, 3.2) + float2(time * 0.025, time * 0.012);
    float cloud = smoothstep(0.5, 0.82, clouds(cloudUv));
    rgb = mix(rgb, hsv(fract(hue + 0.12), 0.18, 1.0), cloud * 0.28);
    float2 g = (p + float2(0.0, time * 12.0 * density)) / (22.0 * density);
    float2 id = floor(g);
    float2 f = fract(g) - 0.5;
    float h = hash(id);
    float twinkle = step(0.92, h) * pow(max(0.0, sin(time * (1.5 + h * 2.0) + h * 30.0)), 8.0);
    float2 at = (float2(hash(id + 3.1), hash(id + 5.7)) - 0.5) * 0.6;
    rgb += twinkle * smoothstep(0.12, 0.0, length(f - at)) * float3(1.0, 0.95, 1.0) * 0.9;
    float vignette = smoothstep(0.4, 1.6, edge);
    rgb = mix(rgb, hsv(fract(0.8 + time * 0.02 + uv.y * 0.2), 0.35, 1.0), vignette * 0.35);
    return half4(half3(min(rgb, float3(float(c.a)))), c.a);
}
"""

/**
 * Flux: a cool blue grade and a faint electric glow round the edges. Most beats (every 0.75 s) a
 * jagged arc of blue electricity crackles along part of the edge, and every 7 seconds lightning
 * flashes twice, like the clock tower strike.
 */
internal const val FLUX = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
float fluxHash(float n) {
    return fract(sin(n) * 43758.5453);
}
half4 main(float2 p) {
    half4 c = img.eval(p);
    float a = float(c.a);
    float3 rgb = mix(float3(c.rgb), float3(c.rgb) * float3(0.88, 0.97, 1.1), 0.6);
    float2 q = p / density;
    float2 sz = size / density;
    float left = q.x;
    float right = sz.x - q.x;
    float top = q.y;
    float bottom = sz.y - q.y;
    float edge = min(min(left, right), min(top, bottom));
    float along = edge == left ? q.y : edge == top ? sz.y + q.x : edge == right ? sz.y + sz.x + (sz.y - q.y) : 2.0 * sz.y + sz.x + (sz.x - q.x);
    float perimeter = 2.0 * (sz.x + sz.y);
    float3 glow = float3(0.2, 0.45, 0.95) * exp(-edge / 18.0) * 0.18 * (0.7 + 0.3 * sin(time * 3.0));
    float slot = floor(time / 0.75);
    float phase = fract(time / 0.75);
    if (fluxHash(slot * 1.3) > 0.35) {
        float centre = fluxHash(slot * 2.7) * perimeter;
        float span = 110.0 + 160.0 * fluxHash(slot * 4.1);
        float da = abs(along - centre);
        da = min(da, perimeter - da);
        float within = 1.0 - smoothstep(span * 0.35, span * 0.5, da);
        float frame = floor(time * 24.0);
        float n = floor(along / 12.0);
        float f = fract(along / 12.0);
        float depth = 6.0 + mix(fluxHash(n + frame * 0.37 + slot), fluxHash(n + 1.0 + frame * 0.37 + slot), f) * 26.0;
        float dev = abs(edge - depth);
        float life = pow(1.0 - phase, 1.5) * (0.6 + 0.4 * fluxHash(frame));
        glow += (float3(0.85, 0.95, 1.0) * exp(-dev / 1.2) + float3(0.35, 0.65, 1.0) * exp(-dev / 6.0) * 0.6) * within * life;
    }
    float strike = fract(time / 7.0) * 7.0;
    float flash = exp(-strike * 18.0) + 0.7 * exp(-max(strike - 0.16, 0.0) * 14.0) * step(0.16, strike);
    rgb = mix(rgb, float3(0.92, 0.96, 1.0) * a, clamp(flash, 0.0, 1.0) * 0.45);
    rgb += glow * a;
    return half4(half3(min(rgb, float3(a))), c.a);
}
"""

internal val FILTERS: Map<String, Filter> = listOf(
	Filter("crt", CRT, false) { w, h, d, _ ->
		setFloatUniform("size", w, h)
		setFloatUniform("density", d)
	},
	Filter("nightvision", NIGHT_VISION, false) { w, h, _, _ -> setFloatUniform("size", w, h) },
	Filter("vaporwave", VAPORWAVE, false) { _, _, d, _ -> setFloatUniform("density", d) },
	Filter("vhs", VHS, true) { w, h, d, t ->
		setFloatUniform("size", w, h)
		setFloatUniform("density", d)
		setFloatUniform("time", t)
	},
	Filter("dreamy", DREAMY, true) { w, h, d, t ->
		setFloatUniform("size", w, h)
		setFloatUniform("density", d)
		setFloatUniform("time", t)
	},
	Filter("oldfilm", OLD_FILM_SHADER, true) { w, h, d, t ->
		setFloatUniform("size", w, h)
		setFloatUniform("density", d)
		setFloatUniform("time", t)
	},
	Filter("flux", FLUX, true) { w, h, d, t ->
		setFloatUniform("size", w, h)
		setFloatUniform("density", d)
		setFloatUniform("time", t)
	},
	Filter("rainbowpuffs", RAINBOW_PUFFS_SHADER, true) { w, h, d, t ->
		setFloatUniform("size", w, h)
		setFloatUniform("density", d)
		setFloatUniform("time", t)
	},
	Filter(FILTER_FROST, FROST_SHADER, true) { w, h, d, _ ->
		setFloatUniform("density", d)
		setInputShader("mask", FrostMask.shader(w, h))
	},
).associateBy { it.id }

/** Keeps the chosen filter on every window root, including ones that open later. Main thread only. */
internal object FilterEngine {
	private class Applied(val filter: Filter, val shader: RuntimeShader, val width: Int, val height: Int)

	private val applied = WeakHashMap<View, Applied>()
	private var current: Filter? = null

	/** The filter showing now, or null. */
	val currentId: String? get() = current?.id
	private val startedAt = SystemClock.uptimeMillis()

	/** New windows (dialogs, menus) and rotations are picked up by this scan. */
	private const val SCAN_MS = 500L
	private val scan = object : Runnable {
		override fun run() {
			if (current == null) return
			refresh()
			mainHandler.postDelayed(this, SCAN_MS)
		}
	}

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			val filter = current ?: return
			if (!filter.animated || !SHADERS_SUPPORTED) return
			val seconds = (SystemClock.uptimeMillis() - startedAt) / 1000f
			val density = Resources.getSystem().displayMetrics.density
			for ((view, a) in applied.entries.toList()) {
				if (!view.isAttachedToWindow || !view.isShown) continue
				try {
					a.filter.bind(a.shader, a.width.toFloat(), a.height.toFloat(), density, seconds)
					Compositor.setFilter(view, RenderEffect.createRuntimeShaderEffect(a.shader, "img"))
				} catch (error: Throwable) {
					Rendering.failed("filter", filter.id, error, "modern")
					set(FILTER_NONE, emptySet())
					return
				}
			}
			Choreographer.getInstance().postFrameCallbackDelayed(this, 33L)
		}
	}

	/** Shader filters are unavailable in legacy mode, including when forced on a newer phone. */
	fun set(id: String, broken: Set<String>) {
		val next = if (SHADERS_SUPPORTED && Rendering.available("filter", id)) FILTERS[id]?.takeUnless { "filter:$id" in broken } else null
		if (next === current) return
		current = next
		mainHandler.removeCallbacks(scan)
		Choreographer.getInstance().removeFrameCallback(frame)
		if (Build.VERSION.SDK_INT >= 33) for (view in applied.keys.toList()) Compositor.setFilter(view, null)
		applied.clear()
		if (next == null) return
		refresh()
		mainHandler.postDelayed(scan, SCAN_MS)
		if (next.animated) Choreographer.getInstance().postFrameCallback(frame)
	}

	private fun refresh() {
		val filter = current ?: return
		if (!SHADERS_SUPPORTED) return
		val density = Resources.getSystem().displayMetrics.density
		val seconds = (SystemClock.uptimeMillis() - startedAt) / 1000f
		for (view in windowRoots(null)) {
			if (!view.isHardwareAccelerated) continue
			val a = applied[view]
			if (a != null && a.filter === filter && a.width == view.width && a.height == view.height) continue
			try {
				val shader = a?.shader?.takeIf { a.filter === filter } ?: RuntimeShader(filter.shader)
				filter.bind(shader, view.width.toFloat(), view.height.toFloat(), density, seconds)
				Compositor.setFilter(view, RenderEffect.createRuntimeShaderEffect(shader, "img"))
				applied[view] = Applied(filter, shader, view.width, view.height)
			} catch (error: Throwable) {
				Rendering.failed("filter", filter.id, error, "modern")
				set(FILTER_NONE, emptySet())
				return
			}
		}
	}
}
