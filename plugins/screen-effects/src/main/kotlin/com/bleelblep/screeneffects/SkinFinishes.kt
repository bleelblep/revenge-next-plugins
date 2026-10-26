package com.bleelblep.screeneffects

import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/*
 * The combo skins' new-high-score finishes, built like the Arcade one (Arcade.kt): the keyboard
 * closes, the whole window is taken over, the title slams in with a shake, the hits count up with a
 * tick per step, a stamp lands, and TAP TO CONTINUE blinks until a tap or a timeout. Each skin
 * supplies a [FinishScene] in its own theme; [SkinFinish] runs the timeline. On phones that run
 * AGSL each also gets its own screen effect (FinishLooks.kt); elsewhere the scene is drawn alone.
 */

private val dp get() = Resources.getSystem().displayMetrics.density

private fun col(v: Long) = v.toInt()

/** A stable pseudo-random 0..1 for [i]: procedural backgrounds without any stored state. */
private fun hash(i: Int): Float {
	var x = i * 374761393 + 668265263
	x = (x xor (x ushr 13)) * 1274126177
	return ((x xor (x ushr 16)) and 0xFFFFFF) / 16777216f
}

private fun easeOut(p: Float) = 1f - (1f - p.coerceIn(0f, 1f)).let { it * it }

/** 3x down to 1x over 140 ms with a small overshoot, like a fist landing (Arcade's slam). */
internal fun slamScale(t: Long, at: Long): Float {
	val p = ((t - at) / 140f).coerceIn(0f, 1f)
	if (p < 1f) return 3f - 2.1f * p * p
	val settle = ((t - at - 140L) / 160f).coerceIn(0f, 1f)
	return 0.9f + 0.1f * settle
}

/** How visible a slammed line is while it falls in: faint while huge, solid by the time it lands. */
private fun slamAlpha(scale: Float) = if (scale > 1.2f) ((3f - scale) / 1.8f).coerceIn(0f, 1f) else 1f

private fun flashAlpha(t: Long, at: Long, length: Long): Float =
	if (t < at || t > at + length) 0f else 1f - (t - at) / length.toFloat()

/** The hits counted so far: up from 1 to [score] between 1000 and 1700 ms. */
internal fun countUp(score: Int, t: Long, from: Long = 1000L, length: Long = 700L): Int =
	(score * easeOut((t - from) / length.toFloat())).toInt().coerceIn(1, max(1, score))

/** Every finish's shared moments. */
internal object Beats {
	const val TITLE = 200L
	const val SLAM = 300L
	const val COUNT = 950L
	const val STAMP = 2050L
	const val TAP = 2700L
	const val TOTAL = 4800L
}

/** One skin's finish: what it draws over the window, and what it plays and shakes when. */
internal abstract class FinishScene(val score: Int) {
	/** Its screen effect in FinishLooks.kt (on phones that run AGSL); null for none. */
	open val look: String? = null

	/** True while that effect is actually on screen, so a scene can draw for it. */
	var lookActive = false

	/** Sounds and shakes. [at] runs its action once, when the timeline reaches the time given. */
	abstract fun cue(t: Long, at: (key: String, ms: Long, action: () -> Unit) -> Unit, roots: List<View>)

	abstract fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float)

	/** A tick per step of the count-up, capped so a huge combo isn't a drum roll (Arcade's rule). */
	protected fun countTicks(t: Long, at: (String, Long, () -> Unit) -> Unit, play: (Int) -> Unit) {
		if (t !in Beats.COUNT + 50L..Beats.COUNT + 750L) return
		val step = ((t - Beats.COUNT - 50L) / 90L).toInt()
		at("tick$step", Beats.COUNT + 50L + step * 90L) { play(step) }
	}

	protected fun shakeAll(roots: List<View>, amp: Float, ms: Long) {
		for (view in roots) shake(view, amp, ms)
	}
}

internal object SkinFinish {
	private const val FADE_MS = 300L
	/** Taps before this are ignored, so the tap-to-continue can't eat the keystroke that set the record. */
	private const val TAP_GRACE_MS = 900L

