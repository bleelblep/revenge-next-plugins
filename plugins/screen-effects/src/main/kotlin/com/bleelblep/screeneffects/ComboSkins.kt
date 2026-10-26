package com.bleelblep.screeneffects

import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import java.util.WeakHashMap
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/*
 * Combo skins: different looks, sounds and rules for power mode's combo. The Arcade skin (the
 * original: COMBO xN, punches and the announcer, the arcade finish) stays in Extras.kt/Arcade.kt;
 * everything else is here. Each skin gets every keystroke ([ComboSkin.onKey]), draws its own counter
 * above the text box ([ComboSkin.drawHud]) and its own new-high-score finish
 * ([ComboSkin.celebrate]). The finishes never take over the screen, so they don't interrupt typing.
 *
 * All art is drawn in code and every sound is synthesised by tools/make_skin_sounds.py, so nothing
 * here belongs to the games that inspired the skins. Names are by genre for the same reason.
 */

private val dp get() = Resources.getSystem().displayMetrics.density

private fun col(v: Long) = v.toInt()

private fun rand(from: Float, to: Float) = from + Random.nextFloat() * (to - from)

private fun easeOut(x: Float) = 1f - (1f - x.coerceIn(0f, 1f)).let { it * it * it }

/** Overshoots a little before settling at 1: the "pop" of a stamp landing. */
private fun easeOutBack(x: Float): Float {
	val t = x.coerceIn(0f, 1f) - 1f
	return 1f + 2.7f * t * t * t + 1.7f * t * t
}

private object Faces {
	val serif: Typeface by lazy { Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC) }
	val bold: Typeface = Typeface.DEFAULT_BOLD
	val condensed: Typeface by lazy { Typeface.create("sans-serif-condensed", Typeface.BOLD_ITALIC) }
	val black: Typeface by lazy { Typeface.create(Typeface.create("sans-serif-black", Typeface.NORMAL), Typeface.ITALIC) }
	val mono: Typeface by lazy { Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) }
	/** Android's built-in handwriting face (Coming Soon); soft and round for Cosy. */
	val casual: Typeface by lazy { Typeface.create("casual", Typeface.BOLD) }
}

private fun Paint.fresh(): Paint {
	reset()
	isAntiAlias = true
	return this
}

// ---------------------------------------------------------------------------------------------
// Effects: short-lived things drawn on a skin layer
// ---------------------------------------------------------------------------------------------

/** One effect. [delay] seconds pass before it starts; [life] is how long it lasts after that. */
internal abstract class Fx(val life: Float, val delay: Float = 0f) {
	var age = 0f
	val active get() = age >= delay
	val done get() = age >= delay + life
	/** Seconds since it started (after the delay). */
	val a get() = (age - delay).coerceAtLeast(0f)
	/** 0 to 1 over its life. */
	val t get() = (a / life).coerceIn(0f, 1f)
	/** Full until the last [tail] of the life, then fading to nothing. */
	fun fade(tail: Float = 0.3f) = ((1f - t) / tail).coerceIn(0f, 1f)
	open fun step(dt: Float) {}
	abstract fun draw(c: Canvas, p: Paint, w: Int, h: Int)
}

internal enum class Shape { DOT, SQUARE, STREAK, FLAME, EMBER, SMOKE, LEAF, PETAL, GLYPH, COIN, SPARKLE }

private val FLAME_COLORS = intArrayOf(col(0xFFFFF3A0), col(0xFFFFC23D), col(0xFFFF7A1F), col(0xFFE8331C))

private fun lerpColor(a: Int, b: Int, f: Float): Int {
	val k = f.coerceIn(0f, 1f)
	return Color.argb(
		(Color.alpha(a) + (Color.alpha(b) - Color.alpha(a)) * k).toInt(),
		(Color.red(a) + (Color.red(b) - Color.red(a)) * k).toInt(),
		(Color.green(a) + (Color.green(b) - Color.green(a)) * k).toInt(),
		(Color.blue(a) + (Color.blue(b) - Color.blue(a)) * k).toInt(),
	)
}

private fun ramp(colors: IntArray, f: Float): Int {
	val x = f.coerceIn(0f, 1f) * (colors.size - 1)
	val i = min(x.toInt(), colors.size - 2)
	return lerpColor(colors[i], colors[i + 1], x - i)
}

/** A particle: position, velocity and simple physics, drawn as one of the [Shape]s. */
internal class Bit(
	var x: Float,
	var y: Float,
	var vx: Float,
	var vy: Float,
	life: Float,
	val size: Float,
	val color: Int,
	val shape: Shape,
	val gravity: Float = 0f,
	val drag: Float = 0f,
	val spin: Float = 0f,
	var rotation: Float = Random.nextFloat() * 360f,
	val sway: Float = 0f,
	val text: String = "",
	delay: Float = 0f,
) : Fx(life, delay) {
	private val seed = Random.nextFloat() * 10f

	override fun step(dt: Float) {
		val k = exp(-drag * dt)
		vx *= k
		vy *= k
		vy += gravity * dt
		x += vx * dt + sin(a * 4f + seed) * sway * dt
		y += vy * dt
		rotation += spin * dt
	}

	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) {
		val fade = fade(0.4f)
		p.fresh().style = Paint.Style.FILL
		p.color = color
		p.alpha = (Color.alpha(color) * fade).toInt()
		when (shape) {
			Shape.DOT -> c.drawCircle(x, y, size, p)
			Shape.SQUARE -> c.drawRect(x - size, y - size, x + size, y + size, p)
			Shape.STREAK -> {
				p.style = Paint.Style.STROKE
				p.strokeCap = Paint.Cap.ROUND
				p.strokeWidth = size
				c.drawLine(x, y, x - vx * 0.035f, y - vy * 0.035f, p)
			}
			Shape.FLAME -> {
				// A soft teardrop that shrinks and cools from yellow to red as it rises.
				val s = size * (1f - t * 0.75f)
				p.color = ramp(FLAME_COLORS, t * 1.1f)
				p.alpha = (200 * fade).toInt()
				c.drawCircle(x, y, s, p)
				c.drawCircle(x, y - s * 0.9f, s * 0.6f, p)
				p.color = ramp(FLAME_COLORS, t * 0.6f)
				p.alpha = (230 * fade).toInt()
				c.drawCircle(x, y + s * 0.15f, s * 0.55f, p)
			}
			Shape.EMBER -> {
				p.alpha = (90 * fade).toInt()
				c.drawCircle(x, y, size * 2.2f, p)
				p.alpha = (255 * fade).toInt()
				c.drawCircle(x, y, size, p)
			}
			Shape.SMOKE -> {
				p.alpha = (110 * fade).toInt()
				c.drawCircle(x, y, size * (1f + t * 1.6f), p)
			}
			Shape.LEAF, Shape.PETAL -> {
				c.save()
				c.translate(x, y)
				c.rotate(rotation)
				// Petals flutter by turning edge-on; leaves only rock.
				val flip = if (shape == Shape.PETAL) 0.35f + 0.65f * abs(cos(a * 5f + seed)) else 1f
				c.scale(flip, 1f)
				val rx = size
				val ry = if (shape == Shape.LEAF) size * 0.45f else size * 0.62f
				c.drawOval(-rx, -ry, rx, ry, p)
				if (shape == Shape.LEAF) {
					p.style = Paint.Style.STROKE
					p.strokeWidth = 0.8f * dp
					p.color = lerpColor(color, Color.BLACK, 0.3f)
					p.alpha = (200 * fade).toInt()
					c.drawLine(-rx * 0.8f, 0f, rx * 0.8f, 0f, p)
				}
				c.restore()
			}
			Shape.GLYPH -> {
				p.typeface = Faces.mono
				p.textSize = size
				p.textAlign = Paint.Align.CENTER
				p.setShadowLayer(4f * dp, 0f, 0f, color)
				c.drawText(text, x, y, p)
			}
			Shape.COIN -> {
				// Spinning: the coin narrows to its edge and back.
				val turn = abs(cos(a * 14f + seed))
				val rx = size * (0.2f + 0.8f * turn)
				p.color = col(0xFFB8860B)
				p.alpha = (255 * fade).toInt()
				c.drawOval(x - rx, y - size, x + rx, y + size, p)
				p.color = col(0xFFFFD84D)
				p.alpha = (255 * fade).toInt()
				c.drawOval(x - rx * 0.78f, y - size * 0.82f, x + rx * 0.78f, y + size * 0.82f, p)
				if (turn > 0.5f) {
					p.color = col(0xFFFFF6C8)
					p.alpha = (220 * fade).toInt()
					c.drawRect(x - rx * 0.12f, y - size * 0.5f, x + rx * 0.12f, y + size * 0.5f, p)
				}
			}
			Shape.SPARKLE -> {
				c.save()
				c.translate(x, y)
				c.rotate(rotation)
				val s = size * (0.6f + 0.4f * sin(a * 18f + seed))
				val path = Path().apply {
					moveTo(0f, -s * 2f)
					lineTo(s * 0.35f, 0f)
					lineTo(0f, s * 2f)
					lineTo(-s * 0.35f, 0f)
					close()
					moveTo(-s * 2f, 0f)
					lineTo(0f, s * 0.35f)
					lineTo(s * 2f, 0f)
					lineTo(0f, -s * 0.35f)
					close()
				}
				c.drawPath(path, p)
				c.restore()
			}
		}
	}
}

