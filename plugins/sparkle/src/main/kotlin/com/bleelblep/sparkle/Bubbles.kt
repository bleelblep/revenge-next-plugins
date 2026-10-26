package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import android.view.Choreographer
import android.view.ViewGroup
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * Sparkle blows bubbles: they drift out from its wand toward the edges of the screen, wobbling and
 * growing a little, and pop when they get there (or sooner, now and then), with the pop sparkles
 * from the bubble sprite sheet. Each bubble is one of the sheet's [VARIANTS] drawings
 * (fx/bubble_N.png). Drawn on the window's overlay, so this part works on any Android.
 *
 * On Android 13 and up, two screen effects join in through [SharedLayers], the registry VFX, Tilt
 * Physics and Night Light share, so none of them overwrite each other (older phones, and ones whose
 * shaders won't compile, get [LegacyBubbleFx]'s overlay versions instead):
 * - "15-sparkle-film": while bubbles are out, the whole screen takes on a soap film. Thin-film
 *   colours (magenta, gold, green, cyan) swirl slowly across it, strongest toward the edges like a
 *   real bubble, with a faint bright rim and a slight wobble. It fades in and out, and is screen-
 *   blended so text in the middle stays readable.
 * - "25-sparkle-pops": each pop bends the screen in a small ring, like a tiny shockwave.
 * Both are cleared the moment the last bubble is gone.
 *
 * Main thread only.
 */
internal object Bubbles {
	private class Bubble(
		var x: Float,
		var y: Float,
		val vx: Float,
		val vy: Float,
		val size: Float,
		val phase: Float,
		val born: Float,
		val life: Float,
		val variant: Int = Random.nextInt(VARIANTS),
	) {
		var poppedAt = -1f

		// What makes each bubble its own: which drawing, a start angle and spin, a squash-and-stretch
		// wobble at its own pace, how much it swells, a colour shift, and whether it is mirrored.
		var angle0 = Random.nextFloat() * 360f
		val spin = (Random.nextFloat() * 50f + 15f) * (if (Random.nextBoolean()) 1f else -1f)
		val wobbleSpeed = Random.nextFloat() * 3f + 3.5f
		val wobbleAmount = Random.nextFloat() * 0.08f + 0.04f
		val swell = Random.nextFloat() * 0.35f + 0.05f
		var tint = Random.nextInt(TINTS)
		var flip = Random.nextBoolean()
		val popAngle = Random.nextFloat() * 360f
		val popSpin = (Random.nextFloat() * 60f + 30f) * (if (Random.nextBoolean()) 1f else -1f)
	}

	private const val MAX_BUBBLES = 14
	private const val POP_SECONDS = 0.4f
	private val PLUS = listOf(0 to 0, 1 to 0, -1 to 0, 0 to 1, 0 to -1)
	private const val FILM_KEY = "15-sparkle-film"
	private const val POPS_KEY = "25-sparkle-pops"
	private const val MAX_POPS = 8
	private const val TINTS = 6
	private const val VARIANTS = 6

	/** Hue shifts in degrees, one per tint: the sprite as drawn, then five turns round the wheel. */
	private val tintFilters: List<ColorFilter?> = List(TINTS) { i ->
		if (i == 0) null else ColorMatrixColorFilter(hueRotation(i * 60f))
	}

	/** A colour matrix that turns every hue by [degrees] and leaves brightness alone. */
	private fun hueRotation(degrees: Float): ColorMatrix {
		val r = Math.toRadians(degrees.toDouble())
		val c = cos(r).toFloat()
		val s = sin(r).toFloat()
		val lr = 0.213f
		val lg = 0.715f
		val lb = 0.072f
		return ColorMatrix(
			floatArrayOf(
				lr + c * (1 - lr) + s * -lr, lg + c * -lg + s * -lg, lb + c * -lb + s * (1 - lb), 0f, 0f,
				lr + c * -lr + s * 0.143f, lg + c * (1 - lg) + s * 0.140f, lb + c * -lb + s * -0.283f, 0f, 0f,
				lr + c * -lr + s * -(1 - lr), lg + c * -lg + s * lg, lb + c * (1 - lb) + s * lb, 0f, 0f,
				0f, 0f, 0f, 1f, 0f,
			),
		)
	}