	private var rootRef: WeakReference<View>? = null
	private var overlay: Overlay? = null
	private var scene: FinishScene? = null
	private var crt: ArcadeShader? = null
	private var startedAt = 0L
	private var endingAt = 0L
	private val fired = HashSet<String>()

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (overlay == null) return
			tick()
			if (overlay != null) Choreographer.getInstance().postFrameCallback(this)
		}
	}

	/** Main thread only. */
	fun play(root: View, s: FinishScene) {
		stop()
		ArcadeFinish.stop()
		rootRef = WeakReference(root)
		scene = s
		startedAt = SystemClock.uptimeMillis()
		endingAt = 0L
		fired.clear()
		val o = Overlay()
		o.setBounds(0, 0, root.width, root.height)
		root.overlay.add(o)
		overlay = o
		crt = s.look?.let { Rendering.finishLook(root, it) }
		s.lookActive = crt != null
		Choreographer.getInstance().postFrameCallback(frame)
	}

	/** Called on every finger-down; true when it dismissed the finish (so the tap does nothing else). */
	fun consumeTap(): Boolean {
		if (overlay == null) return false
		if (SystemClock.uptimeMillis() - startedAt < TAP_GRACE_MS) return true
		if (endingAt == 0L) endingAt = SystemClock.uptimeMillis()
		return true
	}

	fun stop() {
		Choreographer.getInstance().removeFrameCallback(frame)
		overlay?.let { rootRef?.get()?.overlay?.remove(it) }
		crt?.clear()
		overlay = null
		crt = null
		scene = null
	}

	private fun tick() {
		val root = rootRef?.get() ?: return stop()
		val s = scene ?: return stop()
		val now = SystemClock.uptimeMillis()
		val t = now - startedAt
		if (endingAt == 0L && t >= Beats.TOTAL) endingAt = now
		val fade = if (endingAt == 0L) 1f else 1f - ((now - endingAt) / FADE_MS.toFloat())
		if (fade <= 0f) return stop()
		val roots = windowRoots(root)
		runCatching {
			s.cue(t, { key, ms, action -> if (t >= ms && fired.add(key)) runCatching(action) }, roots)
		}
		if (SHADERS_SUPPORTED) crt?.frame(min(1f, t / 180f) * fade, t / 1000f)
		overlay?.let {
			it.setBounds(0, 0, root.width, root.height)
			it.t = t
			it.fade = fade
			it.invalidateSelf()
		}
	}

	private class Overlay : Drawable() {
		var t = 0L
		var fade = 1f
		private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

		override fun draw(canvas: Canvas) {
			val s = scene ?: return
			runCatching { s.draw(canvas, paint, bounds.width().toFloat(), bounds.height().toFloat(), t, fade) }
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity() = PixelFormat.TRANSLUCENT
	}
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers shared by the scenes
// ---------------------------------------------------------------------------------------------

private fun Paint.fresh(): Paint {
	reset()
	isAntiAlias = true
	return this
}

private val pixelPaths = HashMap<String, Path>()

/** Pixel-font text centred on [x], [y]: hard shadow, outline, gradient fill (like the arcade finish). */
private fun pixelLine(c: Canvas, p: Paint, text: String, x: Float, y: Float, pixel: Float, alpha: Float, colors: IntArray, shadow: Int = col(0xFF000000)) {
	if (alpha <= 0f) return
	val path = pixelPaths.getOrPut(text) { PixelFont.path(text) }
	val width = PixelFont.width(text)
	val a = (255 * alpha.coerceIn(0f, 1f)).toInt()
	c.save()
	c.translate(x - width * pixel / 2f, y - PixelFont.HEIGHT * pixel / 2f)
	c.scale(pixel, pixel)
	p.fresh().style = Paint.Style.FILL
	p.color = shadow
	p.alpha = a * 7 / 10
	c.save()
	c.translate(0.6f, 0.6f)
	c.drawPath(path, p)
	c.restore()
	p.style = Paint.Style.STROKE
	p.strokeWidth = 0.45f
	p.color = Color.BLACK
	p.alpha = a
	c.drawPath(path, p)
	p.style = Paint.Style.FILL
	p.shader = LinearGradient(0f, 0f, 0f, PixelFont.HEIGHT.toFloat(), colors, null, Shader.TileMode.CLAMP)
	p.alpha = a
	c.drawPath(path, p)
	c.restore()
}

/** The pixel size that fits [text] into [fraction] of the width. */
private fun pixelFor(text: String, w: Float, fraction: Float) = w * fraction / (6f * max(1, text.length))

/** A line of [text] slammed in at [at]: from 3x down to size, fading in as it lands. */
private fun slamPixel(c: Canvas, p: Paint, text: String, x: Float, y: Float, pixel: Float, t: Long, at: Long, alpha: Float, colors: IntArray) {
	if (t < at) return
	val s = slamScale(t, at)
	c.save()
	c.scale(s, s, x, y)
	pixelLine(c, p, text, x, y, pixel, alpha * slamAlpha(s), colors)
	c.restore()
}

/** A line of ordinary type centred on [x] (baseline [y]), with outline, gradient or colour, and glow. */
private fun label(
	c: Canvas,
	p: Paint,
	text: String,
	x: Float,
	y: Float,
	size: Float,
	face: Typeface,
	alpha: Float,
	color: Int = Color.WHITE,
	gradient: IntArray? = null,
	outline: Int = 0,
	outlineWidth: Float = 0f,
	glow: Int = 0,
	align: Paint.Align = Paint.Align.CENTER,
) {
	if (alpha <= 0f) return
	val a = (255 * alpha.coerceIn(0f, 1f)).toInt()
	p.fresh().typeface = face
	p.textSize = size
	p.textAlign = align
	if (outlineWidth > 0f) {
		p.style = Paint.Style.STROKE
		p.strokeJoin = Paint.Join.ROUND
		p.strokeWidth = outlineWidth
		p.color = outline
		p.alpha = a
		c.drawText(text, x, y, p)
	}
	p.style = Paint.Style.FILL
	p.color = color
	p.alpha = a
	if (gradient != null) p.shader = LinearGradient(0f, y - size * 0.8f, 0f, y, gradient, null, Shader.TileMode.CLAMP)
	if (glow != 0) p.setShadowLayer(14f * dp, 0f, 0f, glow)
	c.drawText(text, x, y, p)
}

/** [label], slammed in at [at]. */
private fun slamLabel(
	c: Canvas, p: Paint, text: String, x: Float, y: Float, size: Float, face: Typeface, t: Long, at: Long, alpha: Float,
	color: Int = Color.WHITE, gradient: IntArray? = null, outline: Int = 0, outlineWidth: Float = 0f, glow: Int = 0, rotate: Float = 0f,
) {
	if (t < at) return
	val s = slamScale(t, at)
	c.save()
	c.rotate(rotate, x, y - size * 0.35f)
	c.scale(s, s, x, y - size * 0.35f)
	label(c, p, text, x, y, size, face, alpha * slamAlpha(s), color, gradient, outline, outlineWidth, glow)
	c.restore()
}

/** The size that fits [text] in [maxWidth] at most [size]. */
private fun fit(p: Paint, text: String, face: Typeface, size: Float, maxWidth: Float): Float {
	p.fresh().typeface = face
	p.textSize = size
	val width = p.measureText(text)
	return if (width > maxWidth) size * maxWidth / width else size
}

private fun dim(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float, color: Int = Color.BLACK, amount: Int = 190) {
	p.fresh().color = color
	p.alpha = (amount * min(1f, t / 200f) * alpha).toInt()
	c.drawRect(0f, 0f, w, h, p)
}

/** A glow from the edges in [color], like the arcade finish's red. */
private fun edgeGlow(c: Canvas, p: Paint, w: Float, h: Float, alpha: Float, color: Int, strength: Int = 120) {
	p.fresh().shader = RadialGradient(
		w / 2, h / 2, max(w, h) * 0.75f,
		intArrayOf(Color.TRANSPARENT, Color.argb((strength * alpha).toInt(), Color.red(color), Color.green(color), Color.blue(color))),
		floatArrayOf(0.45f, 1f), Shader.TileMode.CLAMP,
	)
	c.drawRect(0f, 0f, w, h, p)
}

private fun flashes(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float, color: Int = Color.WHITE, slam: Long = Beats.SLAM) {
	val flash = flashAlpha(t, 0L, 160L) + flashAlpha(t, slam, 120L) * 0.7f
	if (flash <= 0f) return
	p.fresh().color = color
	p.alpha = (255 * flash * alpha).toInt().coerceIn(0, 255)
	c.drawRect(0f, 0f, w, h, p)
}

/** Lines bursting out of [cx], [cy] after the slam (the arcade finish's speed lines). */
private fun speedLines(c: Canvas, p: Paint, w: Float, h: Float, cx: Float, cy: Float, t: Long, alpha: Float, color: Int, from: Long = Beats.SLAM - 20L) {
	if (t !in from..from + 420L) return
	val k = 1f - (t - from) / 420f
	p.fresh().style = Paint.Style.STROKE
	p.strokeWidth = 3f * dp
	p.color = color
	p.alpha = (200 * k * alpha).toInt()
	for (i in 0 until 28) {
		val angle = i * 2 * PI / 28 + i * 0.37
		val r1 = min(w, h) * (0.18f + 0.1f * ((i * 7) % 5) / 5f)
		val r2 = r1 + min(w, h) * 0.5f * k
		c.drawLine(
			cx + cos(angle).toFloat() * r1, cy + sin(angle).toFloat() * r1,
			cx + cos(angle).toFloat() * r2, cy + sin(angle).toFloat() * r2, p,
		)
	}
}

private fun blinking(t: Long) = t >= Beats.TAP && (t / 400L) % 2L == 0L

private object Face {
	val serif: Typeface by lazy { Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC) }
	val bold: Typeface = Typeface.DEFAULT_BOLD
	val condensed: Typeface by lazy { Typeface.create("sans-serif-condensed", Typeface.BOLD_ITALIC) }
	val black: Typeface by lazy { Typeface.create(Typeface.create("sans-serif-black", Typeface.NORMAL), Typeface.ITALIC) }
	val mono: Typeface by lazy { Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) }
	val casual: Typeface by lazy { Typeface.create("casual", Typeface.BOLD) }
}

// ---------------------------------------------------------------------------------------------
// Style Rank
// ---------------------------------------------------------------------------------------------

