package com.bleelblep.screeneffects

import android.annotation.TargetApi
import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import java.util.WeakHashMap
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

internal val RAINBOW_COLORS = intArrayOf(0xFFFF5277.toInt(), 0xFFFF9E42.toInt(), 0xFFFFE45C.toInt(),
	0xFF59E892.toInt(), 0xFF54CFFF.toInt(), 0xFFAB7AFF.toInt())

/** Nyan Cat's rainbow (Shimeji's trail colours), brighter than [RAINBOW_COLORS]. */
private val NYAN_COLORS = intArrayOf(0xFFFF0000.toInt(), 0xFFFF9900.toInt(), 0xFFFFFF00.toInt(),
	0xFF33FF00.toInt(), 0xFF0099FF.toInt(), 0xFF6633FF.toInt())

/**
 * Rainbow puffs, ported from Shimeji's Nyan Cat bubbles: a stream of chunky pixel stars, each one
 * rainbow colour with a white core, blown from the tap toward the screen edges. They wobble as they
 * drift, flick between upright and 45° as they twinkle, and pop into rainbow confetti at the edge
 * (or sooner, now and then). A particle choice; drawn on the view's overlay, so it works in both
 * tiers. On the modern tier [PuffShaders] also bends the screen in a small ring at each pop.
 * Shimeji's rainbow screen wash is the separate Rainbow puffs filter ([RAINBOW_PUFFS_SHADER]).
 *
 * Main thread only.
 */
internal object RainbowPuffs {
	private val layers = WeakHashMap<View, Layer>()
	/** [countMul] shortens the stream: power mode blows one or two per keystroke. */
	fun play(view: View, x: Float, y: Float, strength: Float, countMul: Float = 1f) {
		layers.getOrPut(view) { Layer(view) }.play(x, y, strength, countMul)
	}
	fun clear() { layers.values.toList().forEach { it.stop() }; layers.clear() }

	private const val MAX_PUFFS = 40
	private const val POP_SECONDS = 0.4f
	private val PLUS = listOf(0 to 0, 1 to 0, -1 to 0, 0 to 1, 0 to -1)

	internal class Puff(var x: Float, var y: Float, val vx: Float, val vy: Float, val size: Float,
		val phase: Float, val born: Float, val life: Float, val colour: Int) {
		var poppedAt = -1f
		val popAngle = Random.nextFloat() * 6.2832f
		val swell = Random.nextFloat() * 0.35f + 0.05f
	}

	private class Layer(view: View) : Drawable(), Choreographer.FrameCallback {
		private val root = WeakReference(view)
		private val paint = Paint().apply { isAntiAlias = false }
		private val density = Resources.getSystem().displayMetrics.density
		private val puffs = ArrayList<Puff>()
		private var toSpawn = 0
		private var nextSpawn = 0f
		private var spawnX = 0f
		private var spawnY = 0f
		private var spawnStrength = 1f
		private var colour = 0
		private var lastFrame = 0L
		private var running = false
		private val shaders = if (SHADERS_SUPPORTED) PuffShaders() else null

		private fun now() = SystemClock.uptimeMillis() / 1000f
		private fun dp(v: Float) = v * density

		fun play(x: Float, y: Float, value: Float, countMul: Float) {
			val view = root.get() ?: return
			spawnX = x
			spawnY = y
			spawnStrength = value.coerceIn(0.1f, 3f)
			// A harder tap blows a longer stream.
			toSpawn = maxOf(1, ((4 + spawnStrength * 3f) * countMul).toInt()).coerceAtMost(12)
			nextSpawn = now()
			setBounds(0, 0, view.width, view.height)
			if (!running) {
				running = true
				lastFrame = 0L
				view.overlay.add(this)
				Choreographer.getInstance().postFrameCallback(this)
			}
		}

