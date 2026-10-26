package com.bleelblep.screeneffects

import android.annotation.TargetApi
import android.content.res.Resources
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.min

/**
 * An effect that follows a held finger instead of playing once per tap: the [Lens], [Jelly] and
 * [BlackHole]. Coordinates are relative to the view. Main thread only.
 */
internal const val STYLE_JELLY = "jelly"
internal const val STYLE_BLACKHOLE = "blackhole"

/**
 * Pressing dents the screen around the finger; dragging smears it along, the jelly lagging behind
 * on a spring; letting go makes it wobble back. [pull] is how far the finger is ahead of the
 * jelly, [dent] how deep the press is (negative = bulging out on the rebound).
 */
internal const val JELLY_SHADER = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float2 center;
uniform float2 pull;
uniform float dent;
uniform float radius;

half4 main(float2 p) {
    float2 d = p - center;
    float w = exp(-dot(d, d) / (radius * radius));
    float2 offset = -pull * w + d * dent * 0.35 * w;
    float2 uv = clamp(p + offset, float2(0.0), size - 1.0);
    half4 c = img.eval(uv);
    float shade = 1.0 - 0.14 * dent * w;
    float2 n = normalize(d + float2(0.0001));
    float sheen = max(0.0, dot(n, float2(-0.7071, -0.7071))) * w * abs(dent) * 0.10;
    return half4(c.rgb * half(shade) + half(sheen) * c.a, c.a);
}
"""

/**
 * Holding opens a black hole that grows the longer you hold: the screen around it swirls and is
 * pulled in, with a glowing ring at the edge of the dark middle. Letting go springs it all back.
 */
internal const val BLACKHOLE_SHADER = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float2 center;
uniform float strength;
uniform float radius;
uniform float time;

half4 main(float2 p) {
    float2 d = p - center;
    float r = length(d);
    float s = max(strength, 0.0);
    float reach = radius * (0.7 + 1.6 * s);
    float f = clamp(1.0 - r / reach, 0.0, 1.0);
    f = f * f;
    float angle = strength * 5.0 * f + s * f * time * 0.8;
    float ca = cos(angle);
    float sa = sin(angle);
    float2 rd = float2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
    rd *= 1.0 + strength * 2.2 * f;
    float2 uv = clamp(center + rd, float2(0.0), size - 1.0);
    half4 c = img.eval(uv);
    float3 rgb = float3(c.rgb);
    float horizon = radius * 0.22 * s;
    float dark = 1.0 - smoothstep(horizon * 0.85, horizon * 1.15, r);
    float ring = exp(-abs(r - horizon * 1.2) / (5.0 * density)) * s;
    float3 glow = mix(float3(1.0, 0.55, 0.15), float3(0.65, 0.35, 1.0), 0.5 + 0.5 * sin(atan(d.y, d.x) * 3.0 + time * 2.0));
    rgb = rgb * (1.0 - dark) + glow * ring * 0.9;
    rgb *= 1.0 - 0.35 * f * s;
    return half4(half3(rgb), c.a);
}
"""

/** Shared spring stepping and frame loop for the two physical effects. */
@TargetApi(33)
private abstract class SpringEffect(view: View, source: String, private val id: String) : FingerEffect {
	protected val viewRef = WeakReference(view)
	protected val shader = RuntimeShader(source)
	protected val density = Resources.getSystem().displayMetrics.density
	protected var held = false
	protected var x = 0f
	protected var y = 0f
	private var lastFrame = 0L
	private var running = false

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (!running) return
			if (!SHADERS_SUPPORTED || !Rendering.available("effect", id)) { cancel(); return }
			try { drawFrame(frameTimeNanos) } catch (error: Throwable) {
				Rendering.failed("effect", id, error, "modern")
				cancel()
			}
		}

		private fun drawFrame(frameTimeNanos: Long) {
			val view = viewRef.get()
			if (view == null || !view.isAttachedToWindow) {
				cancel()
				return
			}
			val dt = if (lastFrame == 0L) 1f / 60f else ((frameTimeNanos - lastFrame) / 1e9f).coerceIn(0.001f, 0.05f)
			lastFrame = frameTimeNanos
			step(dt)
			if (!held && settled()) {
				stopLoop()
				Compositor.setTransient(view, this@SpringEffect, null)
				return
			}
			bind(view)
			Compositor.setTransient(view, this@SpringEffect, RenderEffect.createRuntimeShaderEffect(shader, "img"))
			Choreographer.getInstance().postFrameCallback(this)
		}
	}

	protected abstract fun step(dt: Float)
	protected abstract fun settled(): Boolean
	protected abstract fun bind(view: View)

	protected fun startLoop() {
		if (running) return
		running = true
		lastFrame = 0L
		Choreographer.getInstance().postFrameCallback(frame)
	}

	private fun stopLoop() {
		running = false
		Choreographer.getInstance().removeFrameCallback(frame)
	}

	override fun move(x: Float, y: Float) {
		this.x = x
		this.y = y
	}

	override fun release() {
		held = false
	}

	override fun cancel() {
		stopLoop()
		held = false
		reset()
		viewRef.get()?.let { Compositor.setTransient(it, this, null) }
	}

	protected abstract fun reset()

	/** One damped spring step towards [target]; returns the new (value, velocity). */
	protected fun spring(value: Float, velocity: Float, target: Float, stiffness: Float, damping: Float, dt: Float): Pair<Float, Float> {
		val v = velocity + (stiffness * (target - value) - damping * velocity) * dt
		return (value + v * dt) to v
	}
}