internal class StyleRankFinish(score: Int, val letter: String, val word: String, val color: Int) : FinishScene(score) {
	override val look = "stylerank"
	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("rank", Beats.SLAM) {
			shakeAll(roots, 20f, 450L)
			ComboSounds.sfx("sr_rankup", 1f, 1.1f)
		}
		at("record", Beats.TITLE) { ComboSounds.sfx("sr_slash", 0.8f) }
		countTicks(t, at) { ComboSounds.sfx("sr_slash", 0.5f, 1f + min(it, 10) * 0.06f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 12f, 350L)
			ComboSounds.sfx("sr_finish", 1f)
		}
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		dim(c, p, w, h, t, alpha, amount = 205)
		edgeGlow(c, p, w, h, alpha, color, 140)
		// Blade slashes sweeping across, faster at the start.
		p.fresh().style = Paint.Style.STROKE
		p.strokeCap = Paint.Cap.ROUND
		for (i in 0 until 6) {
			val life = ((t + i * 260L) % 1600L) / 1600f
			val y = h * (0.15f + hash(i) * 0.7f)
			p.strokeWidth = (1.5f + hash(i + 9) * 2.5f) * dp
			p.color = if (i % 2 == 0) Color.WHITE else color
			p.alpha = (140 * (1f - life) * alpha).toInt()
			val x0 = -w * 0.3f + life * w * 1.6f
			c.drawLine(x0, y + w * 0.12f, x0 + w * 0.5f, y - w * 0.12f, p)
		}
		flashes(c, p, w, h, t, alpha, color)

		val cx = w / 2
		speedLines(c, p, w, h, cx, h * 0.34f, t, alpha, color)
		slamLabel(c, p, "NEW RECORD", cx, h * 0.16f, fit(p, "NEW RECORD", Face.serif, 34f * dp, w * 0.86f), Face.serif, t, Beats.TITLE - 80L, alpha,
			color = Color.WHITE, outline = Color.BLACK, outlineWidth = 4f * dp)
		// The rank letter, huge, with its own glow.
		slamLabel(c, p, letter, cx, h * 0.42f, fit(p, letter, Face.serif, 170f * dp, w * 0.9f), Face.serif, t, Beats.SLAM - 100L, alpha,
			color = color, outline = Color.BLACK, outlineWidth = 8f * dp, glow = color)
		if (t >= Beats.COUNT) {
			val shown = countUp(score, t)
			val pop = if (t < Beats.COUNT + 750L) 1f + 0.08f * sin(t / 30f) else 1f
			label(c, p, "$shown HITS", cx, h * 0.53f, 30f * dp * pop, Face.serif, alpha * min(1f, (t - Beats.COUNT) / 120f),
				color = Color.WHITE, outline = Color.BLACK, outlineWidth = 4f * dp)
		}
		slamLabel(c, p, word.uppercase() + "!", cx, h * 0.66f, fit(p, word.uppercase() + "!", Face.serif, 40f * dp, w * 0.9f), Face.serif, t, Beats.STAMP, alpha,
			gradient = intArrayOf(Color.WHITE, color), outline = Color.BLACK, outlineWidth = 5f * dp, rotate = -7f)
		if (blinking(t)) label(c, p, "TAP TO CONTINUE", cx, h * 0.85f, 16f * dp, Face.serif, alpha, outline = Color.BLACK, outlineWidth = 3f * dp)
	}
}

// ---------------------------------------------------------------------------------------------
// Rhythm (osu!-style ranking screen)
// ---------------------------------------------------------------------------------------------

internal class RhythmFinish(
	score: Int,
	val grade: String,
	val gradeColor: Int,
	val counts: List<Triple<String, Int, Int>>,
	val accuracy: Float,
	val fullCombo: Boolean,
) : FinishScene(score) {
	override val look = "rhythm"
	private val pink = col(0xFFFF66AA)
	private val rect = RectF()

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("open", 80L) { ComboSounds.sfx("osu_hit", 1f, 0.8f) }
		at("grade", Beats.SLAM + 500L) {
			shakeAll(roots, 16f, 400L)
			ComboSounds.sfx("osu_rank", 1f)
		}
		countTicks(t, at) { ComboSounds.sfx("osu_hit", 0.6f, 1f + min(it, 10) * 0.05f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 10f, 300L)
			ComboSounds.sfx("osu_applause", 1f)
		}
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		dim(c, p, w, h, t, alpha, col(0xFF120B22), 235)
		// Soft triangles drifting up, the menu background of rhythm games.
		p.fresh().style = Paint.Style.FILL
		val tri = Path()
		for (i in 0 until 26) {
			val size = (18f + hash(i) * 46f) * dp
			val speed = 0.03f + hash(i + 40) * 0.05f
			val x = hash(i + 80) * w
			val y = h + size - ((t * speed * dp + hash(i + 120) * (h + size * 2)) % (h + size * 2))
			tri.reset()
			tri.moveTo(x, y - size)
			tri.lineTo(x + size * 0.87f, y + size * 0.5f)
			tri.lineTo(x - size * 0.87f, y + size * 0.5f)
			tri.close()
			p.color = if (i % 3 == 0) pink else col(0xFF6A4BC4)
			p.alpha = ((25 + hash(i + 7) * 35) * alpha).toInt()
			c.drawPath(tri, p)
		}
		flashes(c, p, w, h, t, alpha, pink)

		val cx = w / 2
		slamLabel(c, p, "NEW RECORD", cx, h * 0.12f, 26f * dp, Face.bold, t, Beats.TITLE, alpha, color = pink, glow = pink)

		// The grade, slammed in a beat after the panel opens.
		val gx = w * 0.28f
		val gy = h * 0.36f
		speedLines(c, p, w, h, gx, gy - 40f * dp, t, alpha, gradeColor, Beats.SLAM + 480L)
		slamLabel(c, p, grade, gx, gy, fit(p, grade, Face.bold, 150f * dp, w * 0.48f), Face.bold, t, Beats.SLAM + 500L, alpha,
			color = gradeColor, outline = Color.BLACK, outlineWidth = 6f * dp, glow = gradeColor)

		// The judgements, one line at a time, then max combo counting up.
		val col2 = w * 0.56f
		var y = h * 0.22f
		counts.forEachIndexed { i, (name, count, color) ->
			val showAt = Beats.TITLE + 150L + i * 120L
			if (t >= showAt) {
				val a = alpha * min(1f, (t - showAt) / 150f)
				label(c, p, name, col2, y, 18f * dp, Face.bold, a, color = color, align = Paint.Align.LEFT)
				label(c, p, "×$count", col2 + 64f * dp, y, 18f * dp, Face.bold, a, align = Paint.Align.LEFT)
			}
			y += 26f * dp
		}
		if (t >= Beats.COUNT) {
			val a = alpha * min(1f, (t - Beats.COUNT) / 120f)
			label(c, p, "MAX COMBO", col2, y + 8f * dp, 13f * dp, Face.bold, a, color = col(0xFFB9A8E8), align = Paint.Align.LEFT)
			label(c, p, "${countUp(score, t)}x", col2, y + 34f * dp, 26f * dp, Face.bold, a, align = Paint.Align.LEFT)
			val acc = accuracy * easeOut((t - Beats.COUNT) / 700f)
			label(c, p, "ACCURACY", col2, y + 58f * dp, 13f * dp, Face.bold, a, color = col(0xFFB9A8E8), align = Paint.Align.LEFT)
			label(c, p, String.format(java.util.Locale.US, "%.2f%%", acc), col2, y + 84f * dp, 26f * dp, Face.bold, a, align = Paint.Align.LEFT)
		}

		// FULL COMBO (or CLEARED!) stamped across.
		val stamp = if (fullCombo) "FULL COMBO" else "CLEARED!"
		slamLabel(c, p, stamp, cx, h * 0.68f, fit(p, stamp, Face.bold, 40f * dp, w * 0.86f), Face.bold, t, Beats.STAMP, alpha,
			gradient = intArrayOf(col(0xFFFFF0B0), col(0xFFFFCC33)), outline = Color.BLACK, outlineWidth = 5f * dp, rotate = -6f)

		if (blinking(t)) {
			rect.set(cx - 110f * dp, h * 0.85f - 22f * dp, cx + 110f * dp, h * 0.85f + 10f * dp)
			p.fresh().color = pink
			p.alpha = (200 * alpha).toInt()
			c.drawRoundRect(rect, 16f * dp, 16f * dp, p)
			label(c, p, "TAP TO CONTINUE", cx, h * 0.85f, 15f * dp, Face.bold, alpha)
		}
	}
}

