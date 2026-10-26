package com.bleelblep.screeneffects

import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Particle bursts and the charge-up ring, drawn into a window root's [View.getOverlay]. Plain
 * Canvas drawing, so unlike the shader effects this works on every Android version. The layer adds
 * itself to the overlay while it has something to draw and removes itself when it is idle, so an
 * idle window pays nothing.
 */

internal enum class ParticleKind(val id: String, val pickable: Boolean = true) {
	SPARKS("sparks"),
	CONFETTI("confetti"),
	RAINBOW_BUBBLES("rainbowbubbles"),
	/** Shimeji's Nyan Cat puffs. Drawn by [RainbowPuffs], never as [Particle]s. */
	RAINBOW_PUFFS("rainbowpuffs"),
	HEARTS("hearts"),
	STARS("stars"),
	CUSTOM("custom"),
	/** Two parallel streaks of flame burning in from the tap, with a crackle of blue electricity. */
	FIRE_TRAILS("firetrails"),
	/** Glowing orbs that float up. Only the level-up celebration uses them; not offered as particles. */
	XP("xp", pickable = false),
	;

	companion object {
		fun of(id: String) = entries.firstOrNull { it.id == id }
	}
}

private class Particle(
	val kind: ParticleKind,
	var x: Float,
	var y: Float,
	var vx: Float,
	var vy: Float,
	val life: Float,
	val size: Float,
	val color: Int,
	var rotation: Float,
	val spin: Float,
	val seed: Float,
	val sprite: Sprite? = null,
	/** Screen-wide rain: steady speed and a gentle sway instead of the kind's burst physics. */
	val rain: Boolean = false,
	/** Seconds before it appears (part of [life]): fire trails burn in along their length. */
	val delay: Float = 0f,
) {
	var age = 0f
}

private val SPARK_COLORS = intArrayOf(0xFFFFE58A.toInt(), 0xFFFFC04D.toInt(), 0xFFFF9A3D.toInt(), 0xFFFF6B3D.toInt())
private val CONFETTI_COLORS = intArrayOf(
	0xFFFF4F79.toInt(), 0xFFFFC43D.toInt(), 0xFF3DDC97.toInt(), 0xFF4CC9F0.toInt(),
	0xFF7B61FF.toInt(), 0xFFFF8A3D.toInt(),
)
private val HEART_COLORS = intArrayOf(0xFFFF4F79.toInt(), 0xFFFF6B9A.toInt(), 0xFFE0245E.toInt(), 0xFFFF8FB1.toInt())
private val STAR_COLORS = intArrayOf(0xFFFFD84D.toInt(), 0xFFFFF1A8.toInt(), 0xFFFFB800.toInt(), 0xFFFFFFFF.toInt())
private val FIRE_COLORS = intArrayOf(0xFFFFE27A.toInt(), 0xFFFFB238.toInt(), 0xFFFF7A1F.toInt(), 0xFFFF4A1A.toInt())
private val ELECTRIC_COLORS = intArrayOf(0xFFBFE6FF.toInt(), 0xFF7CC8FF.toInt(), 0xFFFFFFFF.toInt(), 0xFF4FA8FF.toInt())
private val XP_COLORS = intArrayOf(0xFFB6FF3B.toInt(), 0xFFD4FF4F.toInt(), 0xFF8CE62E.toInt(), 0xFFEFFF6B.toInt())

/** Hollow pixel bubble with a stepped outline and a tiny upper-left shine. */
private val BUBBLE_PIXELS = arrayOf(
	"...####...", "..#....#..", ".#.+....#.", "#.+......#", "#........#",
	"#........#", "#........#", ".#......#.", "..#....#..", "...####...",
)

/** Unit heart, about 1 wide and 1 tall, centred on the origin. */
private val HEART: Path = Path().apply {
	moveTo(0f, 0.35f)
	cubicTo(-0.55f, -0.05f, -0.5f, -0.55f, -0.12f, -0.45f)
	cubicTo(-0.05f, -0.43f, 0f, -0.36f, 0f, -0.3f)
	cubicTo(0f, -0.36f, 0.05f, -0.43f, 0.12f, -0.45f)
	cubicTo(0.5f, -0.55f, 0.55f, -0.05f, 0f, 0.35f)
	close()
}