@TargetApi(33)
internal class Jelly(view: View) : FingerEffect by Impl(view) {
	private class Impl(view: View) : SpringEffect(view, JELLY_SHADER, STYLE_JELLY) {
		private var radius = 90f
		private var dent = 0f
		private var dentV = 0f
		/** Where the jelly under the finger has got to; it chases the finger. */
		private var ax = 0f
		private var ay = 0f
		private var avx = 0f
		private var avy = 0f

		override fun press(x: Float, y: Float, intensity: Float) {
			radius = (55f + 35f * min(intensity, 2f)) * density
			if (!held && settled()) { ax = x; ay = y; avx = 0f; avy = 0f }
			move(x, y)
			held = true
			startLoop()
		}

		override fun step(dt: Float) {
			spring(dent, dentV, if (held) 1f else 0f, 220f, 9f, dt).let { (v, vel) -> dent = v; dentV = vel }
			spring(ax, avx, x, 140f, 8f, dt).let { (v, vel) -> ax = v; avx = vel }
			spring(ay, avy, y, 140f, 8f, dt).let { (v, vel) -> ay = v; avy = vel }
		}

		override fun settled() =
			abs(dent) < 0.004f && abs(dentV) < 0.02f && hypot(x - ax, y - ay) < 0.5f && hypot(avx, avy) < 2f

		override fun bind(view: View) {
			// The smear is how far the finger is ahead of the jelly, capped so a fling can't tear it.
			var px = x - ax
			var py = y - ay
			val len = hypot(px, py)
			val cap = radius * 0.8f
			if (len > cap) { px *= cap / len; py *= cap / len }
			shader.setFloatUniform("size", view.width.toFloat(), view.height.toFloat())
			shader.setFloatUniform("density", density)
			shader.setFloatUniform("center", x, y)
			shader.setFloatUniform("pull", px, py)
			shader.setFloatUniform("dent", dent)
			shader.setFloatUniform("radius", radius)
		}

		override fun reset() {
			dent = 0f; dentV = 0f; avx = 0f; avy = 0f; ax = x; ay = y
		}
	}
}

@TargetApi(33)
internal class BlackHole(view: View) : FingerEffect by Impl(view) {
	private class Impl(view: View) : SpringEffect(view, BLACKHOLE_SHADER, STYLE_BLACKHOLE) {
		private var radius = 80f
		private var strength = 0f
		private var strengthV = 0f
		private var time = 0f
		/** The centre drifts after the finger rather than snapping to it. */
		private var cx = 0f
		private var cy = 0f

		override fun press(x: Float, y: Float, intensity: Float) {
			radius = (60f + 30f * min(intensity, 2f)) * density
			if (!held && settled()) { cx = x; cy = y }
			move(x, y)
			held = true
			startLoop()
		}

		override fun step(dt: Float) {
			time += dt
			if (held) {
				// Grows steadily while held, fully open after about a second and a half.
				strength = min(1f, strength + dt / 1.5f)
				strengthV = 0f
			} else {
				spring(strength, strengthV, 0f, 120f, 7f, dt).let { (v, vel) -> strength = v; strengthV = vel }
			}
			val k = 1f - kotlin.math.exp(-dt * 10f)
			cx += (x - cx) * k
			cy += (y - cy) * k
		}

		override fun settled() = abs(strength) < 0.004f && abs(strengthV) < 0.02f

		override fun bind(view: View) {
			shader.setFloatUniform("size", view.width.toFloat(), view.height.toFloat())
			shader.setFloatUniform("density", density)
			shader.setFloatUniform("center", cx, cy)
			shader.setFloatUniform("strength", strength)
			shader.setFloatUniform("radius", radius)
			shader.setFloatUniform("time", time)
		}

		override fun reset() {
			strength = 0f; strengthV = 0f; time = 0f
		}
	}
}