// ---------------------------------------------------------------------------------------------
// Retro Platformer
// ---------------------------------------------------------------------------------------------

internal class PlatformerFinish(score: Int) : FinishScene(score) {
	override val look = "platformer"
	private val gold = intArrayOf(col(0xFFFFF6C8), col(0xFFFFD23F), col(0xFFFF8A00))
	private val white = intArrayOf(Color.WHITE, col(0xFFDDE6FF))
	private val green = intArrayOf(col(0xFFC8FFB0), col(0xFF35C43C))
	private val sparks = intArrayOf(col(0xFFFF4F79), col(0xFFFFC43D), col(0xFF3DDC97), col(0xFF4CC9F0), Color.WHITE)

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("clear", Beats.TITLE) {
			shakeAll(roots, 16f, 400L)
			ComboSounds.sfx("pf_clear", 1f)
		}
		countTicks(t, at) { ComboSounds.sfx("pf_coin", 0.55f, 1f + min(it, 10) * 0.04f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 12f, 350L)
			ComboSounds.sfx("pf_1up", 1f)
		}
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		// Night sky in two bands, twinkling pixel stars.
		p.fresh().shader = LinearGradient(0f, 0f, 0f, h, intArrayOf(col(0xFF0B1033), col(0xFF2B2F7A), col(0xFF6B3FA0)), null, Shader.TileMode.CLAMP)
		p.alpha = (235 * min(1f, t / 200f) * alpha).toInt()
		c.drawRect(0f, 0f, w, h, p)
		p.fresh().style = Paint.Style.FILL
		val px = 2.5f * dp
		for (i in 0 until 60) {
			val twinkle = 0.4f + 0.6f * abs(sin(t / 300f + i))
			p.color = Color.WHITE
			p.alpha = (200 * twinkle * alpha).toInt()
			val x = (hash(i) * w / px).toInt() * px
			val y = (hash(i + 60) * h * 0.8f / px).toInt() * px
			c.drawRect(x, y, x + px, y + px, p)
		}
		// Pixel fireworks going off one after another.
		for (k in 0 until 3) {
			val cycle = 900L
			val local = (t + k * 300L) % cycle
			val n = ((t + k * 300L) / cycle).toInt() * 3 + k
			if (t < 500L) continue
			val fx = w * (0.15f + hash(n) * 0.7f)
			val fy = h * (0.12f + hash(n + 500) * 0.3f)
			val life = local / cycle.toFloat()
			for (i in 0 until 16) {
				val ang = 2 * PI.toFloat() * i / 16
				val r = 70f * dp * easeOut(life)
				val x = ((fx + cos(ang) * r) / px).toInt() * px
				val y = ((fy + sin(ang) * r + 40f * dp * life * life) / px).toInt() * px
				p.color = sparks[(i + n) % sparks.size]
				p.alpha = (255 * (1f - life) * alpha).toInt()
				c.drawRect(x, y, x + px * 1.6f, y + px * 1.6f, p)
			}
		}
		flashes(c, p, w, h, t, alpha)

		val cx = w / 2
		speedLines(c, p, w, h, cx, h * 0.3f, t, alpha, col(0xFFFFE680))
		slamPixel(c, p, "COURSE", cx, h * 0.24f, pixelFor("COURSE", w, 0.6f), t, Beats.TITLE - 80L, alpha, gold)
		slamPixel(c, p, "CLEAR!", cx, h * 0.33f, pixelFor("CLEAR!", w, 0.86f), t, Beats.TITLE, alpha, gold)
		if (t >= Beats.COUNT) {
			val shown = countUp(score, t)
			val text = "COINS X" + shown.toString().padStart(3, '0')
			val pop = if (t < Beats.COUNT + 750L) 1f + 0.08f * sin(t / 30f) else 1f
			pixelLine(c, p, text, cx, h * 0.47f, pixelFor(text, w, 0.78f) * pop, alpha * min(1f, (t - Beats.COUNT) / 120f), white)
			// The coin itself, spinning beside the tally.
			val turn = abs(cos(t / 90f))
			val coinX = cx
			val coinY = h * 0.55f
			p.fresh().color = col(0xFFB8860B)
			p.alpha = (255 * alpha).toInt()
			c.drawOval(coinX - 12f * dp * turn, coinY - 16f * dp, coinX + 12f * dp * turn, coinY + 16f * dp, p)
			p.color = col(0xFFFFD84D)
			p.alpha = (255 * alpha).toInt()
			c.drawOval(coinX - 9f * dp * turn, coinY - 13f * dp, coinX + 9f * dp * turn, coinY + 13f * dp, p)
		}
		if (t >= Beats.STAMP) {
			c.save()
			c.rotate(-7f, cx, h * 0.66f)
			slamPixel(c, p, "NEW RECORD!", cx, h * 0.66f, pixelFor("NEW RECORD!", w, 0.8f), t, Beats.STAMP, alpha, green)
			c.restore()
		}
		if (blinking(t)) pixelLine(c, p, "TAP TO CONTINUE", cx, h * 0.85f, pixelFor("TAP TO CONTINUE", w, 0.6f), alpha, white)
	}
}

// ---------------------------------------------------------------------------------------------
// On Fire
// ---------------------------------------------------------------------------------------------

internal class OnFireFinish(score: Int) : FinishScene(score) {
	override val look = "onfire"
	private val fire = intArrayOf(col(0xFFFFF3A0), col(0xFFFFA23D), col(0xFFE8331C))
	private val flameColors = intArrayOf(col(0xFFFFF3A0), col(0xFFFFC23D), col(0xFFFF7A1F), col(0xFFE8331C))

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("roar", 60L) { ComboSounds.sfx("fire_ignite", 1f) }
		at("slam", Beats.SLAM) {
			shakeAll(roots, 20f, 450L)
			ComboSounds.sfx("fire_thump", 1f, 0.7f)
		}
		countTicks(t, at) { ComboSounds.sfx("fire_thump", 0.6f, 0.9f + min(it, 10) * 0.05f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 14f, 380L)
			ComboSounds.sfx("fire_heat", 1f)
		}
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		dim(c, p, w, h, t, alpha, col(0xFF140400), 215)
		// Heat rising from the bottom.
		p.fresh().shader = LinearGradient(0f, h * 0.5f, 0f, h, intArrayOf(Color.TRANSPARENT, col(0xAAFF5A1F)), null, Shader.TileMode.CLAMP)
		p.alpha = (255 * alpha).toInt()
		c.drawRect(0f, h * 0.5f, w, h, p)
		// A wall of flames along the bottom, each tongue flickering on its own.
		p.fresh().style = Paint.Style.FILL
		val tongues = 18
		val grow = min(1f, t / 500f)
		for (i in 0 until tongues) {
			val x = w * (i + 0.5f) / tongues
			val tall = h * 0.16f * grow * (0.6f + 0.4f * sin(t / 90f + i * 1.7f)) * (0.7f + hash(i) * 0.6f)
			for (layer in 0 until 4) {
				val k = layer / 3f
				p.color = flameColors[layer]
				p.alpha = ((200 - layer * 30) * alpha).toInt()
				val r = w / tongues * (1.1f - k * 0.55f)
				c.drawOval(x - r, h - tall * (1f - k * 0.35f), x + r, h + r, p)
			}
		}
		// Embers drifting up the whole screen.
		for (i in 0 until 50) {
			val speed = 0.12f + hash(i) * 0.2f
			val y = h - ((t * speed * dp + hash(i + 50) * h) % h)
			val x = hash(i + 100) * w + sin(t / 400f + i) * 18f * dp
			p.color = flameColors[i % 3]
			p.alpha = ((120 + hash(i + 3) * 120) * alpha * (y / h)).toInt()
			c.drawCircle(x, y, (1.5f + hash(i + 9) * 2f) * dp, p)
		}
		flashes(c, p, w, h, t, alpha, col(0xFFFFC23D))