/** Text that pops in, optionally rises, and fades out. */
internal class PopText(
	val text: String,
	val x: Float,
	val y: Float,
	life: Float,
	val size: Float,
	val color: Int,
	val face: Typeface,
	val align: Paint.Align = Paint.Align.CENTER,
	val outline: Int = 0,
	val outlineWidth: Float = 0f,
	val rise: Float = 0f,
	val popFrom: Float = 1.6f,
	val popTime: Float = 0.16f,
	val rotation: Float = 0f,
	/** A vertical gradient for the fill, top to bottom, instead of [color]. */
	val gradient: IntArray? = null,
	val glow: Int = 0,
	delay: Float = 0f,
) : Fx(life, delay) {
	private val shader = gradient?.let { LinearGradient(0f, -size * 0.8f, 0f, 0f, it, null, Shader.TileMode.CLAMP) }

	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) {
		val alpha = (255 * fade()).toInt()
		val pop = popFrom + (1f - popFrom) * easeOutBack(a / popTime)
		c.save()
		c.translate(x, y - rise * a)
		c.rotate(rotation)
		c.scale(pop, pop)
		p.fresh().typeface = face
		p.textSize = size
		p.textAlign = align
		if (outlineWidth > 0f) {
			p.style = Paint.Style.STROKE
			p.strokeJoin = Paint.Join.ROUND
			p.strokeWidth = outlineWidth
			p.color = outline
			p.alpha = alpha
			c.drawText(text, 0f, 0f, p)
		}
		p.style = Paint.Style.FILL
		p.color = color
		p.alpha = alpha
		if (shader != null) p.shader = shader
		if (glow != 0) p.setShadowLayer(8f * dp, 0f, 0f, glow)
		else if (outlineWidth == 0f) p.setShadowLayer(4f * dp, 0f, 1f * dp, col(0xB0000000))
		c.drawText(text, 0f, 0f, p)
		c.restore()
	}
}

/** Pixel-font paths, cached: counters redraw the same few strings every frame. */
private object PixelCache {
	private val paths = object : LinkedHashMap<String, Path>(32, 0.75f, true) {
		override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Path>?) = size > 48
	}

	fun path(text: String): Path = paths.getOrPut(text) { PixelFont.path(text) }
}

/** Pixel-font text with a gradient fill, outline and hard shadow, its top-left/centre/right at [x], [y]. */
private fun drawPixelText(
	c: Canvas,
	p: Paint,
	text: String,
	x: Float,
	y: Float,
	pixel: Float,
	colors: IntArray,
	align: Paint.Align = Paint.Align.CENTER,
	alpha: Int = 255,
	scale: Float = 1f,
) {
	val path = PixelCache.path(text)
	val w = PixelFont.width(text) * pixel
	c.save()
	c.translate(x, y + PixelFont.HEIGHT * pixel / 2f)
	c.scale(scale, scale)
	val left = when (align) {
		Paint.Align.CENTER -> -w / 2f
		Paint.Align.RIGHT -> -w
		else -> 0f
	}
	c.translate(left, -PixelFont.HEIGHT * pixel / 2f)
	c.scale(pixel, pixel)
	p.fresh().style = Paint.Style.FILL
	p.color = Color.BLACK
	p.alpha = alpha * 6 / 10
	c.save()
	c.translate(0.5f, 0.5f)
	c.drawPath(path, p)
	c.restore()
	p.style = Paint.Style.STROKE
	p.strokeWidth = 0.4f
	p.alpha = alpha
	c.drawPath(path, p)
	p.style = Paint.Style.FILL
	p.shader = LinearGradient(0f, 0f, 0f, PixelFont.HEIGHT.toFloat(), colors, null, Shader.TileMode.CLAMP)
	p.alpha = alpha
	c.drawPath(path, p)
	c.restore()
}

internal class PixelText(
	val text: String,
	val x: Float,
	val y: Float,
	life: Float,
	val pixel: Float,
	val colors: IntArray,
	val rise: Float = 0f,
	val popFrom: Float = 0.3f,
	delay: Float = 0f,
) : Fx(life, delay) {
	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) {
		val pop = popFrom + (1f - popFrom) * easeOutBack(a / 0.18f)
		drawPixelText(c, p, text, x, y - rise * a, pixel, colors, Paint.Align.CENTER, (255 * fade()).toInt(), pop)
	}
}

/** A circle that grows from [r0] to [r1] and fades: shockwaves, hit explosions. */
internal class Ring(
	val x: Float,
	val y: Float,
	val r0: Float,
	val r1: Float,
	life: Float,
	val color: Int,
	val stroke: Float,
	delay: Float = 0f,
) : Fx(life, delay) {
	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) {
		p.fresh().style = Paint.Style.STROKE
		p.strokeWidth = stroke * (1f - t * 0.6f)
		p.color = color
		p.alpha = (Color.alpha(color) * (1f - t)).toInt()
		c.drawCircle(x, y, r0 + (r1 - r0) * easeOut(t), p)
	}
}

/** The whole window washed in [color], fading out. */
internal class Flash(val color: Int, life: Float, val strength: Float = 0.5f, delay: Float = 0f) : Fx(life, delay) {
	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) {
		p.fresh().color = color
		p.alpha = (255 * strength * (1f - t)).toInt()
		c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), p)
	}
}

/** Anything else, drawn by [fn] with the effect itself (for its age, [Fx.t] and fade). */
internal class Draw(life: Float, delay: Float = 0f, val fn: Draw.(Canvas, Paint, Int, Int) -> Unit) : Fx(life, delay) {
	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) = fn(c, p, w, h)
}

/** A comic-book starburst with a word in it; [halftone] adds the dotted backdrop of a big one. */
internal class ComicBurst(
	val text: String,
	val x: Float,
	val y: Float,
	val radius: Float,
	val fill: Int,
	val edge: Int,
	val ink: Int,
	val rotation: Float,
	life: Float,
	val halftone: Boolean = false,
	delay: Float = 0f,
) : Fx(life, delay) {
	private val star = Path().apply {
		val spikes = 14
		for (i in 0 until spikes * 2) {
			val angle = PI.toFloat() * i / spikes
			val r = if (i % 2 == 0) radius * rand(0.95f, 1.15f) else radius * rand(0.58f, 0.68f)
			val px = cos(angle) * r * 1.25f
			val py = sin(angle) * r
			if (i == 0) moveTo(px, py) else lineTo(px, py)
		}
		close()
	}

	override fun draw(c: Canvas, p: Paint, w: Int, h: Int) {
		val alpha = (255 * fade(0.25f)).toInt()
		val pop = 0.2f + 0.8f * easeOutBack(a / 0.15f)
		val jitter = if (a < 0.12f) rand(-2f, 2f) * dp else 0f
		c.save()
		c.translate(x + jitter, y + jitter)
		c.rotate(rotation)
		c.scale(pop, pop)
		if (halftone) {
			p.fresh().color = edge
			p.alpha = alpha / 3
			val step = 7f * dp
			val reach = radius * 1.9f
			var gy = -reach
			while (gy <= reach) {
				var gx = -reach * 1.25f
				while (gx <= reach * 1.25f) {
					val d = kotlin.math.sqrt(gx * gx / 1.5625f + gy * gy) / reach
					if (d < 1f) c.drawCircle(gx, gy, (1f - d) * 2.6f * dp, p)
					gx += step
				}
				gy += step
			}
		}
		p.fresh().style = Paint.Style.FILL
		p.color = Color.BLACK
		p.alpha = alpha / 2
		c.save()
		c.translate(3f * dp, 4f * dp)
		c.drawPath(star, p)
		c.restore()
		p.color = fill
		p.alpha = alpha
		c.drawPath(star, p)
		p.style = Paint.Style.STROKE
		p.strokeJoin = Paint.Join.MITER
		p.strokeWidth = 3f * dp
		p.color = edge
		p.alpha = alpha
		c.drawPath(star, p)

		p.fresh().typeface = Faces.black
		p.textAlign = Paint.Align.CENTER
		p.textSize = radius * 0.62f
		val fit = (radius * 2.1f) / max(1f, p.measureText(text))
		if (fit < 1f) p.textSize *= fit
		val baseline = p.textSize * 0.36f
		p.style = Paint.Style.STROKE
		p.strokeJoin = Paint.Join.ROUND
		p.strokeWidth = p.textSize * 0.16f
		p.color = Color.BLACK
		p.alpha = alpha
		c.drawText(text, 0f, baseline, p)
		p.style = Paint.Style.FILL
		p.color = ink
		p.alpha = alpha
		c.drawText(text, 0f, baseline, p)
		c.restore()
	}
}

// ---------------------------------------------------------------------------------------------
// The layer the skins draw on
// ---------------------------------------------------------------------------------------------

/** How long a skin's counter stays after the last key, unless the skin keeps it longer. */
private const val HUD_MS = 1600L

/**
 * A Drawable on a window root's overlay, like [ParticleLayer] (which the Arcade skin and the
 * particles keep using): effects, plus the active skin's counter anchored above the text box.
 */
internal class SkinLayer(view: View) : Drawable() {
	private val viewRef = WeakReference(view)
	private val effects = ArrayList<Fx>()
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private var attached = false
	private var running = false
	private var lastFrameNanos = 0L

	val view: View? get() = viewRef.get()

	/** Whose counter is showing, and where: right edge, the text box's top, left edge. */
	var skin: ComboSkin? = null
		private set
	var right = 0f
		private set
	var top = 0f
		private set
	var left = 0f
		private set
	var combo = 0
		private set
	var lastKeyAt = 0L
		private set

	private val frame = Choreographer.FrameCallback { step(it) }

	fun add(fx: Fx) {
		effects += fx
		ensureRunning()
	}

