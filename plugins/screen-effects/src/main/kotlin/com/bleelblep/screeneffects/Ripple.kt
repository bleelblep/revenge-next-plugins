// SPDX-License-Identifier: GPL-2.0-or-later
//
// Adapted from Telegram for Android (https://github.com/DrKLO/Telegram):
//   TMessagesProj/src/main/java/org/telegram/ui/Stars/SuperRipple.java
//   TMessagesProj/src/main/res/raw/superripple_effect.agsl
// Copyright Telegram FZ-LLC and contributors, licensed GPL-2.0-or-later. This file is a close port
// of both, so it carries the same licence. See ../../../../../../NOTICE.md.
//
// Changes from upstream: Kotlin; no Telegram helpers; holds its view weakly; the rounded-screen
// mask is dropped (outside the view is transparent instead of black); brightness is scaled by
// alpha so transparent areas stay transparent; an optional red/blue split ("dose"); and the
// animation loop takes any [Style], so the other effects in Styles.kt reuse it; and effects go through
// [Compositor] so they layer over a screen filter instead of replacing it.

package com.bleelblep.screeneffects

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.TargetApi
import android.content.res.Resources
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.view.View
import android.view.animation.PathInterpolator
import java.lang.ref.WeakReference
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** Every style's shader declares its uniform arrays with this length. */
internal const val MAX_COUNT = 7

private const val RIPPLE_SHADER = """
uniform shader img;

uniform float density;
uniform float2 size;
uniform int count;
uniform float dose;

uniform float[7] t;
uniform float[7] centerX;
uniform float[7] centerY;
uniform float[7] intensity;

float3 rippleOffset(float2 position, float2 center, float intensity, float time) {
    float speed = (intensity > 1.0 ? 1200.0 : 1500.0) * density;
    float frequency = (intensity > 1.0 ? 17.0 : 15.0);
    float amplitude = (intensity > 1.0 ? 15.0 : 30.0) * density * intensity;
    float decay = intensity > 1.0 ? 5.5 : 10.0;

    float dist = length(position - center);
    if (dist < 9.0 * density) return float3(0.0);

    time = max(0.0, time - dist / speed);

    float rippleAmount = amplitude * sin(frequency * time) * exp(-decay * time);

    if (dist <= 80.0 * density) {
        rippleAmount *= mix(0.4, 1.0, clamp((dist - 60.0 * density) / (20.0 * density), 0.0, 1.0));
    }

    return float3(
        normalize(position - center) * rippleAmount,
        (intensity > 1.0 ? 0.17 : 0.11) * (rippleAmount / amplitude)
    );
}

half4 main(in float2 fragCoord) {
    float add = 0.0;
    float2 offset = float2(0.0);
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float3 ripple = rippleOffset(fragCoord, float2(centerX[i], centerY[i]), intensity[i], t[i]);
        offset += ripple.xy;
        add += ripple.z;
    }
    float2 uv = fragCoord + offset;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > size.x || uv.y > size.y) return half4(0.0);

    half4 c = img.eval(uv);
    if (dose > 0.0) {
        float2 split = offset * dose;
        c.r = img.eval(uv + split).r;
        c.b = img.eval(uv - split).b;
    }
    return half4(c.rgb + half(add) * c.a, c.a);
}
"""

/** Telegram's `CubicBezierInterpolator.EASE_OUT`. */
private val EASE_OUT = PathInterpolator(0f, 0f, 0.58f, 1f)

/** Telegram's own ripple: damped waves, long enough for them to cross the whole view twice. */
internal val RIPPLE_STYLE = Style(
	id = "ripple",
	shader = RIPPLE_SHADER,
	interpolator = EASE_OUT,
	duration = { maxDist, density -> 2f * maxDist / (1200f * density) },
)

/**
 * One full-view distortion in a given [style], driven by up to [MAX_COUNT] overlapping taps.
 * Each tap's `t` runs from 0 to the style's duration in seconds, through its interpolator.
 */
@TargetApi(33)
internal class Ripple(view: View, val style: Style) {
	private class Effect(val cx: Float, val cy: Float, val intensity: Float, val animator: ValueAnimator) {
		var t = 0f
	}

	private val viewRef = WeakReference(view)
	private val effects = ArrayList<Effect>()
	private val shader = RuntimeShader(style.shader)

	private val t = FloatArray(MAX_COUNT)
	private val centerX = FloatArray(MAX_COUNT)
	private val centerY = FloatArray(MAX_COUNT)
	private val intensity = FloatArray(MAX_COUNT)

	private var width = -1
	private var height = -1

	/** Must be called on the main thread. [x]/[y] are relative to the view. */
	fun animate(x: Float, y: Float, strength: Float) {
		val view = viewRef.get() ?: return
		if (effects.size >= MAX_COUNT || view.width == 0 || view.height == 0) return

		val density = Resources.getSystem().displayMetrics.density
		val w = view.width.toFloat()
		val h = view.height.toFloat()
		val maxDist = max(
			max(hypot(x, y), hypot(w - x, y)),
			max(hypot(x, h - y), hypot(w - x, h - y)),
		)
		val duration = style.duration(maxDist, density)

		val animator = ValueAnimator.ofFloat(0f, duration)
		val effect = Effect(x, y, strength, animator)
		animator.addUpdateListener {
			effect.t = it.animatedValue as Float
			update()
		}
		animator.addListener(object : AnimatorListenerAdapter() {
			override fun onAnimationEnd(animation: Animator) {
				effects.remove(effect)
				update()
			}
		})
		animator.interpolator = style.interpolator
		animator.duration = (duration * 1000f).toLong()

		effects += effect
		update()
		animator.start()
	}

	/** Stops every running effect and removes it from the view. Main thread only. */
	fun cancel() {
		val running = effects.toList()
		effects.clear()
		running.forEach { it.animator.cancel() }
		viewRef.get()?.let { Compositor.setTransient(it, this, null) }
	}

	private fun update() {
		if (!SHADERS_SUPPORTED || !Rendering.available("effect", style.id)) { cancel(); return }
		try { drawFrame() } catch (error: Throwable) {
			Rendering.failed("effect", style.id, error, "modern")
			cancel()
		}
	}

	private fun drawFrame() {
		val view = viewRef.get() ?: return
		if (effects.isEmpty()) {
			Compositor.setTransient(view, this, null)
			return
		}

		val count = min(MAX_COUNT, effects.size)
		for (i in 0 until count) {
			val e = effects[i]
			t[i] = e.t
			centerX[i] = e.cx
			centerY[i] = e.cy
			intensity[i] = e.intensity
		}
		shader.setIntUniform("count", count)
		shader.setFloatUniform("t", t)
		shader.setFloatUniform("centerX", centerX)
		shader.setFloatUniform("centerY", centerY)
		shader.setFloatUniform("intensity", intensity)
		shader.setFloatUniform("dose", Settings.dose)
		if (width != view.width || height != view.height) {
			width = view.width
			height = view.height
			shader.setFloatUniform("size", width.toFloat(), height.toFloat())
			shader.setFloatUniform("density", Resources.getSystem().displayMetrics.density)
		}
		Compositor.setTransient(view, this, RenderEffect.createRuntimeShaderEffect(shader, "img"))
	}
}