		val cx = w / 2
		speedLines(c, p, w, h, cx, h * 0.28f, t, alpha, col(0xFFFFC23D))
		slamLabel(c, p, "UNSTOPPABLE!", cx, h * 0.3f, fit(p, "UNSTOPPABLE!", Face.condensed, 64f * dp, w * 0.92f), Face.condensed, t, Beats.TITLE, alpha,
			gradient = fire, outline = col(0xFF5A0A00), outlineWidth = 6f * dp, glow = col(0xFFFF7A1F))
		if (t >= Beats.COUNT) {
			val shown = countUp(score, t)
			val pop = if (t < Beats.COUNT + 750L) 1f + 0.08f * sin(t / 30f) else 1f
			label(c, p, "×$shown", cx, h * 0.47f, 72f * dp * pop, Face.condensed, alpha * min(1f, (t - Beats.COUNT) / 120f),
				gradient = fire, outline = col(0xFF2A0500), outlineWidth = 6f * dp, glow = col(0xFFFF7A1F))
		}
		slamLabel(c, p, "ON FIRE!", cx, h * 0.62f, fit(p, "ON FIRE!", Face.condensed, 56f * dp, w * 0.86f), Face.condensed, t, Beats.STAMP, alpha,
			gradient = intArrayOf(Color.WHITE, col(0xFFFFC23D)), outline = col(0xFF5A0A00), outlineWidth = 5f * dp, rotate = -7f)
		if (blinking(t)) label(c, p, "TAP TO CONTINUE", cx, h * 0.76f, 16f * dp, Face.condensed, alpha, outline = Color.BLACK, outlineWidth = 3f * dp)
	}
}

// ---------------------------------------------------------------------------------------------
// Shmup
// ---------------------------------------------------------------------------------------------

internal class ShmupFinish(score: Int, val points: Long) : FinishScene(score) {
	override val look = "shmup"
	private val cyan = intArrayOf(col(0xFFD8FBFF), col(0xFF35C8F0), col(0xFF1A6FD0))
	private val white = intArrayOf(Color.WHITE, col(0xFFFFF2A8))
	private val red = intArrayOf(col(0xFFFFB0B0), col(0xFFFF3B3B))

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("bomb", 40L) { ComboSounds.sfx("shmup_bomb", 1f) }
		at("slam", Beats.SLAM) {
			shakeAll(roots, 18f, 450L)
			ComboSounds.sfx("shmup_clear", 1f)
		}
		countTicks(t, at) { ComboSounds.sfx("shmup_shot", 0.6f, 1f + min(it, 10) * 0.05f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 12f, 350L)
			ComboSounds.sfx("shmup_bomb", 0.8f, 1.3f)
		}
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		dim(c, p, w, h, t, alpha, col(0xFF02030A), 235)
		// Stars streaming down past the ship.
		p.fresh().style = Paint.Style.FILL
		for (i in 0 until 90) {
			val depth = 0.3f + hash(i) * 0.7f
			val y = (hash(i + 90) * h + t * 0.9f * depth * dp) % h
			val x = hash(i + 180) * w
			p.color = Color.WHITE
			p.alpha = (255 * depth * alpha).toInt()
			c.drawRect(x, y, x + 1.5f * dp * depth, y + 6f * dp * depth, p)
		}
		// The bomb: a white shockwave filling the screen.
		if (t < 700L) {
			p.fresh().style = Paint.Style.STROKE
			val k = t / 700f
			p.strokeWidth = 24f * dp * (1f - k)
			p.color = Color.WHITE
			p.alpha = (255 * (1f - k) * alpha).toInt()
			c.drawCircle(w / 2, h * 0.75f, max(w, h) * easeOut(k), p)
		}
		flashes(c, p, w, h, t, alpha)

		val cx = w / 2
		speedLines(c, p, w, h, cx, h * 0.28f, t, alpha, col(0xFF5FF0FF))
		slamPixel(c, p, "STAGE", cx, h * 0.22f, pixelFor("STAGE", w, 0.55f), t, Beats.TITLE - 80L, alpha, cyan)
		slamPixel(c, p, "CLEAR", cx, h * 0.31f, pixelFor("CLEAR", w, 0.8f), t, Beats.TITLE, alpha, cyan)
		if (t >= Beats.COUNT) {
			val a = alpha * min(1f, (t - Beats.COUNT) / 120f)
			val progress = easeOut((t - Beats.COUNT - 50L) / 700f)
			val hits = "HITS " + countUp(score, t).toString().padStart(5, ' ')
			val bonus = "BONUS " + (points * progress).toLong().toString().padStart(8, '0')
			pixelLine(c, p, hits, cx, h * 0.44f, pixelFor(bonus, w, 0.8f), a, white)
			pixelLine(c, p, bonus, cx, h * 0.51f, pixelFor(bonus, w, 0.8f), a, white)
		}
		if (t >= Beats.STAMP) {
			c.save()
			c.rotate(-7f, cx, h * 0.64f)
			slamPixel(c, p, "ALL CLEAR!", cx, h * 0.64f, pixelFor("ALL CLEAR!", w, 0.8f), t, Beats.STAMP, alpha, red)
			c.restore()
		}
		if (blinking(t)) pixelLine(c, p, "TAP TO CONTINUE", cx, h * 0.85f, pixelFor("TAP TO CONTINUE", w, 0.6f), alpha, white)
	}
}

// ---------------------------------------------------------------------------------------------
// Comic Action
// ---------------------------------------------------------------------------------------------