	fun key(skin: ComboSkin, right: Float, top: Float, left: Float, combo: Int) {
		this.skin = skin
		this.right = right
		this.top = top
		this.left = left
		this.combo = combo
		lastKeyAt = SystemClock.uptimeMillis()
		ensureRunning()
	}

	/** Keeps drawing after a run ends, for a counter still draining (Style Rank). */
	fun keepAlive() = ensureRunning()

	val width get() = bounds.width()
	val height get() = bounds.height()

	fun clear() {
		effects.clear()
		skin = null
		running = false
		Choreographer.getInstance().removeFrameCallback(frame)
		detach()
	}

	private fun hudVisible(now: Long): Boolean {
		val s = skin ?: return false
		return Settings.powerCombo && s == ComboSkins.active() && s.hudVisible(now - lastKeyAt)
	}

	private fun ensureRunning() {
		val v = viewRef.get() ?: return
		setBounds(0, 0, v.width, v.height)
		if (!attached) {
			v.overlay.add(this)
			attached = true
		}
		if (running) return
		running = true
		lastFrameNanos = 0L
		Choreographer.getInstance().postFrameCallback(frame)
	}

	private fun detach() {
		if (!attached) return
		attached = false
		viewRef.get()?.overlay?.remove(this)
	}

	private fun step(frameNanos: Long) {
		if (!running) return
		val dt = if (lastFrameNanos == 0L) 1f / 60f else min((frameNanos - lastFrameNanos) / 1e9f, 0.05f)
		lastFrameNanos = frameNanos
		val it = effects.iterator()
		while (it.hasNext()) {
			val fx = it.next()
			val wasActive = fx.active
			fx.age += dt
			if (fx.done) it.remove() else if (wasActive) fx.step(dt)
		}
		invalidateSelf()
		if (effects.isEmpty() && !hudVisible(SystemClock.uptimeMillis())) {
			running = false
			detach()
		} else {
			Choreographer.getInstance().postFrameCallback(frame)
		}
	}

	override fun draw(canvas: Canvas) {
		val w = bounds.width()
		val h = bounds.height()
		for (fx in effects) if (fx.active) runCatching { fx.draw(canvas, paint, w, h) }
		val now = SystemClock.uptimeMillis()
		if (hudVisible(now)) runCatching {
			val s = skin ?: return@runCatching
			val (px, py) = s.motionPivot(this)
			canvas.save()
			try {
				CounterMotion.apply(canvas, s.motion, lastKeyAt, combo, now, px, py)
				s.drawHud(canvas, paint.fresh(), this, now)
			} finally {
				canvas.restore()
			}
		}
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity() = PixelFormat.TRANSLUCENT
}

private val skinLayers = WeakHashMap<View, SkinLayer>()

internal fun skinLayerFor(view: View) = skinLayers.getOrPut(view) { SkinLayer(view) }

internal fun clearSkinLayers() {
	skinLayers.values.toList().forEach { runCatching { it.clear() } }
	skinLayers.clear()
}

// ---------------------------------------------------------------------------------------------
// Skins
// ---------------------------------------------------------------------------------------------

/**
 * One keystroke for a skin. Positions are local to the window root: [x], [y] the cursor; [right],
 * [top] and [left] the text box's edges (inset), for the counter; [gapMs] the time since the last
 * key in this run, or -1 for its first. Every skin builds up with [Key.heat]: more, bigger and
 * louder as the combo climbs.
 */
internal class Key(
	val x: Float,
	val y: Float,
	val right: Float,
	val top: Float,
	val left: Float,
	val combo: Int,
	val gapMs: Long,
	val root: View,
) {
	/** 0 to 1 over the first 40 keys: how hard this key should hit (Arcade's punches build the same way). */
	val heat get() = min(combo, 40) / 40f
}

internal abstract class ComboSkin(val id: String) {
	open fun startRun() {}

	/** Draws and plays this key. False means a miss, which breaks the combo (Rhythm only). */
	abstract fun onKey(layer: SkinLayer, k: Key): Boolean

	open fun hudVisible(sinceKeyMs: Long) = sinceKeyMs < HUD_MS

	/** The counter, above the text box (layer.right / layer.top / layer.left). */
	open fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {}

	/** How this theme's counter moves on each hit and while the combo lasts (CounterMotion.kt). */
	open val motion = Motion(shake = 1f, tilt = 2f, bounce = 1f, sway = 0.5f)

	/** What the counter turns and squashes around: right-aligned counters, so near the right edge. */
	open fun motionPivot(layer: SkinLayer) = layer.right - 40f * dp to layer.top - 20f * dp

	/** A run ended (no key for 1.5s). Called before [celebrate] when it set a record. */
	open fun onRunEnded(layer: SkinLayer, peak: Int, record: Boolean) {}

	/** The new-high-score finish: a full-screen scene in the skin's theme (SkinFinishes.kt). */
	abstract fun finish(peak: Int): FinishScene

	/** The counter's fade after typing stops, and its pop on each key. */
	protected fun hudFade(layer: SkinLayer, now: Long) =
		(1f - ((now - layer.lastKeyAt) - (HUD_MS - 400L)).coerceAtLeast(0L) / 400f).coerceIn(0f, 1f)

	protected fun hudPop(layer: SkinLayer, now: Long, amount: Float = 0.3f) =
		1f + amount * (1f - min(1f, (now - layer.lastKeyAt) / 120f))

	protected fun shakeIfOn(root: View, amp: Float, ms: Long) {
		if (Settings.powerShake) shake(root, amp, ms)
	}
}

internal object ComboSkins {
	const val ARCADE = "arcade"
	val all: List<ComboSkin> = listOf(
		StyleRankSkin, RhythmSkin, PlatformerSkin, OnFireSkin, ShmupSkin, ComicSkin, TerminalSkin, CosySkin, TimeCircuitsSkin,
	)

	fun of(id: String?): ComboSkin? = all.firstOrNull { it.id == id }

	fun valid(id: String?): String? = id?.takeIf { it == ARCADE || of(it) != null }

	/** The chosen skin, or null for Arcade (handled by PowerMode itself). */
	fun active(): ComboSkin? = of(Settings.comboSkin)
}

// ---------------------------------------------------------------------------------------------
// Style Rank: a letter rank that climbs with speed and drains when you slow down
// ---------------------------------------------------------------------------------------------

internal object StyleRankSkin : ComboSkin("stylerank") {
	/** Stylish: a big wobble. */
	override val motion = Motion(shake = 1.2f, tilt = 3f, bounce = 1f, sway = 0.6f)

	private val LETTERS = arrayOf("D", "C", "B", "A", "S", "SS", "SSS")
	private val WORDS = arrayOf("Decent", "Cool", "Bold", "Awesome", "Stylish", "Super stylish", "Supreme style")
	/** Style points needed for each rank. */
	private val NEEDS = floatArrayOf(0f, 22f, 50f, 85f, 125f, 170f, 220f)
	private const val MAX = 260f
	private val COLORS = intArrayOf(
		col(0xFFB8B8C8), col(0xFF5EC8FF), col(0xFF66E07A), col(0xFFFFD84D),
		col(0xFFFFA23D), col(0xFFFF5A36), col(0xFFFF2D55),
	)

	private var points = 0f
	private var updatedAt = 0L
	private var rank = 0
	private var rankAt = 0L
	private var peakRank = 0

	private fun rankOf(p: Float) = NEEDS.indexOfLast { p >= it }.coerceAtLeast(0)

	/** Drains the meter up to [now]: faster at higher ranks, so SSS takes keeping up. */
	private fun drain(now: Long) {
		if (updatedAt != 0L) {
			val dt = (now - updatedAt) / 1000f
			points = max(0f, points - (7f + rank * 4.5f) * dt)
		}
		updatedAt = now
		val r = rankOf(points)
		if (r < rank) {
			rank = r
			rankAt = now
			ComboSounds.sfx("sr_drop", 0.3f)
		}
	}

	override fun startRun() {
		peakRank = rank
	}

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		val now = SystemClock.uptimeMillis()
		drain(now)
		val speed = when {
			k.gapMs in 0..119 -> 4.5f
			k.gapMs in 120..199 -> 2.8f
			k.gapMs in 200..299 -> 1.2f
			else -> 0f
		}
		points = min(MAX, points + 3.2f + speed)
		val r = rankOf(points)
		if (r > rank) {
			rank = r
			rankAt = now
			peakRank = max(peakRank, r)
			layer.add(
				PopText(
					WORDS[r].uppercase(), k.right, k.top - 62f * dp, 1.1f, 14f * dp, COLORS[r], Faces.serif,
					align = Paint.Align.RIGHT, outline = Color.BLACK, outlineWidth = 3f * dp, rise = 18f * dp, popFrom = 2.2f,
				),
			)
			ComboSounds.sfx("sr_rankup", 0.8f, 0.9f + r * 0.05f)
			shakeIfOn(k.root, 2f + r, 160L)
		}
		repeat(1 + (k.heat * 2f).toInt() + if (rank >= 4) 1 else 0) {
			val angle = rand(0f, 2f * PI.toFloat())
			val speedPx = rand(700f, 1100f) * dp * (1f + 0.5f * k.heat)
			layer.add(
				Bit(
					k.x + cos(angle) * 10f * dp, k.y + sin(angle) * 10f * dp, cos(angle) * speedPx, sin(angle) * speedPx,
					0.16f + 0.08f * k.heat, (1.4f + 1.6f * k.heat) * dp, if (Random.nextBoolean()) Color.WHITE else COLORS[rank], Shape.STREAK, drag = 6f,
				),
			)
		}
		if (k.heat >= 0.5f) layer.add(Ring(k.x, k.y, 6f * dp, (14f + 16f * k.heat) * dp, 0.2f, COLORS[rank], 2f * dp))
		ComboSounds.sfx("sr_slash", 0.2f + 0.25f * k.heat + rank * 0.02f, 0.9f + 0.35f * k.heat + rand(0f, 0.1f))
		return true
	}

