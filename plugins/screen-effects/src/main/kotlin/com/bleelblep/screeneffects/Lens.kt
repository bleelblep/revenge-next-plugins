package com.bleelblep.screeneffects

import android.animation.ValueAnimator
import android.annotation.TargetApi
import android.content.res.Resources
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.view.View
import java.lang.ref.WeakReference
import kotlin.math.min

/** A magnifying glass centred on the finger, following it while it is down. */
internal const val LENS_SHADER = """
uniform shader img;

uniform float2 size;
uniform float density;
uniform float dose;
uniform float2 center;
uniform float strength;
uniform float radius;

half4 main(in float2 fragCoord) {
    float2 d = fragCoord - center;
    float dist = length(d);
    float2 offset = float2(0.0);
    float add = 0.0;
    if (dist < radius) {
        float x = dist / radius;
        float scale = 1.0 - strength * 0.45 * (1.0 - x * x);
        offset = -d * (1.0 - scale);
        float rimWidth = 3.0 * density / radius;
        add = strength * (0.12 * smoothstep(1.0 - rimWidth * 2.0, 1.0, x) + 0.04 * (1.0 - x));
    }
    float2 uv = fragCoord + offset;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > size.x || uv.y > size.y) return half4(0.0);
    half4 c = img.eval(uv);
    float2 s = offset * dose * 0.5;
    if (s.x != 0.0 || s.y != 0.0) {
        c.r = img.eval(uv + s).r;
        c.b = img.eval(uv - s).b;
    }
    return half4(c.rgb + half(add) * c.a, c.a);
}
"""

@TargetApi(33)
internal class Lens(view: View) : FingerEffect {
	private val viewRef = WeakReference(view)
	private val shader = RuntimeShader(LENS_SHADER)
	private val density = Resources.getSystem().displayMetrics.density
	private var radius = 90f * density
	private var x = 0f
	private var y = 0f
	private var strength = 0f
	private var animator: ValueAnimator? = null

	/** [x]/[y] are relative to the view. Main thread only, like everything here. */
	override fun press(x: Float, y: Float, intensity: Float) {
		radius = (70f + 40f * min(intensity, 2f)) * density
		move(x, y)
		animateTo(1f, 160L)
	}

	override fun move(x: Float, y: Float) {
		this.x = x
		this.y = y
		update()
	}

	override fun release() = animateTo(0f, 200L)

	override fun cancel() {
		animator?.cancel()
		animator = null
		strength = 0f
		viewRef.get()?.let { Compositor.setTransient(it, this, null) }
	}

	private fun animateTo(target: Float, ms: Long) {
		animator?.cancel()
		animator = ValueAnimator.ofFloat(strength, target).apply {
			duration = ms
			addUpdateListener {
				strength = it.animatedValue as Float
				update()
			}
			start()
		}
	}

	private fun update() {
		if (!SHADERS_SUPPORTED || !Rendering.available("effect", STYLE_LENS)) { cancel(); return }
		try { drawFrame() } catch (error: Throwable) {
			Rendering.failed("effect", STYLE_LENS, error, "modern")
			cancel()
		}
	}

	private fun drawFrame() {
		val view = viewRef.get() ?: return
		if (strength <= 0.001f) {
			Compositor.setTransient(view, this, null)
			return
		}
		shader.setFloatUniform("size", view.width.toFloat(), view.height.toFloat())
		shader.setFloatUniform("density", density)
		shader.setFloatUniform("dose", Settings.dose)
		shader.setFloatUniform("center", x, y)
		shader.setFloatUniform("strength", strength)
		shader.setFloatUniform("radius", radius)
		Compositor.setTransient(view, this, RenderEffect.createRuntimeShaderEffect(shader, "img"))
	}
}