internal class ComicFinish(score: Int) : FinishScene(score) {
	override val look = "comic"
	private val yellow = col(0xFFFFE14D)
	private val red = col(0xFFE8231F)
	private val rect = RectF()
	private val star = Path()

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("boom", Beats.SLAM) {
			shakeAll(roots, 22f, 500L)
			ComboSounds.sfx("comic_boom", 1f)
		}
		countTicks(t, at) { ComboSounds.sfx("comic_hit", 0.6f, 0.9f + min(it, 10) * 0.04f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 10f, 300L)
			ComboSounds.sfx("comic_pop", 1f, 0.85f)
		}
	}

	private fun burst(c: Canvas, p: Paint, x: Float, y: Float, r: Float, fill: Int, edge: Int, alpha: Float) {
		star.reset()
		val spikes = 16
		for (i in 0 until spikes * 2) {
			val ang = PI.toFloat() * i / spikes
			val rr = if (i % 2 == 0) r * (0.95f + 0.2f * hash(i)) else r * 0.62f
			val px = x + cos(ang) * rr * 1.2f
			val py = y + sin(ang) * rr
			if (i == 0) star.moveTo(px, py) else star.lineTo(px, py)
		}
		star.close()
		p.fresh().color = Color.BLACK
		p.alpha = (140 * alpha).toInt()
		c.save()
		c.translate(5f * dp, 6f * dp)
		c.drawPath(star, p)
		c.restore()
		p.color = fill
		p.alpha = (255 * alpha).toInt()
		c.drawPath(star, p)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 4f * dp
		p.color = edge
		p.alpha = (255 * alpha).toInt()
		c.drawPath(star, p)
	}

	private fun caption(c: Canvas, p: Paint, text: String, cx: Float, cy: Float, size: Float, alpha: Float, tilt: Float) {
		if (alpha <= 0f) return
		p.fresh().typeface = Face.black
		p.textSize = size
		val tw = p.measureText(text) + 24f * dp
		val th = size + 16f * dp
		c.save()
		c.rotate(tilt, cx, cy)
		rect.set(cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2)
		p.color = Color.BLACK
		p.alpha = (130 * alpha).toInt()
		c.drawRect(rect.left + 4f * dp, rect.top + 4f * dp, rect.right + 4f * dp, rect.bottom + 4f * dp, p)
		p.color = col(0xFFFFF27A)
		p.alpha = (255 * alpha).toInt()
		c.drawRect(rect, p)
		p.style = Paint.Style.STROKE
		p.strokeWidth = 3f * dp
		p.color = Color.BLACK
		c.drawRect(rect, p)
		p.style = Paint.Style.FILL
		p.textAlign = Paint.Align.CENTER
		c.drawText(text, cx, cy + size * 0.36f, p)
		c.restore()
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		val cx = w / 2
		val cy = h * 0.32f
		val bgAlpha = min(1f, t / 200f) * alpha
		// A comic panel: yellow, halftone dots growing toward the edges, black action lines.
		p.fresh().color = yellow
		p.alpha = (235 * bgAlpha).toInt()
		c.drawRect(0f, 0f, w, h, p)
		p.color = red
		val step = 12f * dp
		var gy = 0f
		var row = 0
		while (gy < h + step) {
			var gx = if (row % 2 == 0) 0f else step / 2
			while (gx < w + step) {
				val d = kotlin.math.hypot(gx - cx, gy - cy) / max(w, h)
				p.alpha = (110 * bgAlpha).toInt()
				c.drawCircle(gx, gy, (d * 7f).coerceAtMost(5.5f) * dp, p)
				gx += step
			}
			gy += step
			row++
		}
		p.fresh().color = Color.BLACK
		p.alpha = (200 * bgAlpha).toInt()
		val wedge = Path()
		for (i in 0 until 22) {
			val ang = 2 * PI.toFloat() * (i + hash(i) * 0.5f) / 22 + t / 4000f
			val spread = 0.035f + hash(i + 30) * 0.03f
			val r1 = min(w, h) * 0.36f
			val r2 = max(w, h) * 1.1f
			wedge.reset()
			wedge.moveTo(cx + cos(ang) * r1, cy + sin(ang) * r1)
			wedge.lineTo(cx + cos(ang - spread) * r2, cy + sin(ang - spread) * r2)
			wedge.lineTo(cx + cos(ang + spread) * r2, cy + sin(ang + spread) * r2)
			wedge.close()
			c.drawPath(wedge, p)
		}
		flashes(c, p, w, h, t, alpha)

		// KA-BOOM! slammed in a giant burst.
		if (t >= Beats.SLAM - 100L) {
			val s = slamScale(t, Beats.SLAM - 100L)
			val a = alpha * slamAlpha(s)
			c.save()
			c.scale(s, s, cx, cy)
			c.rotate(-6f, cx, cy)
			burst(c, p, cx, cy, min(w, h) * 0.34f, Color.WHITE, Color.BLACK, a)
			val size = fit(p, "KA-BOOM!", Face.black, 64f * dp, w * 0.74f)
			label(c, p, "KA-BOOM!", cx, cy + size * 0.36f, size, Face.black, a, color = red, outline = Color.BLACK, outlineWidth = size * 0.14f)
			c.restore()
		}
		if (t >= Beats.COUNT) {
			val pop = if (t < Beats.COUNT + 750L) 1f + 0.08f * sin(t / 30f) else 1f
			caption(c, p, "${countUp(score, t)} HITS!", cx, h * 0.56f, 30f * dp * pop, alpha * min(1f, (t - Beats.COUNT) / 120f), -3f)
		}
		if (t >= Beats.STAMP) {
			val slide = 1f - easeOut((t - Beats.STAMP) / 260f)
			c.save()
			c.translate(slide * w, 0f)
			caption(c, p, "TO BE CONTINUED…", cx, h * 0.7f, 22f * dp, alpha, 0f)
			// The arrow off its right side.
			p.fresh().typeface = Face.black
			p.textSize = 22f * dp
			val right = cx + (p.measureText("TO BE CONTINUED…") + 24f * dp) / 2
			val arrow = Path().apply {
				moveTo(right + 6f * dp, h * 0.7f - 16f * dp)
				lineTo(right + 34f * dp, h * 0.7f)
				lineTo(right + 6f * dp, h * 0.7f + 16f * dp)
				close()
			}
			p.color = Color.BLACK
			p.alpha = (255 * alpha).toInt()
			c.drawPath(arrow, p)
			c.restore()
		}
		if (blinking(t)) label(c, p, "TAP TO CONTINUE", cx, h * 0.86f, 18f * dp, Face.black, alpha, color = Color.BLACK)
	}
}

// ---------------------------------------------------------------------------------------------
// Hacker Terminal
// ---------------------------------------------------------------------------------------------

internal class TerminalFinish(score: Int) : FinishScene(score) {
	override val look = "terminal"
	private val green = col(0xFF33FF66)
	private val dimGreen = col(0xFF1E9E45)
	private val red = col(0xFFFF3B3B)
	private val chars = "0123456789ABCDEF<>/{}[]#\$%&*=+;:"
	private val rect = RectF()

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("chirp", 60L) { ComboSounds.sfx("term_chirp", 1f) }
		at("granted", Beats.SLAM) {
			shakeAll(roots, 16f, 400L)
			ComboSounds.sfx("term_granted", 1f)
			val root = roots.lastOrNull() ?: return@at
			styleOrNull("glitch")?.let {
				val loc = IntArray(2)
				root.getLocationOnScreen(loc)
				distort(root, it, loc[0] + root.width / 2f, loc[1] + root.height * 0.3f, 1.8f)
			}
		}
		countTicks(t, at) { ComboSounds.sfx("term_key", 0.8f, 1f + min(it, 10) * 0.05f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 10f, 300L)
			ComboSounds.sfx("term_denied", 0.8f, 1.4f)
		}
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		dim(c, p, w, h, t, alpha, Color.BLACK, 240)
		// Falling columns of code.
		p.fresh().typeface = Face.mono
		p.textSize = 13f * dp
		p.textAlign = Paint.Align.CENTER
		val colW = 15f * dp
		val rowH = 16f * dp
		val columns = (w / colW).toInt() + 1
		for (column in 0 until columns) {
			val speed = 0.15f + hash(column) * 0.25f
			val trail = 8 + (hash(column + 77) * 14).toInt()
			val head = ((t * speed * dp + hash(column + 200) * h * 2) % (h + trail * rowH)) / rowH
			for (k in 0 until trail) {
				val row = head.toInt() - k
				if (row < 0) continue
				val y = row * rowH
				if (y > h) continue
				val ch = chars[(hash(column * 131 + row + (t / 140L).toInt() * (k % 3)) * chars.length).toInt() % chars.length]
				p.color = if (k == 0) Color.WHITE else green
				p.alpha = ((if (k == 0) 230 else 170) * (1f - k / trail.toFloat()) * alpha * 0.6f).toInt()
				c.drawText(ch.toString(), column * colW + colW / 2, y, p)
			}
		}
		flashes(c, p, w, h, t, alpha, green)