	override fun hudVisible(sinceKeyMs: Long) = points > 0.5f || sinceKeyMs < HUD_MS

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		drain(now)
		if (points <= 0.5f && now - layer.lastKeyAt >= HUD_MS) return
		val r = rank
		val since = (now - rankAt).toFloat()
		val pop = 1f + 0.7f * (1f - min(1f, since / 200f))
		val color = COLORS[r]
		val x = layer.right
		val base = layer.top - 26f * dp

		c.save()
		c.translate(x, base)
		c.scale(pop, pop)
		p.typeface = Faces.serif
		p.textAlign = Paint.Align.RIGHT
		p.textSize = 36f * dp
		p.style = Paint.Style.STROKE
		p.strokeJoin = Paint.Join.ROUND
		p.strokeWidth = 4f * dp
		p.color = Color.BLACK
		c.drawText(LETTERS[r], 0f, 0f, p)
		p.style = Paint.Style.FILL
		p.color = color
		if (r >= 4) p.setShadowLayer(10f * dp, 0f, 0f, color)
		c.drawText(LETTERS[r], 0f, 0f, p)
		p.clearShadowLayer()
		c.restore()

		p.textSize = 11f * dp
		p.color = Color.WHITE
		p.alpha = 220
		p.setShadowLayer(3f * dp, 0f, 1f * dp, Color.BLACK)
		c.drawText(WORDS[r], x, layer.top - 14f * dp, p)
		p.clearShadowLayer()

		// The meter: how far to the next rank, draining as you watch.
		val next = NEEDS.getOrNull(r + 1) ?: MAX
		val frac = ((points - NEEDS[r]) / (next - NEEDS[r])).coerceIn(0f, 1f)
		val barW = 96f * dp
		val barTop = layer.top - 9f * dp
		p.style = Paint.Style.FILL
		p.color = col(0x66000000)
		c.drawRoundRect(x - barW, barTop, x, barTop + 4f * dp, 2f * dp, 2f * dp, p)
		p.color = color
		c.drawRoundRect(x - barW, barTop, x - barW + barW * frac, barTop + 4f * dp, 2f * dp, 2f * dp, p)
		layer.keepAlive()
	}

	override fun finish(peak: Int): FinishScene {
		val pr = max(peakRank, rank).coerceAtLeast(4)
		return StyleRankFinish(peak, LETTERS[pr], WORDS[pr], COLORS[pr])
	}
}

// ---------------------------------------------------------------------------------------------
// Rhythm (osu!-style): every key judged on how steady your rhythm is
// ---------------------------------------------------------------------------------------------

internal object RhythmSkin : ComboSkin("rhythm") {
	/** Steady: the hit bar spans the box, so it barely moves. */
	override val motion = Motion(shake = 0.4f, tilt = 0f, bounce = 0.5f, sway = 0f)

	/** The playfield spans the whole box: pivot on its middle. */
	override fun motionPivot(layer: SkinLayer) = (layer.left + layer.right) / 2f to layer.top - 20f * dp

	private val COMBO_COLORS = intArrayOf(col(0xFFFF66AA), col(0xFF66CCFF), col(0xFF88E05A), col(0xFFFFCC33))
	private val C300 = col(0xFF66CCFF)
	private val C100 = col(0xFF88E05A)
	private val C50 = col(0xFFFFCC33)
	private val CMISS = col(0xFFFF4D4D)

	private var n300 = 0
	private var n100 = 0
	private var n50 = 0
	private var nMiss = 0
	/** The run's typical gap between keys; each key is judged against it. */
	private var beat = 0f
	private var number = 0
	private var colorIndex = 0

	override fun startRun() {
		n300 = 0
		n100 = 0
		n50 = 0
		nMiss = 0
		beat = 0f
	}

	private fun total() = n300 + n100 + n50 + nMiss

	private fun accuracy(): Float {
		val total = total()
		if (total == 0) return 100f
		return (300f * n300 + 100f * n100 + 50f * n50) * 100f / (300f * total)
	}

	private fun grade(): String {
		val acc = accuracy()
		val total = max(1, total())
		return when {
			nMiss == 0 && n100 == 0 && n50 == 0 -> "SS"
			acc > 93.17f && nMiss == 0 && n50 <= total / 100 -> "S"
			(acc > 80f && nMiss == 0) || acc > 90f -> "A"
			(acc > 70f && nMiss == 0) || acc > 80f -> "B"
			acc > 60f -> "C"
			else -> "D"
		}
	}

	private fun gradeColor(g: String) = when (g) {
		"SS" -> col(0xFFFFF0B0)
		"S" -> col(0xFFFFCC33)
		"A" -> col(0xFF88E05A)
		"B" -> col(0xFF66CCFF)
		"C" -> col(0xFFC77DFF)
		else -> CMISS
	}

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		// Judged on how far this gap is from the run's beat. Rushing is forgiven twice as much as
		// hesitating: bursts within a word are normal, a stall is what breaks a rhythm.
		var judge = 300
		if (k.gapMs >= 0) {
			val gap = k.gapMs.coerceIn(40L, 1400L).toFloat()
			if (beat == 0f) {
				beat = gap
			} else {
				val ratio = gap / beat
				val dev = abs(ln(ratio)) * if (ratio < 1f) 0.5f else 1f
				judge = when {
					dev < 0.3f -> 300
					dev < 0.6f -> 100
					dev < 0.95f -> 50
					else -> 0
				}
				beat = beat * 0.75f + gap * 0.25f
			}
		}
		when (judge) {
			300 -> n300++
			100 -> n100++
			50 -> n50++
			else -> nMiss++
		}

		if (judge == 0) {
			layer.add(
				Draw(0.5f) { c, p, _, _ ->
					val s = 9f * dp * (1f + 0.3f * easeOut(t))
					p.fresh().style = Paint.Style.STROKE
					p.strokeCap = Paint.Cap.ROUND
					p.strokeWidth = 3.5f * dp
					p.color = CMISS
					p.alpha = (255 * fade(0.5f)).toInt()
					val cy = k.y - 22f * dp + 10f * dp * t
					c.drawLine(k.x - s, cy - s, k.x + s, cy + s, p)
					c.drawLine(k.x - s, cy + s, k.x + s, cy - s, p)
				},
			)
			if (k.combo - 1 >= 10) ComboSounds.sfx("osu_break", 0.9f)
			return false
		}

		number = number % 9 + 1
		if (number == 1) colorIndex = (colorIndex + 1) % COMBO_COLORS.size
		val circleColor = COMBO_COLORS[colorIndex]
		val label = number.toString()
		val grow = 1f + 0.3f * k.heat
		layer.add(
			Draw(0.28f) { c, p, _, _ ->
				val r = 15f * dp * grow * (1f + 0.45f * easeOut(t))
				val alpha = (255 * (1f - t)).toInt()
				p.fresh().style = Paint.Style.FILL
				p.color = circleColor
				p.alpha = alpha * 85 / 100
				c.drawCircle(k.x, k.y, r, p)
				p.style = Paint.Style.STROKE
				p.strokeWidth = 2.5f * dp
				p.color = Color.WHITE
				p.alpha = alpha
				c.drawCircle(k.x, k.y, r, p)
				p.style = Paint.Style.FILL
				p.typeface = Faces.bold
				p.textAlign = Paint.Align.CENTER
				p.textSize = 13f * dp * grow * (1f + 0.45f * easeOut(t))
				c.drawText(label, k.x, k.y + p.textSize * 0.36f, p)
			},
		)
		val judgeColor = when (judge) {
			300 -> C300
			100 -> C100
			else -> C50
		}
		// A hot streak sends a ring out of each circle.
		if (k.heat >= 0.4f) layer.add(Ring(k.x, k.y, 15f * dp * grow, (30f + 20f * k.heat) * dp, 0.32f, circleColor, 2.5f * dp))
		layer.add(PopText(judge.toString(), k.x, k.y - 24f * dp, 0.5f, 13f * dp * (1f + 0.4f * k.heat), judgeColor, Faces.bold, rise = 18f * dp, popFrom = 1.4f + 0.4f * k.heat))
		ComboSounds.sfx("osu_hit", 0.4f + 0.3f * k.heat, if (judge == 300) 1f else if (judge == 100) 0.96f else 0.92f)
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		val since = (now - layer.lastKeyAt).toFloat()
		val text = "${layer.combo}x"
		val y = layer.top - 10f * dp
		p.typeface = Faces.bold
		p.textAlign = Paint.Align.LEFT
		// The combo's echo: a bigger, fainter copy that swells and fades on each hit.
		if (since < 300f) {
			val grow = 1f + 0.5f * (since / 300f)
			p.textSize = 26f * dp * grow
			p.color = Color.WHITE
			p.alpha = (alpha * 0.45f * (1f - since / 300f)).toInt()
			c.drawText(text, layer.left, y, p)
		}
		p.textSize = 26f * dp * hudPop(layer, now, 0.15f)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 3f * dp
		p.color = Color.BLACK
		p.alpha = alpha
		c.drawText(text, layer.left, y, p)
		p.style = Paint.Style.FILL
		p.color = Color.WHITE
		p.alpha = alpha
		c.drawText(text, layer.left, y, p)