/** Unit five-point star, radius 0.5. */
private val STAR: Path = Path().apply {
	for (i in 0 until 10) {
		val r = if (i % 2 == 0) 0.5f else 0.21f
		val a = -PI / 2 + i * PI / 5
		val px = (cos(a) * r).toFloat()
		val py = (sin(a) * r).toFloat()
		if (i == 0) moveTo(px, py) else lineTo(px, py)
	}
	close()
}

/** How long a full charge takes, in milliseconds. */
internal const val CHARGE_FULL_MS = 1200f

/** How long the power mode counter stays up after the last keystroke. */
private const val COMBO_VISIBLE_MS = 1600L

/** How long a banner stays up. */
private const val BANNER_MS = 1800L

internal class ParticleLayer(view: View) : Drawable() {
	/** A charge in progress: the ring grows while the finger is held. */
	private class Charge(val x: Float, val y: Float, val startedAt: Long)
	private class PixelBanner(val path: Path, val width: Int, val x: Float, val y: Float, val colors: IntArray, val at: Long)
	private class Combo(val count: Int, val best: Int?, val x: Float, val y: Float, val at: Long)
	private class Banner(val text: String, val x: Float, val y: Float, val at: Long)

	private val viewRef = WeakReference(view)
	private val particles = ArrayList<Particle>()
	private var charge: Charge? = null
	private var combo: Combo? = null
	private var banner: Banner? = null
	private var pixelBanner: PixelBanner? = null
	private var attached = false
	private var running = false
	private var lastFrameNanos = 0L