		val cx = w / 2
		// ACCESS GRANTED in a bordered box, slammed and glitching as it lands.
		if (t >= Beats.TITLE) {
			val s = slamScale(t, Beats.TITLE)
			val a = alpha * slamAlpha(s)
			val size = fit(p, "ACCESS GRANTED", Face.mono, 34f * dp, w * 0.8f)
			c.save()
			c.scale(s, s, cx, h * 0.28f)
			val jx = if (t < Beats.SLAM + 400L) (hash((t / 40L).toInt()) - 0.5f) * 10f * dp else 0f
			p.fresh().typeface = Face.mono
			p.textSize = size
			val bw = p.measureText("ACCESS GRANTED") + 36f * dp
			rect.set(cx - bw / 2 + jx, h * 0.28f - size * 1.1f, cx + bw / 2 + jx, h * 0.28f + size * 0.6f)
			p.color = col(0xFF020804)
			p.alpha = (240 * a).toInt()
			c.drawRect(rect, p)
			p.style = Paint.Style.STROKE
			p.strokeWidth = 2.5f * dp
			p.color = green
			p.alpha = (255 * a).toInt()
			c.drawRect(rect, p)
			if (t < Beats.SLAM + 400L) {
				label(c, p, "ACCESS GRANTED", cx + jx - 4f * dp, h * 0.28f, size, Face.mono, a * 0.7f, color = red)
				label(c, p, "ACCESS GRANTED", cx + jx + 4f * dp, h * 0.28f, size, Face.mono, a * 0.7f, color = col(0xFF35C8F0))
			}
			label(c, p, "ACCESS GRANTED", cx + jx, h * 0.28f, size, Face.mono, a, color = green, glow = green)
			c.restore()
		}
		// Typed-out lines, the keys logged counting up.
		val lines = listOf(
			Beats.COUNT - 200L to "> handshake ........ OK",
			Beats.COUNT to "> keys logged ...... ${countUp(score, t)}",
			Beats.COUNT + 400L to "> privileges ....... root",
		)
		var y = h * 0.42f
		for ((showAt, text) in lines) {
			if (t >= showAt) {
				val typed = min(text.length, ((t - showAt) / 18L).toInt())
				label(c, p, text.take(typed), w * 0.1f, y, 15f * dp, Face.mono, alpha, color = green, glow = dimGreen, align = Paint.Align.LEFT)
			}
			y += 24f * dp
		}
		if (t >= Beats.STAMP) {
			slamLabel(c, p, "[ SYSTEM BREACHED ]", cx, h * 0.64f, fit(p, "[ SYSTEM BREACHED ]", Face.mono, 26f * dp, w * 0.9f), Face.mono, t, Beats.STAMP, alpha,
				color = red, glow = red, rotate = -5f)
		}
		if (t >= Beats.TAP) {
			val cursor = if ((t / 400L) % 2L == 0L) "_" else " "
			label(c, p, "> press anywhere to continue$cursor", cx, h * 0.85f, 13f * dp, Face.mono, alpha, color = green)
		}
	}
}

// ---------------------------------------------------------------------------------------------
// Cosy: the gentle one. No slams or shakes; things bloom instead.
// ---------------------------------------------------------------------------------------------

internal class CosyFinish(score: Int) : FinishScene(score) {
	override val look = "cosy"
	private val pink = col(0xFFFF8FB1)
	private val ink = col(0xFF7A5C58)
	private val petals = intArrayOf(col(0xFFFFB7C9), col(0xFFFFD6A5), col(0xFFC9F2C7), col(0xFFFFF1A8), col(0xFFD7C4FF))
	/** Notes for the count-up, climbing a pentatonic scale. */
	private val rates = floatArrayOf(1f, 1.125f, 1.25f, 1.5f, 1.6667f, 2f)

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("chime", 120L) { ComboSounds.sfx("cosy_chime", 0.9f) }
		countTicks(t, at) { ComboSounds.sfx("cosy_note", 0.5f, rates[min(it, rates.size - 1)]) }
		at("bloom", Beats.STAMP) { ComboSounds.sfx("cosy_pop", 0.8f) }
	}

	/** Gentle: grows from small to full with a soft overshoot, no slam. */
	private fun bloom(t: Long, at: Long) = if (t < at) 0f else {
		val x = ((t - at) / 420f).coerceIn(0f, 1f) - 1f
		1f + 2.2f * x * x * x + 1.2f * x * x
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		val a0 = min(1f, t / 400f) * alpha
		// A warm cream wash with a pink glow at the edges; under Enchanted forest, a dark moss one so
		// its sunbeams and fireflies show.
		p.fresh().color = if (lookActive) col(0xFF0B2414) else col(0xFFFFF7EE)
		p.alpha = ((if (lookActive) 170 else 225) * a0).toInt()
		c.drawRect(0f, 0f, w, h, p)
		edgeGlow(c, p, w, h, a0, pink, 90)
		// Petals and leaves falling slowly, swaying.
		p.fresh().style = Paint.Style.FILL
		for (i in 0 until 40) {
			val speed = 0.03f + hash(i) * 0.04f
			val y = (hash(i + 40) * h + t * speed * dp) % (h + 30f * dp) - 15f * dp
			val x = hash(i + 80) * w + sin(t / 900f * (0.6f + hash(i + 5)) + i) * 30f * dp
			val size = (5f + hash(i + 3) * 4f) * dp
			c.save()
			c.translate(x, y)
			c.rotate(t / 20f * (hash(i + 11) - 0.5f) + i * 40f)
			c.scale(0.4f + 0.6f * abs(cos(t / 500f + i)), 1f)
			val leaf = i % 4 == 0
			p.color = if (leaf) col(0xFF9BD08A) else petals[i % petals.size]
			p.alpha = (230 * a0).toInt()
			c.drawOval(-size, -size * (if (leaf) 0.45f else 0.62f), size, size * (if (leaf) 0.45f else 0.62f), p)
			c.restore()
		}

		val cx = w / 2
		val title = "A new best!"
		val titleSize = fit(p, title, Face.casual, 44f * dp, w * 0.86f)
		val b1 = bloom(t, Beats.TITLE)
		if (b1 > 0f) {
			c.save()
			c.scale(b1, b1, cx, h * 0.28f)
			label(c, p, title, cx, h * 0.28f, titleSize, Face.casual, alpha, color = pink, outline = Color.WHITE, outlineWidth = 6f * dp)
			c.restore()
		}
		if (t >= Beats.COUNT) {
			label(c, p, "${countUp(score, t)} in a row", cx, h * 0.4f, 28f * dp, Face.casual, alpha * min(1f, (t - Beats.COUNT) / 300f),
				color = if (lookActive) col(0xFFFFF7EE) else ink, outline = if (lookActive) col(0xFF0B2414) else Color.WHITE, outlineWidth = 5f * dp)
		}
		// A big flower blooming open where Arcade would stamp.
		val b2 = bloom(t, Beats.STAMP)
		if (b2 > 0f) {
			val fx = cx
			val fy = h * 0.58f
			val r = 26f * dp * b2
			c.save()
			c.rotate(t / 60f, fx, fy)
			p.fresh().color = pink
			p.alpha = (255 * alpha).toInt()
			for (i in 0 until 6) {
				val ang = 2 * PI.toFloat() * i / 6
				c.drawCircle(fx + cos(ang) * r, fy + sin(ang) * r, r * 0.75f, p)
			}
			p.color = col(0xFFFFD84D)
			c.drawCircle(fx, fy, r * 0.6f, p)
			c.restore()
		}
		if (t >= Beats.TAP) {
			val pulse = 0.55f + 0.45f * sin(t / 300f)
			label(c, p, "tap to continue", cx, h * 0.82f, 16f * dp, Face.casual, alpha * pulse, color = if (lookActive) col(0xFFFFF7EE) else ink)
		}
	}
}