		p.textAlign = Paint.Align.RIGHT
		p.textSize = 13f * dp
		p.setShadowLayer(3f * dp, 0f, 1f * dp, Color.BLACK)
		c.drawText(String.format(java.util.Locale.US, "%.2f%%", accuracy()), layer.right, y, p)
		p.clearShadowLayer()
	}

	override fun onRunEnded(layer: SkinLayer, peak: Int, record: Boolean) {
		if (!record && nMiss == 0 && peak >= 30) {
			layer.add(PopText("FULL COMBO", layer.right, layer.top - 34f * dp, 1.6f, 14f * dp, col(0xFFFFCC33), Faces.bold, align = Paint.Align.RIGHT, rise = 10f * dp))
			ComboSounds.sfx("osu_rank", 0.6f)
		}
	}

	override fun finish(peak: Int): FinishScene {
		// The test button runs this without a run: show it as a perfect one.
		if (total() == 0) n300 = max(1, peak)
		val g = grade()
		return RhythmFinish(
			peak, g, gradeColor(g),
			listOf(Triple("300", n300, C300), Triple("100", n100, C100), Triple("50", n50, C50), Triple("MISS", nMiss, CMISS)),
			accuracy(), nMiss == 0,
		)
	}
}

// ---------------------------------------------------------------------------------------------
// Retro Platformer: a coin per key, an extra life every 100
// ---------------------------------------------------------------------------------------------

internal object PlatformerSkin : ComboSkin("platformer") {
	/** Hops like a jump. */
	override val motion = Motion(shake = 0.5f, tilt = 0f, bounce = 1.8f, sway = 0.3f)

	private val WHITE = intArrayOf(Color.WHITE, col(0xFFDDE6FF))
	private val GOLD = intArrayOf(col(0xFFFFF6C8), col(0xFFFFC233))
	private val GREEN = intArrayOf(col(0xFFC8FFB0), col(0xFF35C43C))
	private val FIREWORK = intArrayOf(col(0xFFFF4F79), col(0xFFFFC43D), col(0xFF3DDC97), col(0xFF4CC9F0), col(0xFFFFFFFF))

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		// More coins per key, higher and brighter, as the combo climbs.
		val coins = 1 + (k.heat * 2f).toInt()
		repeat(coins) { i ->
			val spread = if (coins == 1) 0f else (i - (coins - 1) / 2f) * 70f * dp
			layer.add(Bit(k.x, k.y - 8f * dp, spread, -(300f + 120f * k.heat) * dp, 0.42f + 0.1f * k.heat, (7f + 2f * k.heat) * dp, col(0xFFFFD84D), Shape.COIN, gravity = 1100f * dp, rotation = 0f))
		}
		if (k.combo >= 25 && Random.nextFloat() < k.heat) {
			layer.add(Bit(k.x + rand(-14f, 14f) * dp, k.y - rand(20f, 40f) * dp, 0f, -30f * dp, 0.5f, 2.6f * dp, Color.WHITE, Shape.SPARKLE, rotation = 0f))
		}
		ComboSounds.sfx("pf_coin", 0.24f + 0.16f * k.heat, 1f + 0.25f * k.heat)
		if (k.combo % 100 == 0) {
			layer.add(PixelText("1UP", k.x, k.y - 34f * dp, 1.2f, 3f * dp, GREEN, rise = 40f * dp))
			ComboSounds.sfx("pf_1up", 0.8f)
		}
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		val text = "X" + layer.combo.toString().padStart(3, '0')
		val pixel = 2.6f * dp
		val y = layer.top - 26f * dp
		val pop = hudPop(layer, now, 0.12f)
		drawPixelText(c, p, text, layer.right, y, pixel, WHITE, Paint.Align.RIGHT, alpha, pop)
		val coinX = layer.right - PixelFont.width(text) * pixel * pop - 12f * dp
		val coinY = y + PixelFont.HEIGHT * pixel / 2f
		p.fresh().color = col(0xFFB8860B)
		p.alpha = alpha
		c.drawOval(coinX - 6f * dp, coinY - 9f * dp, coinX + 6f * dp, coinY + 9f * dp, p)
		p.color = col(0xFFFFD84D)
		p.alpha = alpha
		c.drawOval(coinX - 4.6f * dp, coinY - 7.4f * dp, coinX + 4.6f * dp, coinY + 7.4f * dp, p)
	}

	override fun finish(peak: Int): FinishScene = PlatformerFinish(peak)
}

// ---------------------------------------------------------------------------------------------
// On Fire: heating up at 10, on fire at 25, flames until you stop
// ---------------------------------------------------------------------------------------------

internal object OnFireSkin : ComboSkin("onfire") {
	/** Flickers and heaves like flames. */
	override val motion = Motion(shake = 1.4f, tilt = 2f, bounce = 0.8f, sway = 1f)

	private val FIRE = intArrayOf(col(0xFFFFF3A0), col(0xFFFFA23D), col(0xFFE8331C))
	private var heating = false
	private var onFire = false

	override fun startRun() {
		heating = false
		onFire = false
	}

	private fun flames(layer: SkinLayer, x: Float, y: Float, count: Int, spread: Float, delay: Float = 0f) {
		repeat(count) {
			layer.add(
				Bit(
					x + rand(-spread, spread), y, rand(-25f, 25f) * dp, -rand(110f, 220f) * dp, rand(0.5f, 0.8f), rand(5f, 9f) * dp,
					Color.WHITE, Shape.FLAME, sway = 40f * dp, drag = 0.8f, delay = delay + rand(0f, 0.1f),
				),
			)
		}
	}

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		ComboSounds.sfx("fire_thump", 0.3f + 0.35f * k.heat, 0.85f + 0.3f * k.heat + rand(0f, 0.08f))
		if (k.combo == 10) {
			heating = true
			layer.add(
				PopText(
					"HEATING UP!", k.right, k.top - 46f * dp, 1.4f, 16f * dp, col(0xFFFFA23D), Faces.condensed,
					align = Paint.Align.RIGHT, outline = col(0xFF3A1200), outlineWidth = 3f * dp, rise = 12f * dp,
				),
			)
			ComboSounds.sfx("fire_heat", 0.8f)
		}
		if (k.combo == 25) {
			onFire = true
			layer.add(
				PopText(
					"ON FIRE!", k.right, k.top - 50f * dp, 1.8f, 26f * dp, Color.WHITE, Faces.condensed,
					align = Paint.Align.RIGHT, outline = col(0xFF5A0A00), outlineWidth = 4f * dp, popFrom = 2.5f, gradient = FIRE,
				),
			)
			flames(layer, k.right - 40f * dp, k.top - 20f * dp, 18, 50f * dp)
			ComboSounds.sfx("fire_ignite", 1f)
			shakeIfOn(k.root, 6f, 300L)
		}
		when {
			onFire -> {
				flames(layer, k.x, k.y, 2 + (k.heat * 3f).toInt(), 5f * dp)
				flames(layer, k.right - rand(0f, 60f) * dp, k.top - 8f * dp, 1, 2f * dp)
			}
			// Sparks before the fire: a few from the start, more as it heats up.
			else -> repeat(if (heating) 2 + (k.heat * 2f).toInt() else if (Random.nextFloat() < 0.2f + k.heat * 2f) 1 else 0) {
				layer.add(
					Bit(k.x, k.y, rand(-40f, 40f) * dp, -rand(60f, 120f) * dp, rand(0.5f, 0.9f), (1.4f + k.heat) * dp, col(0xFFFF9A3D), Shape.EMBER, sway = 30f * dp),
				)
			}
		}
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		val text = "×${layer.combo}"
		val size = 28f * dp * hudPop(layer, now, 0.2f)
		val y = layer.top - 12f * dp
		p.typeface = Faces.condensed
		p.textAlign = Paint.Align.RIGHT
		p.textSize = size
		p.style = Paint.Style.STROKE
		p.strokeJoin = Paint.Join.ROUND
		p.strokeWidth = 3.5f * dp
		p.color = col(0xFF1A0500)
		p.alpha = alpha
		c.drawText(text, layer.right, y, p)
		p.style = Paint.Style.FILL
		when {
			onFire -> {
				p.shader = LinearGradient(0f, y - size * 0.8f, 0f, y, FIRE, null, Shader.TileMode.CLAMP)
				val flicker = 6f + 4f * sin(now / 45f)
				p.setShadowLayer(flicker * dp, 0f, 0f, col(0xFFFF7A1F))
			}
			heating -> p.color = col(0xFFFFB35C)
			else -> p.color = Color.WHITE
		}
		p.alpha = alpha
		c.drawText(text, layer.right, y, p)
		p.shader = null
		p.clearShadowLayer()
	}

	override fun onRunEnded(layer: SkinLayer, peak: Int, record: Boolean) {
		if (onFire && !record) {
			layer.add(PopText("COOLED DOWN", layer.right, layer.top - 30f * dp, 1.4f, 14f * dp, col(0xFFB0B0B8), Faces.condensed, align = Paint.Align.RIGHT, rise = 10f * dp, popFrom = 1.2f))
			repeat(8) {
				layer.add(
					Bit(layer.right - rand(0f, 70f) * dp, layer.top - 14f * dp, rand(-15f, 15f) * dp, -rand(30f, 60f) * dp, rand(0.9f, 1.4f), rand(5f, 8f) * dp, col(0xFF8A8A90), Shape.SMOKE, sway = 20f * dp),
				)
			}
			ComboSounds.sfx("fire_fizzle", 0.7f)
		}
		heating = false
		onFire = false
	}

	override fun finish(peak: Int): FinishScene = OnFireFinish(peak)
}

// ---------------------------------------------------------------------------------------------
// Shmup: bullets, a score chain, grazes, a bomb every 50
// ---------------------------------------------------------------------------------------------