	private val bubbles = ArrayList<Bubble>()
	private var decor: ViewGroup? = null
	private var layer: Layer? = null
	private var running = false
	private var toSpawn = 0
	private var nextSpawn = 0f
	private var spawnX = 0f
	private var spawnY = 0f
	/** How strongly the soap film shows, 0..1, eased in and out. */
	private var film = 0f
	private val startedAt = SystemClock.uptimeMillis()
	private var filmShader: RuntimeShader? = null
	private var rainbowShader: RuntimeShader? = null
	private var popShader: RuntimeShader? = null
	private var shadersBroken = false

	/** The screen effects are drawn on the layer ([LegacyBubbleFx]) rather than as shaders. */
	private val legacyFx get() = Settings.bubbleFx && (Build.VERSION.SDK_INT < 33 || shadersBroken)

	private val images = HashMap<String, Bitmap?>()

	internal fun image(name: String): Bitmap? = images.getOrPut(name) {
		runCatching {
			val bytes = Base64.decode(SpriteData.images.getValue(name).joinToString(""), Base64.DEFAULT)
			BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
		}.getOrNull()
	}

	private fun now() = SystemClock.uptimeMillis() / 1000f

	val active get() = running

	/** Blows [count] bubbles from ([x], [y]) in [root], one every ~0.2 s, starting after [delay] s. */
	fun blow(root: ViewGroup, x: Float, y: Float, count: Int, delay: Float = 0f) {
		start(root)
		spawnX = x
		spawnY = y
		toSpawn = min(count, MAX_BUBBLES)
		nextSpawn = now() + delay
	}

	/**
	 * Takes over a bubble drawn in Sparkle's own frame: same drawing, same size and spot, upright and
	 * untinted, so the swap can't be seen. It then floats off the way Sparkle faces ([dir]).
	 */
	fun release(root: ViewGroup, x: Float, y: Float, size: Float, variant: Int, dir: Int) {
		start(root)
		if (bubbles.size >= MAX_BUBBLES) return
		val t = now()
		// Born a moment ago, so it starts at full size instead of swelling in.
		bubbles.add(
			Bubble(
				x, y, dir * dp(45f + Random.nextFloat() * 30f), -dp(40f + Random.nextFloat() * 30f),
				size, Random.nextFloat() * 6.28f, t - 0.35f, 4f + Random.nextFloat() * 3f,
				variant.coerceIn(0, VARIANTS - 1),
			).apply {
				angle0 = -spin * 0.35f
				tint = 0
				flip = dir < 0
			},
		)
	}

	private fun start(root: ViewGroup) {
		if (decor !== root) {
			clear()
			decor = root
		}
		if (layer == null) layer = Layer().also { root.overlay.add(it) }
		if (!running) {
			running = true
			Choreographer.getInstance().postFrameCallback(frame)
		}
	}

	/** Moves the spawn point with Sparkle while it is still blowing. */
	fun follow(x: Float, y: Float) {
		spawnX = x
		spawnY = y
	}