// ---------------------------------------------------------------------------------------------
// Time circuits: the jump. A flash, the time circuits ticking in, fire trails along the bottom.
// ---------------------------------------------------------------------------------------------

internal class TimeCircuitsFinish(score: Int) : FinishScene(score) {
	override val look = "timecircuits"
	private val red = col(0xFFFF2A1F)
	private val green = col(0xFF39FF6A)
	private val amber = col(0xFFFFB020)
	private val blue = col(0xFF7CC8FF)
	private val whiteBlue = col(0xFFE6F4FF)
	private val flame = intArrayOf(col(0xFFFFF3A0), col(0xFFFFB238), col(0xFFFF7A1F), col(0xFFE8331C))
	private val rect = RectF()
	private val months = arrayOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")

	/** Today, and today [score] years on: where a record this size takes you. */
	private val present: String
	private val destination: String

	init {
		val now = Calendar.getInstance()
		fun format(cal: Calendar) = "${months[cal.get(Calendar.MONTH)]} ${cal.get(Calendar.DAY_OF_MONTH).toString().padStart(2, '0')} ${cal.get(Calendar.YEAR)}"
		present = format(now)
		destination = format((now.clone() as Calendar).apply { add(Calendar.YEAR, score) })
	}

	override fun cue(t: Long, at: (String, Long, () -> Unit) -> Unit, roots: List<View>) {
		at("whine", 0L) { ComboSounds.sfx("tc_whine", 1f) }
		at("jump", Beats.SLAM) {
			shakeAll(roots, 16f, 400L)
			ComboSounds.sfx("tc_boom", 1f)
			val root = roots.lastOrNull() ?: return@at
			styleOrNull("timejump")?.let {
				val loc = IntArray(2)
				root.getLocationOnScreen(loc)
				distort(root, it, loc[0] + root.width / 2f, loc[1] + root.height * 0.3f, 2f)
			}
		}
		countTicks(t, at) { ComboSounds.sfx("tc_zap", 0.7f, 0.9f + min(it, 10) * 0.06f) }
		at("stamp", Beats.STAMP) {
			shakeAll(roots, 10f, 300L)
			ComboSounds.sfx("tc_boom", 0.7f, 1.3f)
		}
	}

	/** Two lines of flame racing left to right along the bottom after the jump, then dying down. */
	private fun fireTrails(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		if (t < Beats.SLAM) return
		val reach = ((t - Beats.SLAM) / 600f).coerceIn(0f, 1f) * w
		val dying = ((t - Beats.STAMP - 800L) / 900f).coerceIn(0f, 1f)
		p.fresh().style = Paint.Style.FILL
		var x = 0f
		var i = 0
		while (x < reach) {
			for ((row, y) in floatArrayOf(h * 0.8f, h * 0.8f + 22f * dp).withIndex()) {
				val seed = i * 2 + row
				val flick = 0.7f + 0.3f * sin(t / 40f + hash(seed) * 20f)
				val size = (9f + 5f * hash(seed + 99)) * dp * (1f - dying * 0.7f)
				val height = size * (1.8f + 0.9f * flick)
				p.color = flame[min(flame.size - 1, (hash(seed + 7) * flame.size).toInt())]
				p.alpha = (220 * alpha * (1f - dying)).toInt()
				rect.set(x - size / 2f, y - height, x + size / 2f, y + size * 0.35f)
				c.drawOval(rect, p)
				p.color = col(0xFFFFF4C2)
				p.alpha = (190 * alpha * (1f - dying) * flick).toInt()
				rect.set(x - size / 4f, y - height * 0.55f, x + size / 4f, y + size * 0.2f)
				c.drawOval(rect, p)
			}
			x += 10f * dp
			i++
		}
	}

	/** One row of the time circuits: a small label over a glowing readout. */
	private fun row(c: Canvas, p: Paint, label: String, value: String, x: Float, y: Float, w: Float, color: Int, t: Long, from: Long, alpha: Float) {
		if (t < from) return
		val a = alpha * ((t - from) / 150f).coerceIn(0f, 1f)
		label(c, p, label, x, y, 10f * dp, Face.condensed, a, color = color, align = Paint.Align.LEFT)
		val size = fit(p, value, Face.mono, 24f * dp, w)
		rect.set(x - 6f * dp, y + 4f * dp, x + w + 6f * dp, y + 10f * dp + size)
		p.fresh().color = col(0xFF07080A)
		p.alpha = (235 * a).toInt()
		c.drawRoundRect(rect, 4f * dp, 4f * dp, p)
		label(c, p, value, x, y + 4f * dp + size, size, Face.mono, a, color = color, glow = color, align = Paint.Align.LEFT)
	}

	override fun draw(c: Canvas, p: Paint, w: Float, h: Float, t: Long, alpha: Float) {
		dim(c, p, w, h, t, alpha, Color.BLACK, 225)
		edgeGlow(c, p, w, h, alpha, blue, 90)
		flashes(c, p, w, h, t, alpha, whiteBlue)
		fireTrails(c, p, w, h, t, alpha)

		val cx = w / 2
		slamLabel(c, p, "TIME JUMP!", cx, h * 0.24f, fit(p, "TIME JUMP!", Face.black, 48f * dp, w * 0.86f), Face.black, t, Beats.TITLE, alpha,
			color = whiteBlue, outline = col(0xFF0A1A3A), outlineWidth = 5f * dp, glow = blue)

		val panelW = min(w * 0.82f, 340f * dp)
		val x = cx - panelW / 2f
		row(c, p, "DESTINATION TIME", destination, x, h * 0.34f, panelW, red, t, Beats.COUNT - 300L, alpha)
		row(c, p, "PRESENT TIME", present, x, h * 0.34f + 56f * dp, panelW, green, t, Beats.COUNT - 150L, alpha)
		row(c, p, "TOP SPEED", "${countUp(score, t) * 2} MPH", x, h * 0.34f + 112f * dp, panelW, amber, t, Beats.COUNT, alpha)

		slamLabel(c, p, "88 MPH", cx, h * 0.72f, fit(p, "88 MPH", Face.black, 40f * dp, w * 0.7f), Face.black, t, Beats.STAMP, alpha,
			color = red, outline = col(0xFF2A0402), outlineWidth = 4f * dp, glow = red, rotate = -6f)
		if (blinking(t)) label(c, p, "TAP TO CONTINUE", cx, h * 0.92f, 14f * dp, Face.condensed, alpha, color = whiteBlue)
	}
}