		override fun doFrame(frameTimeNanos: Long) {
			if (!running) return
			val view = root.get()
			if (view == null || !view.isAttachedToWindow || !view.isShown) { stop(); return }
			val dt = if (lastFrame == 0L) 1f / 60f else ((frameTimeNanos - lastFrame) / 1e9f).coerceIn(0f, 0.05f)
			lastFrame = frameTimeNanos
			val t = now()
			val w = view.width.toFloat()
			val h = view.height.toFloat()

			if (toSpawn > 0 && t >= nextSpawn && puffs.size < MAX_PUFFS) {
				toSpawn--
				nextSpawn = t + 0.04f + Random.nextFloat() * 0.06f
				// Aim at a random point on the edge, mostly across and upward, never straight down.
				val angle = (-Math.PI / 2 + (Random.nextDouble() - 0.5) * Math.PI * 1.6).toFloat()
				val speed = dp(70f + Random.nextFloat() * 70f) * (0.8f + min(spawnStrength, 2f) * 0.3f)
				puffs += Puff(spawnX, spawnY, cos(angle) * speed, sin(angle) * speed,
					dp(18f + Random.nextFloat() * 28f), Random.nextFloat() * 6.28f, t,
					3.5f + Random.nextFloat() * 4f, NYAN_COLORS[colour++ % NYAN_COLORS.size])
			}

			val margin = dp(10f)
			val it = puffs.iterator()
			while (it.hasNext()) {
				val p = it.next()
				if (p.poppedAt >= 0f) {
					if (t - p.poppedAt > POP_SECONDS) it.remove()
					continue
				}
				val age = t - p.born
				// A slow sideways wobble on top of the drift.
				p.x += (p.vx + cos(age * 2.4f + p.phase) * dp(18f)) * dt
				p.y += (p.vy + sin(age * 1.7f + p.phase) * dp(10f)) * dt
				val r = radius(p, t)
				if (p.x - r < margin || p.x + r > w - margin || p.y - r < margin || p.y + r > h - margin || age > p.life)
					p.poppedAt = t
			}

			shaders?.apply(view, puffs, t)
			setBounds(0, 0, view.width, view.height)
			invalidateSelf()
			if (puffs.isEmpty() && toSpawn == 0) { stop(); return }
			Choreographer.getInstance().postFrameCallback(this)
		}

		private fun radius(p: Puff, t: Float): Float {
			// Swells over its first moment, then keeps growing as it drifts.
			val age = t - p.born
			return p.size / 2f * (0.55f + min(age / 0.35f, 1f) * 0.45f) * (1f + age * p.swell * 0.25f)
		}

		override fun draw(canvas: Canvas) {
			val saved = canvas.save()
			canvas.clipRect(bounds)
			val t = now()
			for (p in puffs) {
				val cell = (radius(p, t) / 2.5f).coerceAtLeast(2f)
				if (p.poppedAt < 0f) {
					val age = t - p.born
					paint.color = p.colour
					paint.alpha = (215 + 40 * sin(age * 6f + p.phase)).toInt().coerceIn(0, 255)
					canvas.save()
					canvas.translate(p.x, p.y)
					canvas.rotate(if ((age * 4f).toInt() % 2 == 0) 0f else 45f)
					// A plus of five cells with a white core.
					for ((dx, dy) in PLUS) canvas.drawRect((dx - 0.5f) * cell, (dy - 0.5f) * cell, (dx + 0.5f) * cell, (dy + 0.5f) * cell, paint)
					paint.color = 0xFFFFFFFF.toInt()
					paint.alpha = (215 + 40 * sin(age * 6f + p.phase)).toInt().coerceIn(0, 255)
					canvas.drawRect(-0.5f * cell, -0.5f * cell, 0.5f * cell, 0.5f * cell, paint)
					canvas.restore()
				} else {
					// Popped: eight rainbow squares burst outward fast, then slow and fade.
					val k = ((t - p.poppedAt) / POP_SECONDS).coerceIn(0f, 1f)
					val burst = 1f - (1f - k) * (1f - k)
					val first = NYAN_COLORS.indexOf(p.colour).coerceAtLeast(0)
					for (i in 0 until 8) {
						val a = (i / 8f) * 6.2832f + p.popAngle
						val d = p.size * (0.3f + burst * 0.9f)
						paint.color = NYAN_COLORS[(i + first) % NYAN_COLORS.size]
						paint.alpha = ((1f - k) * 255).toInt()
						val x = p.x + cos(a) * d
						val y = p.y + sin(a) * d
						canvas.drawRect(x - cell / 2f, y - cell / 2f, x + cell / 2f, y + cell / 2f, paint)
					}
				}
			}
			canvas.restoreToCount(saved)
		}

		fun stop() {
			Choreographer.getInstance().removeFrameCallback(this)
			root.get()?.let { view ->
				view.overlay.remove(this)
				shaders?.clear(view)
			}
			puffs.clear()
			toSpawn = 0
			running = false
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Suppress("OVERRIDE_DEPRECATION") override fun getOpacity() = PixelFormat.TRANSLUCENT
	}
}

/** Shimeji's pop rings, kept out of [RainbowPuffs] so legacy phones never load shader classes. */
@TargetApi(33)
private class PuffShaders {
	private val popsOwner = Any()
	private var popShader: RuntimeShader? = null
	private var broken = false