	fun clear() {
		running = false
		Choreographer.getInstance().removeFrameCallback(frame)
		bubbles.clear()
		toSpawn = 0
		film = 0f
		layer?.let { l -> decor?.overlay?.remove(l) }
		layer = null
		LegacyBubbleFx.clear()
		decor?.let { root ->
			if (Build.VERSION.SDK_INT >= 33) runCatching {
				SharedLayers.set(root, FILM_KEY, null)
				SharedLayers.set(root, POPS_KEY, null)
			}
		}
		decor = null
	}

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (!running) return
			runCatching { step() }.onFailure { clear(); return }
			if (running) Choreographer.getInstance().postFrameCallback(this)
		}
	}

	private fun step() {
		val root = decor ?: return clear()
		val t = now()
		val w = root.width.toFloat()
		val h = root.height.toFloat()

		if (toSpawn > 0 && t >= nextSpawn) {
			toSpawn--
			nextSpawn = t + 0.12f + Random.nextFloat() * 0.18f
			// Aim at a random point on the edge, mostly across and upward, never straight down.
			val angle = (-Math.PI / 2 + (Random.nextDouble() - 0.5) * Math.PI * 1.6).toFloat()
			val speed = dp(70f + Random.nextFloat() * 70f)
			bubbles.add(
				Bubble(
					spawnX, spawnY, cos(angle) * speed, sin(angle) * speed,
					dp(18f + Random.nextFloat() * 28f), Random.nextFloat() * 6.28f, t,
					3.5f + Random.nextFloat() * 4f,
				),
			)
		}

		val margin = dp(10f)
		val it = bubbles.iterator()
		while (it.hasNext()) {
			val b = it.next()
			if (b.poppedAt >= 0f) {
				if (t - b.poppedAt > POP_SECONDS) it.remove()
				continue
			}
			val age = t - b.born
			// A slow sideways wobble on top of the drift, like a real bubble.
			b.x += (b.vx + cos(age * 2.4f + b.phase) * dp(18f)) / 60f
			b.y += (b.vy + sin(age * 1.7f + b.phase) * dp(10f)) / 60f
			val r = radius(b, t)
			val atEdge = b.x - r < margin || b.x + r > w - margin || b.y - r < margin || b.y + r > h - margin
			if (atEdge || age > b.life) {
				b.poppedAt = t
				Sounds.pop(b.size / dp(46f))
			}
		}

		val out = bubbles.isNotEmpty() || toSpawn > 0
		// Eases in over ~0.6 s while bubbles are out, and back out after the last one goes.
		film = (film + (if (out) 1f else -1f) / 60f / 0.6f).coerceIn(0f, 1f)
		applyScreenEffects(root, t, w, h)
		layer?.invalidateSelf()
		if (!out && film <= 0f) clear()
	}

	private fun radius(b: Bubble, t: Float): Float {
		// Swells over its first moment, then keeps growing as it drifts, each at its own rate.
		val age = t - b.born
		return b.size / 2f * (0.55f + min(age / 0.35f, 1f) * 0.45f) * (1f + age * b.swell * 0.25f)
	}

	// ------------------------------------------------------------ screen effects (Android 13+)

	/**
	 * A soap film over the whole screen. Film thickness comes from a few slow, overlapping waves, and
	 * each thickness maps to a thin-film interference colour (the cosine palette below). The colours
	 * are strongest near the edges, where a real bubble's film is most visible, with a faint bright
	 * rim, and are screen-blended so the middle stays readable. A slight wobble bends it like a
	 * bubble's skin. [amount] fades the whole thing.
	 */
	private const val FILM = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