internal object ShmupSkin : ComboSkin("shmup") {
	/** Small arcade knocks, no tilt. */
	override val motion = Motion(shake = 0.8f, tilt = 0f, bounce = 0.4f, sway = 0.3f)

	private val WHITE = intArrayOf(Color.WHITE, col(0xFFFFF2A8))
	private val CYAN = intArrayOf(col(0xFFD8FBFF), col(0xFF35C8F0))
	private val BOOM = intArrayOf(col(0xFFFFF3A0), col(0xFFFFA23D), col(0xFFFF4D2E), col(0xFFFFFFFF))
	private var score = 0L

	private fun chain(combo: Int) = min(9, 1 + combo / 10)

	override fun startRun() {
		score = 0L
	}

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		val chain = chain(k.combo)
		score += 100L * chain
		// The ship powers up with the chain: twin shot, then a spread of three, then five.
		val lanes = when {
			chain >= 5 -> listOf(-14f to -260f, -6f to -110f, 0f to 0f, 6f to 110f, 14f to 260f)
			chain >= 3 -> listOf(-6f to -150f, 0f to 0f, 6f to 150f)
			else -> listOf(-4f to 0f, 4f to 0f)
		}
		for ((side, drift) in lanes) {
			layer.add(Bit(k.x + side * dp, k.y - 6f * dp, drift * dp, -1500f * dp, 0.3f, (2f + 1.2f * k.heat) * dp, col(0xFFFFF6B0), Shape.STREAK))
		}
		ComboSounds.sfx("shmup_shot", 0.2f + 0.2f * k.heat, 0.95f + 0.25f * k.heat)
		if (k.combo >= 5 && Random.nextFloat() < 0.07f) {
			val bonus = 500L * chain
			score += bonus
			layer.add(PopText("GRAZE +$bonus", k.x, k.y - 24f * dp, 0.7f, 11f * dp, col(0xFF5FF0FF), Faces.mono, rise = 26f * dp, popFrom = 1.3f))
			ComboSounds.sfx("shmup_graze", 0.5f)
		}
		if (k.combo % 10 == 0) {
			layer.add(PopText("CHAIN ×$chain", k.right, k.top - 44f * dp, 0.9f, 12f * dp, col(0xFF5FF0FF), Faces.mono, align = Paint.Align.RIGHT, rise = 10f * dp))
		}
		if (k.combo % 50 == 0) {
			score += 10_000L
			layer.add(Flash(Color.WHITE, 0.45f, 0.55f))
			layer.add(Ring(k.x, k.y, 10f * dp, max(layer.width, layer.height).toFloat(), 0.6f, Color.WHITE, 8f * dp))
			layer.add(PixelText("BOMB!", k.x, k.y - 50f * dp, 1f, 4f * dp, BOOM))
			ComboSounds.sfx("shmup_bomb", 1f)
			shakeIfOn(k.root, 9f, 420L)
		}
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		drawPixelText(c, p, "SCORE " + score.toString().padStart(8, '0'), layer.right, layer.top - 30f * dp, 2.2f * dp, WHITE, Paint.Align.RIGHT, alpha)
		drawPixelText(c, p, "CHAIN X" + chain(layer.combo), layer.right, layer.top - 13f * dp, 1.6f * dp, CYAN, Paint.Align.RIGHT, alpha)
	}

	private fun explosion(layer: SkinLayer, x: Float, y: Float, delay: Float) {
		repeat(14) {
			val angle = rand(0f, 2f * PI.toFloat())
			val speed = rand(90f, 240f) * dp
			layer.add(Bit(x, y, cos(angle) * speed, sin(angle) * speed, rand(0.4f, 0.7f), rand(2f, 3.5f) * dp, BOOM[it % 3], Shape.SQUARE, drag = 3f, rotation = 0f, delay = delay))
		}
		layer.add(Ring(x, y, 4f * dp, 46f * dp, 0.4f, col(0xFFFFA23D), 4f * dp, delay = delay))
	}

	override fun finish(peak: Int): FinishScene = ShmupFinish(peak, if (score > 0) score else peak * 100L)
}

// ---------------------------------------------------------------------------------------------
// Comic Action: POW! BAM! ZAP! in starbursts
// ---------------------------------------------------------------------------------------------

internal object ComicSkin : ComboSkin("comic") {
	/** Swings like a panel getting punched. */
	override val motion = Motion(shake = 1.3f, tilt = 5f, bounce = 1.2f, sway = 0.8f)

	private val WORDS = listOf(
		"POW!", "BAM!", "ZAP!", "WHAM!", "BIFF!", "ZOK!", "THWACK!", "SOCK!", "CRASH!", "BONK!", "WHAP!", "ZING!", "KRAK!", "BOOF!", "SPLAT!",
	)
	/** fill, edge, ink */
	private val PALETTES = listOf(
		Triple(col(0xFFFFE14D), col(0xFFE8231F), col(0xFFE8231F)),
		Triple(col(0xFFE8231F), Color.BLACK, col(0xFFFFE14D)),
		Triple(col(0xFF35C8F0), Color.BLACK, Color.WHITE),
		Triple(col(0xFFFF4FA3), Color.BLACK, col(0xFFFFE14D)),
	)
	private val BIG = mapOf(25 to "WHAM!!", 50 to "KAPOW!!", 100 to "KA-BLAM!!")
	private val rect = RectF()

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		// Heavier hits (lower, louder) and more of everything as the combo climbs.
		ComboSounds.sfx("comic_hit", 0.3f + 0.35f * k.heat, 1.15f - 0.3f * k.heat + rand(0f, 0.08f))
		repeat(3 + (k.heat * 4f).toInt()) {
			val angle = rand(0f, 2f * PI.toFloat())
			val speed = rand(380f, 560f) * dp
			layer.add(Bit(k.x, k.y, cos(angle) * speed, sin(angle) * speed, 0.14f, 2.4f * dp, col(0xFF1A1A1A), Shape.STREAK, drag = 6f))
		}
		if (Random.nextFloat() < 0.25f + 0.6f * k.heat) {
			val (fill, edge, ink) = PALETTES.random()
			layer.add(
				ComicBurst(
					WORDS.random(), k.x + rand(-30f, 30f) * dp, k.y - rand(28f, 52f) * dp, (24f + min(k.combo, 60) * 0.3f) * dp,
					fill, edge, ink, rand(-18f, 18f), 0.65f,
				),
			)
			ComboSounds.sfx("comic_pop", 0.4f, rand(0.85f, 1.25f))
		}
		BIG[k.combo]?.let { word ->
			layer.add(ComicBurst(word, k.right - 70f * dp, k.top - 70f * dp, 52f * dp, col(0xFFFFE14D), col(0xFFE8231F), col(0xFFE8231F), rand(-10f, 10f), 1.1f, halftone = true))
			shakeIfOn(k.root, 6f, 260L)
			ComboSounds.sfx("comic_pop", 0.8f, 0.8f)
		}
		return true
	}

	/** A comic caption box, its right edge at [x] and bottom at [bottom]. */
	private fun caption(c: Canvas, p: Paint, text: String, x: Float, bottom: Float, size: Float, alpha: Int, tilt: Float, align: Paint.Align = Paint.Align.RIGHT) {
		p.fresh().typeface = Faces.black
		p.textSize = size
		val w = p.measureText(text) + 16f * dp
		val h = size + 12f * dp
		val left = if (align == Paint.Align.CENTER) x - w / 2f else x - w
		c.save()
		c.rotate(tilt, left + w / 2f, bottom - h / 2f)
		rect.set(left, bottom - h, left + w, bottom)
		p.style = Paint.Style.FILL
		p.color = Color.BLACK
		p.alpha = alpha / 2
		c.drawRect(rect.left + 3f * dp, rect.top + 3f * dp, rect.right + 3f * dp, rect.bottom + 3f * dp, p)
		p.color = col(0xFFFFF27A)
		p.alpha = alpha
		c.drawRect(rect, p)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 2f * dp
		p.color = Color.BLACK
		p.alpha = alpha
		c.drawRect(rect, p)
		p.style = Paint.Style.FILL
		p.textAlign = Paint.Align.CENTER
		c.drawText(text, rect.centerX(), rect.bottom - 6f * dp - size * 0.12f, p)
		c.restore()
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		val pop = hudPop(layer, now, 0.15f)
		c.save()
		c.scale(pop, pop, layer.right, layer.top - 8f * dp)
		caption(c, p, "${layer.combo} HITS!", layer.right, layer.top - 8f * dp, 15f * dp, alpha, -3f)
		c.restore()
	}

	override fun finish(peak: Int): FinishScene = ComicFinish(peak)
}

// ---------------------------------------------------------------------------------------------
// Hacker Terminal: green glyphs, access levels, ACCESS GRANTED
// ---------------------------------------------------------------------------------------------

internal object TerminalSkin : ComboSkin("terminal") {
	/** Glitches: snaps between offsets. */
	override val motion = Motion(shake = 0.9f, tilt = 0f, bounce = 0f, sway = 0f, jitter = true)

	private val GREEN = col(0xFF33FF66)
	private val DIM = col(0xFF1E9E45)
	private val RED = col(0xFFFF3B3B)
	private const val CHARS = "0123456789ABCDEF<>/{}[]#\$%&*=+;:"
	private val STATUS = listOf(
		"bypassing firewall", "decrypting packets", "injecting payload", "spoofing mac address", "rerouting proxy chain",
		"cracking hash", "escalating privileges", "tracing backdoor", "compiling exploit", "dumping memory",
	)
	private val rect = RectF()