	private val density = Resources.getSystem().displayMetrics.density
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private val bubblePaint = Paint()
	private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
	private val spritePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
		textAlign = Paint.Align.CENTER
	}
	private val spriteRect = RectF()
	private val comboPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		textAlign = Paint.Align.RIGHT
		typeface = android.graphics.Typeface.DEFAULT_BOLD
	}
	private val bannerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		textAlign = Paint.Align.CENTER
		typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD_ITALIC)
	}

	private val frameCallback = Choreographer.FrameCallback { now -> step(now) }

	/** Main thread only. [x]/[y] are relative to the view. */
	/**
	 * [countMul] scales how many fly: power mode throws a few per keystroke instead of a full burst.
	 * [sprites] is what Custom throws: the tap list unless power mode passes its own.
	 */
	fun burst(requested: ParticleKind, x: Float, y: Float, strength: Float, countMul: Float = 1f, sprites: List<Sprite> = CustomSprites.sprites) {
		// Custom with nothing loaded (empty input, or images still downloading) falls back to stars.
		if (requested == ParticleKind.RAINBOW_PUFFS) {
			viewRef.get()?.let { RainbowPuffs.play(it, x, y, strength, countMul) }
			return
		}
		val kind = if (requested == ParticleKind.CUSTOM && sprites.isEmpty()) ParticleKind.STARS else requested
		val f = (strength / 0.6f).coerceIn(0.5f, 2.5f)
		val countScale = sqrt(f) * countMul
		val d = density
		fun rnd(a: Float, b: Float) = a + Random.nextFloat() * (b - a)
		fun pick(colors: IntArray) = colors[Random.nextInt(colors.size)]

		when (kind) {
			ParticleKind.RAINBOW_PUFFS -> {}
			ParticleKind.RAINBOW_BUBBLES -> repeat(maxOf(1, (12 * countScale).toInt())) {
				// A separate cap keeps repeated taps from accumulating long-lived bubbles indefinitely.
				if (particles.count { it.kind == ParticleKind.RAINBOW_BUBBLES } >= 120) return@repeat
				particles += Particle(kind, x + rnd(-8f, 8f) * d, y, rnd(-75f, 75f) * d,
					-rnd(90f, 180f) * d * sqrt(f), rnd(1.5f, 2.3f), rnd(18f, 32f) * d,
					pick(RAINBOW_COLORS), 0f, 0f, rnd(0f, 10f))
			}
			ParticleKind.SPARKS -> repeat(maxOf(1, (18 * countScale).toInt())) {
				val a = rnd(0f, 2f * PI.toFloat())
				val speed = rnd(380f, 900f) * d * sqrt(f)
				particles += Particle(kind, x, y, cos(a) * speed, sin(a) * speed, rnd(0.35f, 0.65f),
					rnd(1.5f, 2.6f) * d, pick(SPARK_COLORS), 0f, 0f, 0f)
			}
			ParticleKind.CONFETTI -> repeat(maxOf(1, (30 * countScale).toInt())) {
				val a = -PI.toFloat() / 2 + rnd(-1.1f, 1.1f)
				val speed = rnd(450f, 1050f) * d * sqrt(f)
				particles += Particle(kind, x, y, cos(a) * speed, sin(a) * speed, rnd(1.4f, 2.0f),
					rnd(0.8f, 1.2f) * d, pick(CONFETTI_COLORS), rnd(0f, 360f), rnd(-720f, 720f), rnd(0f, 10f))
			}
			ParticleKind.HEARTS -> repeat(maxOf(1, (8 * countScale).toInt())) {
				particles += Particle(kind, x + rnd(-10f, 10f) * d, y, rnd(-90f, 90f) * d, -rnd(140f, 280f) * d * sqrt(f),
					rnd(0.9f, 1.3f), rnd(16f, 26f) * d, pick(HEART_COLORS), rnd(-15f, 15f), 0f, rnd(0f, 10f))
			}
			ParticleKind.CUSTOM -> repeat(maxOf(1, (10 * countScale).toInt())) {
				val a = -PI.toFloat() / 2 + rnd(-1.4f, 1.4f)
				val speed = rnd(260f, 620f) * d * sqrt(f)
				particles += Particle(kind, x, y, cos(a) * speed, sin(a) * speed, rnd(0.9f, 1.3f),
					rnd(24f, 34f) * d, 0, rnd(-20f, 20f), rnd(-180f, 180f), rnd(0f, 10f),
					sprites[Random.nextInt(sprites.size)])
			}
			ParticleKind.XP -> repeat(maxOf(1, (7 * countScale).toInt())) {
				val a = rnd(0f, 2f * PI.toFloat())
				val speed = rnd(120f, 320f) * d * sqrt(f)
				particles += Particle(kind, x, y, cos(a) * speed, sin(a) * speed - 80f * d, rnd(1.0f, 1.5f),
					rnd(4f, 7f) * d, pick(XP_COLORS), 0f, 0f, rnd(0f, 10f))
			}
			ParticleKind.FIRE_TRAILS -> {
				// Two lines of flame a tyre-width apart, lit from the tap outward at 900 dp/s.
				val a = rnd(0f, 2f * PI.toFloat())
				val dirX = cos(a)
				val dirY = sin(a)
				val gap = 9f * d
				val length = rnd(150f, 230f) * d * sqrt(f) * (0.35f + 0.65f * min(countMul, 1f))
				val step = 7f * d
				for (side in intArrayOf(-1, 1)) for (i in 0 until (length / step).toInt()) {
					val along = i * step
					val delay = along / (900f * d)
					particles += Particle(kind,
						x + dirX * along - dirY * gap * side + rnd(-1.5f, 1.5f) * d,
						y + dirY * along + dirX * gap * side + rnd(-1.5f, 1.5f) * d,
						0f, -rnd(10f, 30f) * d, delay + rnd(0.7f, 1.1f), rnd(5f, 8f) * d,
						pick(FIRE_COLORS), 0f, 0f, rnd(0f, 10f), delay = delay)
				}
				repeat(maxOf(1, (7 * countScale).toInt())) {
					val sa = rnd(0f, 2f * PI.toFloat())
					val speed = rnd(300f, 700f) * d * sqrt(f)
					particles += Particle(ParticleKind.SPARKS, x, y, cos(sa) * speed, sin(sa) * speed, rnd(0.2f, 0.4f),
						rnd(1.2f, 2f) * d, pick(ELECTRIC_COLORS), 0f, 0f, 0f)
				}
			}
			ParticleKind.STARS -> repeat(maxOf(1, (12 * countScale).toInt())) {
				val a = rnd(0f, 2f * PI.toFloat())
				val speed = rnd(250f, 620f) * d * sqrt(f)
				particles += Particle(kind, x, y, cos(a) * speed, sin(a) * speed, rnd(0.7f, 1.0f),
					rnd(12f, 22f) * d, pick(STAR_COLORS), rnd(0f, 72f), rnd(-360f, 360f), rnd(0f, 10f))
			}
		}
		ensureRunning()
	}

	/**
	 * Fills the view with falling (or, for hearts, rising) particles for a message effect.
	 * Custom falls back to stars when nothing is loaded, as with bursts.
	 */
	fun rain(requested: ParticleKind, count: Int) {
		val view = viewRef.get() ?: return
		val sprites = CustomSprites.sprites
		// Puffs have no rain form; rainbow bubbles are the nearest. Fire trails rain as sparks.
		val wanted = when (requested) {
			ParticleKind.RAINBOW_PUFFS -> ParticleKind.RAINBOW_BUBBLES
			ParticleKind.FIRE_TRAILS -> ParticleKind.SPARKS
			else -> requested
		}
		val kind = if (wanted == ParticleKind.CUSTOM && sprites.isEmpty()) ParticleKind.STARS else wanted
		val d = density
		val w = view.width.toFloat()
		val h = view.height.toFloat()
		fun rnd(a: Float, b: Float) = a + Random.nextFloat() * (b - a)
		val rising = kind == ParticleKind.HEARTS || kind == ParticleKind.RAINBOW_BUBBLES
		val colors = when (kind) {
			ParticleKind.RAINBOW_BUBBLES -> RAINBOW_COLORS
			ParticleKind.SPARKS -> SPARK_COLORS
			ParticleKind.CONFETTI -> CONFETTI_COLORS
			ParticleKind.HEARTS -> HEART_COLORS
			ParticleKind.XP -> XP_COLORS
			else -> STAR_COLORS
		}
		repeat(count) {
			val speed = rnd(260f, 520f) * d
			val life = (h + 80f * d) / speed + rnd(0f, 0.6f)
			val size = when (kind) {
				ParticleKind.CONFETTI -> rnd(0.9f, 1.4f) * d
				ParticleKind.SPARKS -> rnd(1.5f, 2.6f) * d
				ParticleKind.XP -> rnd(5f, 8f) * d
				else -> rnd(18f, 30f) * d
			}
			particles += Particle(
				kind,
				rnd(0f, w),
				if (rising) h + rnd(10f, 200f) * d else -rnd(10f, 200f) * d,
				rnd(-30f, 30f) * d,
				if (rising) -speed else speed,
				life, size, colors[Random.nextInt(colors.size)],
				rnd(0f, 360f), rnd(-240f, 240f), rnd(0f, 10f),
				if (kind == ParticleKind.CUSTOM) sprites[Random.nextInt(sprites.size)] else null,
				rain = true,
			)
		}
		ensureRunning()
	}

	/**
	 * Power mode's counter, drawn right-aligned at [x], [y], with the high score under it when
	 * [best] is given; fades after a pause in typing.
	 */
	fun showCombo(count: Int, best: Int?, x: Float, y: Float) {
		combo = Combo(count, best, x, y, SystemClock.uptimeMillis())
		ensureRunning()
	}

	/** A big centred callout ("NEW HIGH SCORE!") that pops in, wobbles and fades. */
	fun showBanner(text: String, x: Float, y: Float) {
		banner = Banner(text, x, y, SystemClock.uptimeMillis())
		ensureRunning()
	}

	/** A pixel-font callout (the font in Arcade.kt) with a gradient fill, e.g. "LEVEL UP!". */
	fun showPixelBanner(text: String, x: Float, y: Float, colors: IntArray) {
		pixelBanner = PixelBanner(PixelFont.path(text), PixelFont.width(text), x, y, colors, SystemClock.uptimeMillis())
		ensureRunning()
	}

	/** The charge ring under the finger (see [Charge]). */
	fun startCharge(x: Float, y: Float) {
		charge = Charge(x, y, SystemClock.uptimeMillis())
		ensureRunning()
	}

	/** Ends the ring; returns how charged it was, 0 to 1. */
	fun endCharge(): Float {
		val c = charge ?: return 0f
		charge = null
		invalidateSelf()
		return ((SystemClock.uptimeMillis() - c.startedAt) / CHARGE_FULL_MS).coerceIn(0f, 1f)
	}

	fun clear() {
		particles.clear()
		charge = null
		combo = null
		banner = null
		pixelBanner = null
		running = false
		Choreographer.getInstance().removeFrameCallback(frameCallback)
		detach()
	}

	private fun ensureRunning() {
		attach()
		if (running) return
		running = true
		lastFrameNanos = 0L
		Choreographer.getInstance().postFrameCallback(frameCallback)
	}

	private fun attach() {
		val view = viewRef.get() ?: return
		setBounds(0, 0, view.width, view.height)
		if (!attached) {
			view.overlay.add(this)
			attached = true
		}
	}

	private fun detach() {
		if (!attached) return
		attached = false
		viewRef.get()?.overlay?.remove(this)
	}

	private fun step(frameNanos: Long) {
		val dt = if (lastFrameNanos == 0L) 1f / 60f else min((frameNanos - lastFrameNanos) / 1e9f, 0.05f)
		lastFrameNanos = frameNanos
		val d = density

		val it = particles.iterator()
		while (it.hasNext()) {
			val p = it.next()
			p.age += dt
			if (p.age >= p.life) {
				it.remove()
				continue
			}
			if (p.age < p.delay) continue
			if (p.rain) {
				p.x += sin(p.age * 3f + p.seed) * 40f * d * dt
			} else when (p.kind) {
				ParticleKind.RAINBOW_PUFFS -> {}
				ParticleKind.RAINBOW_BUBBLES -> {
					p.vx *= exp(-1.4f * dt)
					p.vy -= 12f * d * dt
					p.x += sin(p.age * 3.5f + p.seed) * 24f * d * dt
				}
				ParticleKind.SPARKS -> {
					p.vy += 700f * d * dt
					val drag = exp(-1.5f * dt)
					p.vx *= drag; p.vy *= drag
				}
				ParticleKind.CONFETTI -> {
					val drag = exp(-2.4f * dt)
					p.vx *= drag; p.vy *= drag
					p.vy += 1100f * d * dt
					p.vx += sin(p.age * 7f + p.seed) * 140f * d * dt
				}
				ParticleKind.HEARTS -> {
					val drag = exp(-1.2f * dt)
					p.vx *= drag; p.vy *= drag
					p.vy -= 40f * d * dt
					p.x += sin(p.age * 6f + p.seed) * 28f * d * dt
				}
				ParticleKind.STARS -> {
					val drag = exp(-3.8f * dt)
					p.vx *= drag; p.vy *= drag
				}
				ParticleKind.FIRE_TRAILS -> p.vy *= exp(-2f * dt)
				ParticleKind.CUSTOM -> {
					val drag = exp(-2.2f * dt)
					p.vx *= drag; p.vy *= drag
					p.vy += 700f * d * dt
				}
				ParticleKind.XP -> {
					val drag = exp(-2.6f * dt)
					p.vx *= drag; p.vy *= drag
					p.vy -= 90f * d * dt
					p.x += sin(p.age * 5f + p.seed) * 22f * d * dt
				}
			}
			p.x += p.vx * dt
			p.y += p.vy * dt
			p.rotation += p.spin * dt
		}

		invalidateSelf()
		val comboVisible = combo?.let { SystemClock.uptimeMillis() - it.at < COMBO_VISIBLE_MS } == true
		if (!comboVisible) combo = null
		val bannerVisible = banner?.let { SystemClock.uptimeMillis() - it.at < BANNER_MS } == true
		if (!bannerVisible) banner = null
		val pixelVisible = pixelBanner?.let { SystemClock.uptimeMillis() - it.at < BANNER_MS } == true
		if (!pixelVisible) pixelBanner = null
		if (particles.isEmpty() && charge == null && !comboVisible && !bannerVisible && !pixelVisible) {
			running = false
			detach()
		} else {
			Choreographer.getInstance().postFrameCallback(frameCallback)
		}
	}

	override fun draw(canvas: Canvas) {
		val d = density
		for (p in particles) {
			if (p.age < p.delay) continue
			val lifeLeft = 1f - p.age / p.life
			when (p.kind) {
				ParticleKind.FIRE_TRAILS -> {
					// A flickering teardrop of flame with a hot core; white-hot for its first moment.
					val local = p.age - p.delay
					val k = local / (p.life - p.delay)
					val flick = 0.75f + 0.25f * sin(local * 30f + p.seed * 7f)
					val height = p.size * (1.6f + 0.8f * flick) * (1f - k * 0.6f)
					val fade = min(1f, (1f - k) / 0.4f)
					paint.style = Paint.Style.FILL
					paint.color = p.color
					paint.alpha = (230 * fade).toInt()
					spriteRect.set(p.x - p.size / 2f, p.y - height, p.x + p.size / 2f, p.y + p.size * 0.35f)
					canvas.drawOval(spriteRect, paint)
					paint.color = 0xFFFFF4C2.toInt()
					paint.alpha = (200 * fade * flick).toInt()
					spriteRect.set(p.x - p.size / 4f, p.y - height * 0.55f, p.x + p.size / 4f, p.y + p.size * 0.2f)
					canvas.drawOval(spriteRect, paint)
					if (local < 0.08f) {
						paint.color = 0xFFFFFFFF.toInt()
						paint.alpha = (180 * (1f - local / 0.08f)).toInt()
						canvas.drawCircle(p.x, p.y - p.size * 0.3f, p.size * 0.9f, paint)
					}
				}
				ParticleKind.RAINBOW_PUFFS -> {}
				ParticleKind.RAINBOW_BUBBLES -> {
					val fade = min(1f, lifeLeft / 0.25f)
					val scale = p.size * (0.7f + 0.3f * min(1f, p.age / 0.18f)) / 10f
					val left = p.x - scale * 5f
					val top = p.y - scale * 5f
					for (row in BUBBLE_PIXELS.indices) for (col in BUBBLE_PIXELS[row].indices) {
						val pixel = BUBBLE_PIXELS[row][col]
						if (pixel == '.') continue
						bubblePaint.color = if (pixel == '+') 0xFFFFFFFF.toInt() else
							RAINBOW_COLORS[(row / 2 + (p.seed + p.age * 3f).toInt()) % RAINBOW_COLORS.size]
						bubblePaint.alpha = (fade * 230).toInt()
						canvas.drawRect(left + col * scale, top + row * scale,
							left + (col + 1) * scale, top + (row + 1) * scale, bubblePaint)
					}
				}
				ParticleKind.SPARKS -> {
					paint.style = Paint.Style.STROKE
					paint.strokeCap = Paint.Cap.ROUND
					paint.strokeWidth = p.size
					paint.color = p.color
					paint.alpha = (255 * lifeLeft).toInt()
					canvas.drawLine(p.x, p.y, p.x - p.vx * 0.035f, p.y - p.vy * 0.035f, paint)
				}
				ParticleKind.CONFETTI -> {
					paint.style = Paint.Style.FILL
					paint.color = p.color
					paint.alpha = (255 * min(1f, lifeLeft / 0.3f)).toInt()
					val flip = cos(p.age * 9f + p.seed)
					canvas.save()
					canvas.translate(p.x, p.y)
					canvas.rotate(p.rotation)
					canvas.scale(flip, 1f)
					canvas.drawRect(-2.5f * p.size, -4.5f * p.size, 2.5f * p.size, 4.5f * p.size, paint)
					canvas.restore()
				}
				ParticleKind.HEARTS -> {
					paint.style = Paint.Style.FILL
					paint.color = p.color
					paint.alpha = (255 * min(1f, lifeLeft / 0.4f)).toInt()
					val pop = min(1f, p.age / 0.15f)
					val s = p.size * (0.4f + 0.6f * pop)
					canvas.save()
					canvas.translate(p.x, p.y)
					canvas.rotate(p.rotation)
					canvas.scale(s, s)
					canvas.drawPath(HEART, paint)
					canvas.restore()
				}
				ParticleKind.CUSTOM -> {
					val pop = min(1f, p.age / 0.12f)
					val s = p.size * (0.5f + 0.5f * pop)
					spritePaint.alpha = (255 * min(1f, lifeLeft / 0.35f)).toInt()
					canvas.save()
					canvas.translate(p.x, p.y)
					canvas.rotate(p.rotation)
					when (val sprite = p.sprite) {
						is Sprite.Glyph -> {
							spritePaint.textSize = s
							val fm = spritePaint.fontMetrics
							canvas.drawText(sprite.text, 0f, -(fm.ascent + fm.descent) / 2f, spritePaint)
						}
						is Sprite.Image -> {
							val b = sprite.bitmap
							val scale = s / maxOf(b.width, b.height)
							val hw = b.width * scale / 2f
							val hh = b.height * scale / 2f
							spriteRect.set(-hw, -hh, hw, hh)
							canvas.drawBitmap(b, null, spriteRect, spritePaint)
						}
						null -> {}
					}
					canvas.restore()
				}
				ParticleKind.XP -> {
					paint.style = Paint.Style.FILL
					val a = min(1f, lifeLeft / 0.35f)
					val pulse = 1f + 0.18f * sin(p.age * 14f + p.seed)
					val r = p.size * pulse
					paint.color = p.color
					paint.alpha = (70 * a).toInt()
					canvas.drawCircle(p.x, p.y, r * 1.9f, paint)
					paint.alpha = (255 * a).toInt()
					canvas.drawCircle(p.x, p.y, r, paint)
					paint.color = 0xFFFFFFB0.toInt()
					paint.alpha = (230 * a).toInt()
					canvas.drawCircle(p.x - r * 0.25f, p.y - r * 0.25f, r * 0.4f, paint)
				}
				ParticleKind.STARS -> {
					paint.style = Paint.Style.FILL
					paint.color = p.color
					val twinkle = 0.7f + 0.3f * sin(p.age * 25f + p.seed)
					paint.alpha = (255 * lifeLeft * twinkle).toInt().coerceIn(0, 255)
					canvas.save()
					canvas.translate(p.x, p.y)
					canvas.rotate(p.rotation)
					canvas.scale(p.size, p.size)
					canvas.drawPath(STAR, paint)
					canvas.restore()
				}
			}
		}

		combo?.let { k ->
			val since = SystemClock.uptimeMillis() - k.at
			val pop = 1f + 0.35f * (1f - min(1f, since / 120f))
			val fade = 1f - ((since - (COMBO_VISIBLE_MS - 400L)).coerceAtLeast(0L) / 400f)
			comboPaint.textSize = (14f + min(k.count, 50) * 0.25f) * d * pop
			comboPaint.color = if (k.count >= 25) 0xFFFF6B3D.toInt() else if (k.count >= 10) 0xFFFFC04D.toInt() else 0xFFFFFFFF.toInt()
			comboPaint.alpha = (255 * fade.coerceIn(0f, 1f)).toInt()
			comboPaint.setShadowLayer(4f * d, 0f, 1f * d, 0xB0000000.toInt())
			canvas.save()
			CounterMotion.apply(canvas, CounterMotion.ARCADE, k.at, k.count, SystemClock.uptimeMillis(), k.x - 40f * d, k.y - 8f * d)
			canvas.drawText("COMBO x${k.count}", k.x, k.y, comboPaint)
			k.best?.let { best ->
				val size = comboPaint.textSize
				comboPaint.textSize = 11f * d
				comboPaint.color = if (k.count >= best) 0xFFFFD84D.toInt() else 0xFFFFFFFF.toInt()
				comboPaint.alpha = (220 * fade.coerceIn(0f, 1f)).toInt()
				canvas.drawText("BEST $best", k.x, k.y + size * 0.2f + 13f * d, comboPaint)
			}
			canvas.restore()
		}

		banner?.let { b ->
			val since = (SystemClock.uptimeMillis() - b.at).toFloat()
			val pop = if (since < 180f) 0.4f + 0.8f * (since / 180f) else 1.2f - 0.2f * min(1f, (since - 180f) / 200f)
			val fade = 1f - ((since - (BANNER_MS - 500L)).coerceAtLeast(0f) / 500f)
			val wobble = sin(since / 70f) * 3f * (1f - min(1f, since / 900f))
			canvas.save()
			canvas.translate(b.x, b.y)
			canvas.rotate(wobble - 4f)
			canvas.scale(pop, pop)
			bannerPaint.textSize = 30f * d
			bannerPaint.setShadowLayer(8f * d, 0f, 2f * d, 0xC0000000.toInt())
			bannerPaint.color = 0xFFFFD84D.toInt()
			bannerPaint.alpha = (255 * fade.coerceIn(0f, 1f)).toInt()
			canvas.drawText(b.text, 0f, 0f, bannerPaint)
			canvas.restore()
		}

		pixelBanner?.let { b ->
			val since = (SystemClock.uptimeMillis() - b.at).toFloat()
			val pop = if (since < 160f) 0.3f + 0.9f * (since / 160f) else 1.2f - 0.2f * min(1f, (since - 160f) / 200f)
			val fade = 1f - ((since - (BANNER_MS - 500L)).coerceAtLeast(0f) / 500f)
			val pixel = 4.5f * d
			val a = (255 * fade.coerceIn(0f, 1f)).toInt()
			canvas.save()
			canvas.translate(b.x, b.y - since * 0.012f * d)
			canvas.scale(pop, pop)
			canvas.translate(-b.width * pixel / 2f, -PixelFont.HEIGHT * pixel / 2f)
			canvas.scale(pixel, pixel)
			paint.shader = null
			paint.style = Paint.Style.FILL
			paint.color = 0xFF1B3A0B.toInt()
			paint.alpha = a
			canvas.save()
			canvas.translate(0.5f, 0.5f)
			canvas.drawPath(b.path, paint)
			canvas.restore()
			paint.style = Paint.Style.STROKE
			paint.strokeWidth = 0.4f
			paint.color = 0xFF000000.toInt()
			paint.alpha = a
			canvas.drawPath(b.path, paint)
			paint.style = Paint.Style.FILL
			paint.shader = android.graphics.LinearGradient(
				0f, 0f, 0f, PixelFont.HEIGHT.toFloat(), b.colors, null, android.graphics.Shader.TileMode.CLAMP,
			)
			paint.alpha = a
			canvas.drawPath(b.path, paint)
			paint.shader = null
			canvas.restore()
		}

		val c = charge ?: return
		val held = ((SystemClock.uptimeMillis() - c.startedAt) / CHARGE_FULL_MS).coerceIn(0f, 1f)
		val full = held >= 1f
		val pulse = if (full) 1f + 0.08f * sin(SystemClock.uptimeMillis() / 60f) else 1f
		val radius = (18f + 42f * held) * d * pulse

		// Dark halo under a light ring, so it reads on light and dark themes alike.
		ringPaint.strokeWidth = 6f * d
		ringPaint.color = 0x40000000
		canvas.drawCircle(c.x, c.y, radius, ringPaint)
		ringPaint.strokeWidth = 3f * d
		ringPaint.color = if (full) 0xFFFFE58A.toInt() else 0xE6FFFFFF.toInt()
		canvas.drawCircle(c.x, c.y, radius, ringPaint)
		paint.style = Paint.Style.FILL
		paint.color = 0xFFFFFFFF.toInt()
		paint.alpha = (60 * held).toInt()
		canvas.drawCircle(c.x, c.y, radius, paint)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity() = PixelFormat.TRANSLUCENT
}