uniform float amount;
float3 filmColour(float thickness) {
    return 0.5 + 0.5 * cos(6.2831853 * (thickness + float3(0.0, 0.33, 0.67)));
}
half4 main(float2 p) {
    float2 uv = p / size;
    float2 wobble = float2(sin(uv.y * 7.0 + time * 1.3), cos(uv.x * 6.0 - time * 1.1)) * 2.5 * density * amount;
    half4 c = img.eval(p + wobble);
    float swirl = sin(uv.x * 3.1 + time * 0.55) + sin(uv.y * 4.3 - time * 0.45)
        + sin((uv.x + uv.y) * 5.7 + time * 0.8) + sin(length(uv - 0.5) * 9.0 - time * 0.6);
    float thickness = swirl * 0.18 + time * 0.05;
    float3 colour = filmColour(thickness);
    float2 centred = uv * 2.0 - 1.0;
    float edge = smoothstep(0.35, 1.15, length(centred * float2(0.9, 1.0)));
    float rim = smoothstep(0.93, 1.0, max(abs(centred.x), abs(centred.y)));
    float strength = amount * (0.16 + 0.44 * edge);
    float3 base = float3(c.rgb);
    float3 screened = 1.0 - (1.0 - base) * (1.0 - colour * strength);
    screened += rim * 0.25 * amount;
    return half4(half3(min(screened, float3(c.a))), c.a);
}
"""

	/**
	 * Nyan Cat's version of the film, while rainbow puffs are out: the original's six rainbow colours
	 * in stepped diagonal bands on a chunky pixel grid, drifting with the same up-and-down steps as
	 * the trail, and pixel stars twinkling. Strongest toward the edges and screen-blended, like the
	 * soap film, so the middle stays readable. [amount] fades it.
	 */
	private const val RAINBOW = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
uniform float amount;
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
    // The trail's steps: every eight cells the bands lift by one, flipping a few times a second.
    float lift = mod(floor(q.x / 8.0) + floor(time * 6.0), 2.0);
    float band = (q.x * 0.6 + q.y + lift) / 4.0 - time * 1.5;
    float3 colour = rainbow(floor(mod(band, 6.0)));
    float2 centred = uv * 2.0 - 1.0;
    float edge = smoothstep(0.35, 1.15, length(centred * float2(0.9, 1.0)));
    float strength = amount * (0.10 + 0.40 * edge);
    float3 base = float3(c.rgb);
    float3 screened = 1.0 - (1.0 - base) * (1.0 - colour * strength);
    // Pixel stars near the edges, each lit for a moment.
    float star = step(0.996, hash(q + floor(time * 3.0))) * edge * amount;
    screened = mix(screened, float3(1.0), star * 0.8);
    return half4(half3(min(screened, float3(c.a))), c.a);
}
"""

	/** A small ring that bends the screen outward from each pop, fading as it spreads. */
	private const val POPS = """
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

	private fun applyScreenEffects(root: ViewGroup, t: Float, w: Float, h: Float) {
		if (Build.VERSION.SDK_INT < 33 || !Settings.bubbleFx || shadersBroken) return
		runCatching {
			val density = dp(1f)
			if (film > 0f) {
				// Soap film for the unicorn's bubbles, a rainbow screen for Nyan Cat's puffs.
				val shader = if (Settings.look == Looks.NYAN) rainbowShader ?: RuntimeShader(RAINBOW).also { rainbowShader = it }
				else filmShader ?: RuntimeShader(FILM).also { filmShader = it }
				shader.setFloatUniform("size", w, h)
				shader.setFloatUniform("density", density)
				shader.setFloatUniform("time", (SystemClock.uptimeMillis() - startedAt) / 1000f)
				// Eased, so it swells in and melts away rather than switching.
				val eased = film * film * (3f - 2f * film)
				shader.setFloatUniform("amount", eased)
				SharedLayers.set(root, FILM_KEY, RenderEffect.createRuntimeShaderEffect(shader, "img"))
			} else SharedLayers.set(root, FILM_KEY, null)

			val popping = bubbles.filter { it.poppedAt >= 0f }.take(MAX_POPS)
			if (popping.isEmpty()) {
				SharedLayers.set(root, POPS_KEY, null)
				return@runCatching
			}
			val pops = popShader ?: RuntimeShader(POPS).also { popShader = it }
			val xs = FloatArray(MAX_POPS)
			val ys = FloatArray(MAX_POPS)
			val ages = FloatArray(MAX_POPS)
			popping.forEachIndexed { i, b ->
				xs[i] = b.x
				ys[i] = b.y
				ages[i] = t - b.poppedAt
			}
			pops.setFloatUniform("density", density)
			pops.setIntUniform("count", popping.size)
			pops.setFloatUniform("px", xs)
			pops.setFloatUniform("py", ys)
			pops.setFloatUniform("age", ages)
			SharedLayers.set(root, POPS_KEY, RenderEffect.createRuntimeShaderEffect(pops, "img"))
		}.onFailure {
			// A shader this phone can't compile: keep the bubbles, drop the screen effects for good.
			shadersBroken = true
			runCatching {
				SharedLayers.set(root, FILM_KEY, null)
				SharedLayers.set(root, POPS_KEY, null)
			}
			android.util.Log.w("Sparkle", "bubble screen effects unavailable: ${it.message}")
		}
	}

	// ------------------------------------------------------------ drawing

	private class Layer : Drawable() {
		private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
		private val dest = RectF()

		override fun draw(canvas: Canvas) {
			val root = decor ?: return
			if (bounds.width() != root.width || bounds.height() != root.height) setBounds(0, 0, root.width, root.height)
			val t = now()
			val pop = image("pop")
			val nyan = Settings.look == Looks.NYAN
			if (legacyFx) drawLegacyFx(canvas, root, t)
			for (b in bubbles) {
				if (nyan) {
					drawPuff(canvas, b, t)
					continue
				}
				paint.colorFilter = tintFilters[b.tint]
				if (b.poppedAt < 0f) {
					val bubble = image("bubble_${b.variant + 1}") ?: continue
					val age = t - b.born
					val r = radius(b, t)
					val aspect = bubble.height.toFloat() / bubble.width
					// Squash and stretch in opposite phase, so the bubble breathes rather than pulses.
					val wobble = sin(age * b.wobbleSpeed + b.phase) * b.wobbleAmount
					canvas.save()
					canvas.translate(b.x, b.y)
					canvas.rotate(b.angle0 + b.spin * age)
					canvas.scale((1f + wobble) * (if (b.flip) -1f else 1f), 1f - wobble)
					dest.set(-r, -r * aspect, r, r * aspect)
					// A gentle shimmer in how see-through it is.
					paint.alpha = (215 + 25 * sin(age * 2.1f + b.phase)).toInt()
					canvas.drawBitmap(bubble, null, dest, paint)
					canvas.restore()
				} else {
					pop ?: continue
					val k = ((t - b.poppedAt) / POP_SECONDS).coerceIn(0f, 1f)
					// Bursts outward fast, then slows, turning a little as it goes.
					val burst = 1f - (1f - k) * (1f - k)
					val half = b.size * (0.8f + burst * 0.8f)
					val aspect = pop.height.toFloat() / pop.width
					canvas.save()
					canvas.translate(b.x, b.y)
					canvas.rotate(b.popAngle + b.popSpin * k)
					dest.set(-half, -half * aspect, half, half * aspect)
					paint.alpha = ((1f - k) * 255).toInt()
					canvas.drawBitmap(pop, null, dest, paint)
					canvas.restore()
				}
			}
		}

		/** The shaders' overlay versions, under the bubbles: film or rainbow, then the pop rings. */
		private fun drawLegacyFx(canvas: Canvas, root: ViewGroup, t: Float) {
			val density = dp(1f)
			val w = root.width.toFloat()
			val h = root.height.toFloat()
			if (film > 0f) {
				val time = (SystemClock.uptimeMillis() - startedAt) / 1000f
				val eased = film * film * (3f - 2f * film)
				if (Settings.look == Looks.NYAN) LegacyBubbleFx.drawRainbow(canvas, w, h, density, time, eased)
				else LegacyBubbleFx.drawFilm(canvas, w, h, density, time, eased)
			}
			for (b in bubbles) if (b.poppedAt >= 0f) LegacyBubbleFx.drawPop(canvas, b.x, b.y, t - b.poppedAt, density)
		}

		private val puffPaint = Paint().apply { isAntiAlias = false }

		/**
		 * Nyan Cat's rainbow puff in place of a soap bubble: a chunky pixel star in one rainbow colour
		 * (by the bubble's drawing, so a stream cycles through them), turning and twinkling; popped, it
		 * bursts into rainbow confetti.
		 */
		private fun drawPuff(canvas: Canvas, b: Bubble, t: Float) {
			val r = radius(b, t)
			val cell = (r / 2.5f).coerceAtLeast(2f)
			if (b.poppedAt < 0f) {
				val age = t - b.born
				puffPaint.color = TrailView.COLOURS[b.variant % TrailView.COLOURS.size]
				puffPaint.alpha = (215 + 40 * sin(age * 6f + b.phase)).toInt().coerceIn(0, 255)
				canvas.save()
				canvas.translate(b.x, b.y)
				canvas.rotate(if ((age * 4f).toInt() % 2 == 0) 0f else 45f)
				// A plus of five cells with a white core.
				for ((dx, dy) in PLUS) canvas.drawRect((dx - 0.5f) * cell, (dy - 0.5f) * cell, (dx + 0.5f) * cell, (dy + 0.5f) * cell, puffPaint)
				puffPaint.color = 0xFFFFFFFF.toInt()
				canvas.drawRect(-0.5f * cell, -0.5f * cell, 0.5f * cell, 0.5f * cell, puffPaint)
				canvas.restore()
			} else {
				val k = ((t - b.poppedAt) / POP_SECONDS).coerceIn(0f, 1f)
				val burst = 1f - (1f - k) * (1f - k)
				for (i in 0 until 8) {
					val a = (i / 8f) * 6.2832f + b.popAngle
					val d = b.size * (0.3f + burst * 0.9f)
					puffPaint.color = TrailView.COLOURS[(i + b.variant) % TrailView.COLOURS.size]
					puffPaint.alpha = ((1f - k) * 255).toInt()
					val x = b.x + cos(a) * d
					val y = b.y + sin(a) * d
					canvas.drawRect(x - cell / 2f, y - cell / 2f, x + cell / 2f, y + cell / 2f, puffPaint)
				}
			}
		}

		override fun setAlpha(alpha: Int) {}

		override fun setColorFilter(colorFilter: ColorFilter?) {}

		@Deprecated("Deprecated in Java")
		override fun getOpacity() = PixelFormat.TRANSLUCENT
	}
}