	private fun level(combo: Int) = 1 + combo / 25

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		repeat(1 + (k.heat * 3f).toInt() + if (Random.nextBoolean()) 1 else 0) {
			layer.add(
				Bit(
					k.x + rand(-8f, 8f) * dp * (1f + 2f * k.heat), k.y, 0f, rand(30f, 90f) * dp, rand(0.7f, 1.1f), (rand(11f, 14f) + 4f * k.heat) * dp,
					if (Random.nextBoolean()) GREEN else DIM, Shape.GLYPH, gravity = 120f * dp, text = CHARS[Random.nextInt(CHARS.length)].toString(),
				),
			)
		}
		ComboSounds.sfx("term_key", 0.3f + 0.25f * k.heat, 0.9f + 0.3f * k.heat + rand(0f, 0.08f))
		when {
			k.combo % 25 == 0 -> {
				layer.add(PopText("ACCESS LEVEL ${level(k.combo)}", k.right, k.top - 58f * dp, 1.3f, 14f * dp, GREEN, Faces.mono, align = Paint.Align.RIGHT, glow = GREEN, popFrom = 1.3f))
				ComboSounds.sfx("term_chirp", 0.7f)
			}
			k.combo % 12 == 0 -> layer.add(
				PopText("> ${STATUS.random()}...", k.right, k.top - 58f * dp, 1.1f, 10f * dp, DIM, Faces.mono, align = Paint.Align.RIGHT, rise = 10f * dp, popFrom = 1f),
			)
		}
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		val lvl = level(layer.combo)
		val progress = (layer.combo % 25) / 25f
		val cells = (progress * 10).toInt()
		val line1 = "> ACCESS LVL $lvl"
		val line2 = "[" + "#".repeat(cells) + "-".repeat(10 - cells) + "] ${(progress * 100).toInt()}%"
		p.typeface = Faces.mono
		p.textSize = 11f * dp
		val w = max(p.measureText(line1) + 10f * dp, p.measureText(line2)) + 16f * dp
		val h = 40f * dp
		val bottom = layer.top - 6f * dp
		rect.set(layer.right - w, bottom - h, layer.right, bottom)
		p.style = Paint.Style.FILL
		p.color = col(0xDD050A06)
		p.alpha = alpha * 87 / 100
		c.drawRoundRect(rect, 4f * dp, 4f * dp, p)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 1f * dp
		p.color = GREEN
		p.alpha = alpha
		c.drawRoundRect(rect, 4f * dp, 4f * dp, p)
		p.style = Paint.Style.FILL
		p.textAlign = Paint.Align.LEFT
		p.setShadowLayer(4f * dp, 0f, 0f, GREEN)
		c.drawText(line1, rect.left + 8f * dp, rect.top + 16f * dp, p)
		c.drawText(line2, rect.left + 8f * dp, rect.top + 32f * dp, p)
		p.clearShadowLayer()
		if ((now / 400L) % 2L == 0L) {
			val cx = rect.left + 8f * dp + p.measureText(line1) + 3f * dp
			c.drawRect(cx, rect.top + 7f * dp, cx + 6f * dp, rect.top + 18f * dp, p)
		}
	}

	override fun onRunEnded(layer: SkinLayer, peak: Int, record: Boolean) {
		if (!record && peak >= 10) {
			layer.add(PopText("CONNECTION LOST", layer.right, layer.top - 54f * dp, 1.2f, 13f * dp, RED, Faces.mono, align = Paint.Align.RIGHT, glow = RED, popFrom = 1f))
			ComboSounds.sfx("term_denied", 0.6f)
		}
	}

	override fun finish(peak: Int): FinishScene = TerminalFinish(peak)
}

// ---------------------------------------------------------------------------------------------
// Time circuits: the combo is your speed, two miles an hour a key, and 88 is where it happens
// ---------------------------------------------------------------------------------------------

/** Seven-segment digits for the speedometer, drawn as bars (no font needed). */
private object SevenSeg {
	// Segments a b c d e f g, per digit.
	private val DIGITS = intArrayOf(0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)
	private val rect = RectF()

	/** One digit with its top-left at [x], [y]; unlit segments drawn in [off] so it reads as a real display. */
	fun digit(c: Canvas, p: Paint, d: Int, x: Float, y: Float, w: Float, h: Float, on: Int, off: Int) {
		val t = w * 0.18f
		val bits = if (d in 0..9) DIGITS[d] else 0
		val half = h / 2f
		fun bar(i: Int, l: Float, tp: Float, r: Float, b: Float) {
			p.color = if (bits and (1 shl i) != 0) on else off
			rect.set(l, tp, r, b)
			c.drawRoundRect(rect, t / 2f, t / 2f, p)
		}
		bar(0, x + t, y, x + w - t, y + t)
		bar(1, x + w - t, y + t * 0.6f, x + w, y + half - t * 0.3f)
		bar(2, x + w - t, y + half + t * 0.3f, x + w, y + h - t * 0.6f)
		bar(3, x + t, y + h - t, x + w - t, y + h)
		bar(4, x, y + half + t * 0.3f, x + t, y + h - t * 0.6f)
		bar(5, x, y + t * 0.6f, x + t, y + half - t * 0.3f)
		bar(6, x + t, y + half - t / 2f, x + w - t, y + half + t / 2f)
	}
}

internal object TimeCircuitsSkin : ComboSkin("timecircuits") {
	/** A heavy machine: a solid jolt per key, barely any wobble. */
	override val motion = Motion(shake = 1.1f, tilt = 0.5f, bounce = 0.5f, sway = 0.2f)

	private val RED = col(0xFFFF2A1F)
	private val RED_OFF = col(0x30FF2A1F)
	private val AMBER = col(0xFFFFB020)
	private val BLUE = col(0xFF7CC8FF)
	private val WHITE_BLUE = col(0xFFE6F4FF)
	private val ELECTRIC = intArrayOf(col(0xFFBFE6FF), col(0xFF7CC8FF), col(0xFFFFFFFF), col(0xFF4FA8FF))
	private const val MPH_PER_KEY = 2
	/** Keys per jump: 44 keys is 88 miles an hour. */
	private const val JUMP = 88 / MPH_PER_KEY
	private val rect = RectF()
	private val path = Path()
	private var jumps = 0

	private fun mph(combo: Int) = combo * MPH_PER_KEY

	override fun startRun() {
		jumps = 0
	}

	/** A short jagged bolt from [x], [y], re-jagged every frame so it crackles. */
	private fun bolt(layer: SkinLayer, x: Float, y: Float, length: Float, life: Float = 0.16f) {
		val angle = rand(0f, 2f * PI.toFloat())
		layer.add(Draw(life) { c, p, _, _ ->
			path.rewind()
			path.moveTo(x, y)
			val steps = 6
			for (i in 1..steps) {
				val along = length * i / steps
				val side = rand(-0.3f, 0.3f) * length / steps * 2f
				path.lineTo(x + cos(angle) * along - sin(angle) * side, y + sin(angle) * along + cos(angle) * side)
			}
			p.fresh().style = Paint.Style.STROKE
			p.strokeJoin = Paint.Join.MITER
			p.strokeWidth = 4f * dp
			p.color = BLUE
			p.alpha = (110 * fade(0.6f)).toInt()
			c.drawPath(path, p)
			p.strokeWidth = 1.4f * dp
			p.color = WHITE_BLUE
			p.alpha = (255 * fade(0.6f)).toInt()
			c.drawPath(path, p)
		})
	}

	/** Two lines of flame burning along the top of the text box, right to left, a tyre-width apart. */
	private fun fireTrails(layer: SkinLayer, k: Key) {
		val from = k.right - 8f * dp
		val to = k.left + 8f * dp
		var x = from
		while (x > to) {
			val delay = (from - x) / (1400f * dp)
			for (y in floatArrayOf(k.top - 4f * dp, k.top - 16f * dp)) {
				layer.add(
					Bit(x + rand(-2f, 2f) * dp, y, 0f, -rand(40f, 90f) * dp, rand(0.6f, 0.9f), rand(6f, 9f) * dp,
						Color.WHITE, Shape.FLAME, sway = 20f * dp, drag = 0.8f, delay = delay),
				)
			}
			x -= 9f * dp
		}
	}

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		ComboSounds.sfx("tc_zap", 0.25f + 0.35f * k.heat, 0.9f + 0.4f * k.heat + rand(0f, 0.06f))
		repeat(1 + (k.heat * 3f).toInt()) {
			val a = rand(0f, 2f * PI.toFloat())
			val speed = rand(120f, 260f) * dp * (1f + k.heat)
			layer.add(
				Bit(k.x, k.y, cos(a) * speed, sin(a) * speed, rand(0.2f, 0.35f), (1.2f + k.heat) * dp,
					ELECTRIC[Random.nextInt(ELECTRIC.size)], Shape.STREAK, drag = 3f),
			)
		}
		if (Random.nextFloat() < 0.15f + k.heat * 0.6f) bolt(layer, k.x, k.y, (14f + 30f * k.heat) * dp)