	fun apply(view: View, puffs: List<RainbowPuffs.Puff>, t: Float) {
		if (broken) return
		runCatching {
			val density = Resources.getSystem().displayMetrics.density
			val popping = puffs.filter { it.poppedAt >= 0f }.take(MAX_POPS)
			if (popping.isEmpty()) { Compositor.setTransient(view, popsOwner, null); return@runCatching }
			val pops = popShader ?: RuntimeShader(POPS).also { popShader = it }
			val xs = FloatArray(MAX_POPS)
			val ys = FloatArray(MAX_POPS)
			val ages = FloatArray(MAX_POPS)
			popping.forEachIndexed { i, p ->
				xs[i] = p.x
				ys[i] = p.y
				ages[i] = t - p.poppedAt
			}
			pops.setFloatUniform("density", density)
			pops.setIntUniform("count", popping.size)
			pops.setFloatUniform("px", xs)
			pops.setFloatUniform("py", ys)
			pops.setFloatUniform("age", ages)
			Compositor.setTransient(view, popsOwner, RenderEffect.createRuntimeShaderEffect(pops, "img"))
		}.onFailure {
			// A shader this phone can't compile: keep the puffs, drop the rings for good.
			broken = true
			clear(view)
			XposedBridge.log("[VFX] rainbow puff pop rings unavailable: $it")
		}
	}

	fun clear(view: View) {
		runCatching { Compositor.setTransient(view, popsOwner, null) }
	}

	private companion object {
		const val MAX_POPS = 8

		/** A small ring that bends the screen outward from each pop, fading as it spreads. */
		const val POPS = """
uniform shader img;
uniform float density;
uniform int count;
uniform float[8] px;
uniform float[8] py;
uniform float[8] age;
half4 main(float2 p) {
    float2 offset = float2(0.0);
    for (int i = 0; i < 8; ++i) {
        if (i >= count) break;
        float radius = age[i] * 260.0 * density;
        float width = 14.0 * density;
        float2 d = p - float2(px[i], py[i]);
        float dist = length(d);
        float diff = dist - radius;
        if (dist > 1.0 && abs(diff) < width) {
            float x = diff / width;
            float body = (1.0 - x * x) * (1.0 - x * x);
            float fade = 1.0 - clamp(age[i] / 0.4, 0.0, 1.0);
            offset -= (d / dist) * x * body * 9.0 * density * fade;
        }
    }
    return img.eval(p + offset);
}
"""
	}
}

/**
 * The Rainbow puffs filter, Shimeji's Nyan Cat screen: the original's six rainbow colours in stepped
 * diagonal bands on a chunky pixel grid, drifting with the trail's up-and-down steps, and pixel stars
 * twinkling. Strongest toward the edges and screen-blended so the middle stays readable.
 */
internal const val RAINBOW_PUFFS_SHADER = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
float hash(float2 v) { return fract(sin(dot(v, float2(12.9898, 78.233))) * 43758.5453); }
float3 rainbow(float k) {
    if (k < 1.0) return float3(1.0, 0.0, 0.0);
    if (k < 2.0) return float3(1.0, 0.6, 0.0);
    if (k < 3.0) return float3(1.0, 1.0, 0.0);
    if (k < 4.0) return float3(0.2, 1.0, 0.0);
    if (k < 5.0) return float3(0.0, 0.6, 1.0);
    return float3(0.4, 0.2, 1.0);
}
half4 main(float2 p) {
    half4 c = img.eval(p);
    float cell = 6.0 * density;
    float2 q = floor(p / cell);
    float2 uv = p / size;
    float lift = mod(floor(q.x / 8.0) + floor(time * 6.0), 2.0);
    float band = (q.x * 0.6 + q.y + lift) / 4.0 - time * 1.5;
    float3 colour = rainbow(floor(mod(band, 6.0)));
    float2 centred = uv * 2.0 - 1.0;
    float edge = smoothstep(0.35, 1.15, length(centred * float2(0.9, 1.0)));
    float strength = 0.10 + 0.40 * edge;
    float3 base = float3(c.rgb);
    float3 screened = 1.0 - (1.0 - base) * (1.0 - colour * strength);
    float star = step(0.996, hash(q + floor(time * 3.0))) * edge;
    screened = mix(screened, float3(1.0), star * 0.8);
    return half4(half3(min(screened, float3(c.a))), c.a);
}
"""