		val inJump = k.combo % JUMP
		when {
			// The whine builds from 80 miles an hour.
			inJump == JUMP - 4 -> ComboSounds.sfx("tc_whine", 0.8f)
			inJump == 0 -> {
				jumps++
				ComboSounds.sfx("tc_boom", 1f)
				layer.add(Flash(WHITE_BLUE, 0.35f, 0.55f))
				layer.add(Ring(k.right - 40f * dp, k.top - 24f * dp, 10f * dp, 160f * dp, 0.5f, BLUE, 6f * dp))
				repeat(4) { bolt(layer, k.right - 40f * dp, k.top - 24f * dp, rand(60f, 120f) * dp, 0.3f) }
				fireTrails(layer, k)
				layer.add(
					PopText(
						if (jumps == 1) "88 MPH!" else "TIME JUMP ×$jumps", k.right, k.top - 66f * dp, 1.6f, 24f * dp, WHITE_BLUE, Faces.black,
						align = Paint.Align.RIGHT, outline = col(0xFF0A1A3A), outlineWidth = 4f * dp, popFrom = 2.4f, glow = BLUE,
					),
				)
				shakeIfOn(k.root, 8f, 350L)
			}
		}
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val fade = hudFade(layer, now)
		val alpha = (255 * fade).toInt()
		val speed = mph(layer.combo)
		val heat = min(layer.combo, JUMP) / JUMP.toFloat()
		// Past 88 the display flicks back to 88 now and then, like it's holding the jump.
		val shown = if (speed > 88 && (now / 300L) % 4L == 0L) 88 else speed % 1000
		val digitW = 14f * dp
		val digitH = 24f * dp
		val gap = 4f * dp
		val glyph = 26f * dp
		val w = glyph + 10f * dp + digitW * 3 + gap * 2 + 34f * dp
		val h = 36f * dp
		val bottom = layer.top - 6f * dp
		rect.set(layer.right - w, bottom - h, layer.right, bottom)
		p.fresh().style = Paint.Style.FILL
		p.color = col(0xEE0B0D10)
		p.alpha = alpha * 93 / 100
		c.drawRoundRect(rect, 5f * dp, 5f * dp, p)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 1.2f * dp
		p.color = col(0xFF4A5058)
		p.alpha = alpha
		c.drawRoundRect(rect, 5f * dp, 5f * dp, p)

		// The flux glyph: three arms meeting in the middle, pulsing faster as the speed climbs.
		val cx = rect.left + 6f * dp + glyph / 2f
		val cy = rect.centerY()
		val pulse = 0.5f + 0.5f * sin(now / (140f - 100f * heat))
		val arm = glyph * 0.45f
		p.fresh().style = Paint.Style.STROKE
		p.strokeCap = Paint.Cap.ROUND
		p.strokeWidth = 2.4f * dp
		p.color = if (speed >= 88) WHITE_BLUE else BLUE
		p.alpha = (alpha * (0.45f + 0.55f * pulse * (0.3f + 0.7f * heat))).toInt()
		p.setShadowLayer((3f + 6f * heat * pulse) * dp, 0f, 0f, BLUE)
		for (angle in floatArrayOf(-150f, -30f, 90f)) {
			val r = angle * PI.toFloat() / 180f
			c.drawLine(cx, cy, cx + cos(r) * arm, cy + sin(r) * arm, p)
		}
		p.clearShadowLayer()

		// MPH: three red digits with the unlit segments faint, then the label.
		val digitsLeft = cx + glyph / 2f + 8f * dp
		val top = cy - digitH / 2f
		p.fresh().style = Paint.Style.FILL
		val on = (RED and 0x00FFFFFF) or (alpha shl 24)
		val off = (RED_OFF and 0x00FFFFFF) or ((Color.alpha(RED_OFF) * fade).toInt() shl 24)
		p.setShadowLayer(4f * dp, 0f, 0f, RED)
		val text = shown.toString().padStart(3, ' ')
		for (i in 0 until 3) {
			val ch = text[i]
			SevenSeg.digit(c, p, if (ch == ' ') -1 else ch - '0', digitsLeft + i * (digitW + gap), top, digitW, digitH, on, off)
		}
		p.clearShadowLayer()
		p.typeface = Faces.condensed
		p.textSize = 10f * dp
		p.textAlign = Paint.Align.LEFT
		p.color = AMBER
		p.alpha = alpha
		c.drawText("MPH", digitsLeft + 3 * (digitW + gap), cy + digitH / 2f, p)
	}

	override fun onRunEnded(layer: SkinLayer, peak: Int, record: Boolean) {
		if (!record && peak >= 10) {
			layer.add(
				PopText(
					"STALLED AT ${mph(peak)} MPH", layer.right, layer.top - 54f * dp, 1.3f, 13f * dp, col(0xFFB8C0CC), Faces.condensed,
					align = Paint.Align.RIGHT, rise = 10f * dp, popFrom = 1.1f,
				),
			)
			ComboSounds.sfx("tc_zap", 0.6f, 0.6f)
		}
		jumps = 0
	}

	override fun finish(peak: Int): FinishScene = TimeCircuitsFinish(peak)
}

// ---------------------------------------------------------------------------------------------
// Cosy: a music box note per key, petals and leaves drifting down
// ---------------------------------------------------------------------------------------------

internal object CosySkin : ComboSkin("cosy") {
	/** Sways gently, barely jolts. */
	override val motion = Motion(shake = 0.25f, tilt = 1.5f, bounce = 0.5f, sway = 1.4f)

	/** A major pentatonic scale as playback rates of the C5 note: any order sounds pleasant. */
	private val RATES = floatArrayOf(1f, 1.125f, 1.25f, 1.5f, 1.6667f, 2f)
	private val PETALS = intArrayOf(col(0xFFFFB7C9), col(0xFFFFD6A5), col(0xFFC9F2C7), col(0xFFFFF1A8), col(0xFFD7C4FF))
	private val LEAF = col(0xFF9BD08A)
	private val PINK = col(0xFFFF8FB1)
	private val INK = col(0xFF7A5C58)
	private val WORDS = mapOf(15 to "Nice!", 40 to "Lovely!", 80 to "Wonderful!", 150 to "Magical!")
	private var noteIndex = 2
	private val rect = RectF()

	private fun drift(layer: SkinLayer, x: Float, y: Float, speed: Float, delay: Float = 0f, angle: Float? = null) {
		val leaf = Random.nextFloat() < 0.25f
		val dir = angle ?: rand(-2.4f, -0.7f)
		val v = speed * rand(0.6f, 1f)
		layer.add(
			Bit(
				x, y, cos(dir) * v, sin(dir) * v, rand(1.4f, 2.1f), rand(5f, 7f) * dp,
				if (leaf) LEAF else PETALS.random(), if (leaf) Shape.LEAF else Shape.PETAL,
				gravity = 60f * dp, drag = 1.3f, spin = rand(-120f, 120f), sway = 35f * dp, delay = delay,
			),
		)
	}

	override fun onKey(layer: SkinLayer, k: Key): Boolean {
		noteIndex = (noteIndex + listOf(-2, -1, 1, 1, 2).random()).coerceIn(0, RATES.size - 1)
		// Gentle even as it builds: a little louder, a few more petals, more sparkles.
		ComboSounds.sfx("cosy_note", 0.24f + 0.12f * k.heat, RATES[noteIndex])
		repeat(1 + (k.heat * 2f).toInt()) { drift(layer, k.x, k.y, (110f + 50f * k.heat) * dp) }
		if (Random.nextFloat() < 0.15f + 0.35f * k.heat) {
			layer.add(Bit(k.x + rand(-10f, 10f) * dp, k.y - rand(6f, 20f) * dp, 0f, -20f * dp, 0.7f, 2.4f * dp, PETALS.random(), Shape.SPARKLE, rotation = 0f))
		}
		WORDS[k.combo]?.let { word ->
			layer.add(PopText(word, k.right, k.top - 46f * dp, 1.6f, 16f * dp, PINK, Faces.casual, align = Paint.Align.RIGHT, outline = Color.WHITE, outlineWidth = 3f * dp, rise = 14f * dp, popFrom = 1.3f))
			ComboSounds.sfx("cosy_pop", 0.6f)
		}
		return true
	}

	override fun drawHud(c: Canvas, p: Paint, layer: SkinLayer, now: Long) {
		val alpha = (255 * hudFade(layer, now)).toInt()
		val text = layer.combo.toString()
		p.typeface = Faces.casual
		p.textSize = 15f * dp
		val w = p.measureText(text) + 34f * dp
		val h = 24f * dp
		val pop = hudPop(layer, now, 0.08f)
		val bottom = layer.top - 6f * dp
		c.save()
		c.scale(pop, pop, layer.right - w / 2f, bottom - h / 2f)
		rect.set(layer.right - w, bottom - h, layer.right, bottom)
		p.style = Paint.Style.FILL
		p.color = col(0xF2FFF7EE)
		p.alpha = alpha * 95 / 100
		c.drawRoundRect(rect, h / 2f, h / 2f, p)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 1.5f * dp
		p.color = col(0xFFF2B8C6)
		p.alpha = alpha
		c.drawRoundRect(rect, h / 2f, h / 2f, p)
		// A little flower: five petals round a yellow middle.
		val fx = rect.left + 13f * dp
		val fy = rect.centerY()
		p.style = Paint.Style.FILL
		p.color = PINK
		p.alpha = alpha
		for (i in 0 until 5) {
			val ang = 2f * PI.toFloat() * i / 5f - PI.toFloat() / 2f
			c.drawCircle(fx + cos(ang) * 3.6f * dp, fy + sin(ang) * 3.6f * dp, 3f * dp, p)
		}
		p.color = col(0xFFFFD84D)
		p.alpha = alpha
		c.drawCircle(fx, fy, 2.2f * dp, p)
		p.color = INK
		p.alpha = alpha
		p.textAlign = Paint.Align.LEFT
		c.drawText(text, rect.left + 24f * dp, rect.centerY() + 5.5f * dp, p)
		c.restore()
	}

	override fun finish(peak: Int): FinishScene = CosyFinish(peak)
}
