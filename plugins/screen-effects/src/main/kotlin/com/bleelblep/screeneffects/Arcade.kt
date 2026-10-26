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
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * The new-high-score "finish": a full-screen, arcade-cabinet takeover in the spirit of 90s
 * fighting games. The screen flashes, dims and turns into a curved, scanlined, jittering CRT;
 * NEW HIGH SCORE slams in with speed lines and a shake; the combo counts up as "N HITS"; FLAWLESS!
 * stamps down; TAP TO CONTINUE blinks until a tap or a timeout.
 *
 * The lettering is a hand-made 5x7 pixel font below (no font files, nothing licensed), drawn as
 * one Path per line with a gold-to-red gradient, a black outline and a hard drop shadow. The CRT is
 * a transient RenderEffect through [Compositor], so it bends the overlay's lettering too.
 */
internal object ArcadeFinish {
	private const val TOTAL_MS = 4800L
	private const val FADE_MS = 300L
	/** Taps before this are ignored, so the tap-to-continue can't eat the keystroke that set the record. */
	private const val TAP_GRACE_MS = 900L

	private var rootRef: WeakReference<View>? = null
	private var overlay: Overlay? = null
	private var startedAt = 0L
	private var endingAt = 0L
	private var score = 0
	private var crt: ArcadeShader? = null

	/** Things that happen once, at a point in the timeline. */
	private val fired = HashSet<String>()

	val active get() = overlay != null

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (overlay == null) return
			tick()
			if (overlay != null) Choreographer.getInstance().postFrameCallback(this)
		}
	}

	/** Main thread only. */
	fun play(root: View, combo: Int) {
		stop()
		rootRef = WeakReference(root)
		score = combo
		startedAt = SystemClock.uptimeMillis()
		endingAt = 0L
		fired.clear()
		val o = Overlay()
		o.setBounds(0, 0, root.width, root.height)
		root.overlay.add(o)
		overlay = o
		crt = Rendering.arcade(root)
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
		val root = rootRef?.get()
		overlay?.let { root?.overlay?.remove(it) }
		crt?.clear()
		overlay = null
		crt = null
	}

	private fun once(key: String, atMs: Long, now: Long, action: () -> Unit) {
		if (now >= atMs && fired.add(key)) runCatching(action)
	}

	private fun tick() {
		val root = rootRef?.get() ?: return stop()
		val now = SystemClock.uptimeMillis()
		val t = now - startedAt
		if (endingAt == 0L && t >= TOTAL_MS) endingAt = now
		val fade = if (endingAt == 0L) 1f else 1f - ((now - endingAt) / FADE_MS.toFloat())
		if (fade <= 0f) return stop()

		val sounds = Settings.comboSounds
		once("slam", 300L, t) {
			for (view in windowRoots(root)) shake(view, 20f, 450L)
			if (sounds) ComboSounds.impact()
		}
		once("voice", 420L, t) { if (sounds) ComboSounds.newHighScore() }
		once("stamp", 2150L, t) {
			for (view in windowRoots(root)) shake(view, 12f, 350L)
			if (sounds) {
				ComboSounds.impact()
				ComboSounds.flawless()
			}
		}
		// A punch per few hits while the counter climbs, capped so a huge combo isn't a drum roll.
		if (sounds && t in 1000L..1700L) {
			val step = ((t - 1000L) / 90L).toInt()
			once("tick$step", 1000L + step * 90L, t) { ComboSounds.tick(step) }
		}

		if (SHADERS_SUPPORTED) crt?.frame(min(1f, t / 180f) * fade, t / 1000f)
		overlay?.let {
			it.setBounds(0, 0, root.width, root.height)
			it.state(t, fade, score)
			it.invalidateSelf()
		}
	}

	/** Everything drawn over the window. */
	private class Overlay : Drawable() {
		private val density = Resources.getSystem().displayMetrics.density
		private var t = 0L
		private var fade = 1f
		private var score = 0
		private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
		private val cache = HashMap<String, Path>()

		fun state(t: Long, fade: Float, score: Int) {
			this.t = t
			this.fade = fade
			this.score = score
		}

		private fun textPath(text: String): Path = cache.getOrPut(text) { PixelFont.path(text) }

		override fun draw(canvas: Canvas) {
			val w = bounds.width().toFloat()
			val h = bounds.height().toFloat()
			val a = fade

			// Dim, with a red glow bleeding in from the edges.
			paint.shader = null
			paint.style = Paint.Style.FILL
			paint.color = Color.argb((190 * min(1f, t / 200f) * a).toInt(), 0, 0, 0)
			canvas.drawRect(0f, 0f, w, h, paint)
			paint.shader = RadialGradient(
				w / 2, h / 2, maxOf(w, h) * 0.75f,
				intArrayOf(Color.TRANSPARENT, Color.argb((120 * a).toInt(), 160, 0, 0)),
				floatArrayOf(0.45f, 1f), Shader.TileMode.CLAMP,
			)
			canvas.drawRect(0f, 0f, w, h, paint)
			paint.shader = null

			// Opening flash, and a second one on the slam.
			val flash = flashAlpha(t, 0L, 160L) + flashAlpha(t, 300L, 120L) * 0.7f
			if (flash > 0f) {
				paint.color = Color.argb((255 * flash * a).toInt(), 255, 255, 255)
				canvas.drawRect(0f, 0f, w, h, paint)
			}

			val cx = w / 2
			val titleY = h * 0.30f

			// Speed lines out of the slam.
			if (t in 280L..700L) {
				val k = 1f - (t - 280L) / 420f
				paint.color = Color.argb((200 * k * a).toInt(), 255, 230, 120)
				paint.strokeWidth = 3f * density
				paint.style = Paint.Style.STROKE
				for (i in 0 until 28) {
					val angle = i * 2 * PI / 28 + i * 0.37
					val r1 = min(w, h) * (0.18f + 0.1f * ((i * 7) % 5) / 5f)
					val r2 = r1 + min(w, h) * 0.5f * k
					canvas.drawLine(
						cx + cos(angle).toFloat() * r1, titleY + sin(angle).toFloat() * r1,
						cx + cos(angle).toFloat() * r2, titleY + sin(angle).toFloat() * r2, paint,
					)
				}
				paint.style = Paint.Style.FILL
			}

			// NEW, then HIGH SCORE, slamming from huge to size.
			if (t >= 120L) {
				val pixel = w * 0.86f / (6f * 10f)
				drawSlam(canvas, "NEW", cx, titleY - pixel * 9.5f, pixel * 0.7f, slamScale(t, 120L), a, GOLD)
			}
			if (t >= 200L) {
				val pixel = w * 0.86f / (6f * 10f)
				drawSlam(canvas, "HIGH SCORE", cx, titleY, pixel, slamScale(t, 200L), a, GOLD)
			}

			// N HITS, counting up.
			if (t >= 950L) {
				val progress = ((t - 1000L) / 700f).coerceIn(0f, 1f)
				val shown = (score * easeOut(progress)).toInt().coerceAtLeast(1)
				val text = "$shown HIT${if (shown == 1) "" else "S"}"
				val pixel = w * 0.8f / (6f * maxOf(8, text.length))
				val pop = if (progress < 1f) 1f + 0.08f * sin(t / 30f) else 1f
				drawText(canvas, text, cx, h * 0.47f, pixel * pop, a * min(1f, (t - 950L) / 120f), RED_WHITE)
			}

			// FLAWLESS!, stamped at an angle.
			if (t >= 2050L) {
				val pixel = w * 0.8f / (6f * 9f)
				canvas.save()
				canvas.rotate(-7f, cx, h * 0.63f)
				drawSlam(canvas, "FLAWLESS!", cx, h * 0.63f, pixel, slamScale(t, 2050L), a, BLOOD)
				canvas.restore()
			}

			// TAP TO CONTINUE, blinking like an attract screen.
			if (t >= 2700L && (t / 400L) % 2L == 0L) {
				val pixel = w * 0.6f / (6f * 15f)
				drawText(canvas, "TAP TO CONTINUE", cx, h * 0.85f, pixel, a, WHITE)
			}
		}

		private fun flashAlpha(t: Long, at: Long, length: Long): Float =
			if (t < at || t > at + length) 0f else 1f - (t - at) / length.toFloat()

		/** 3x down to 1x over 140 ms with a small overshoot, like a fist landing. */
		private fun slamScale(t: Long, at: Long): Float {
			val p = ((t - at) / 140f).coerceIn(0f, 1f)
			if (p < 1f) return 3f - 2.1f * p * p
			val settle = ((t - at - 140L) / 160f).coerceIn(0f, 1f)
			return 0.9f + 0.1f * settle
		}

		private fun easeOut(p: Float) = 1f - (1f - p) * (1f - p)

		private fun drawSlam(canvas: Canvas, text: String, x: Float, y: Float, pixel: Float, scale: Float, alpha: Float, colors: IntArray) {
			canvas.save()
			canvas.scale(scale, scale, x, y)
			val arrive = if (scale > 1.2f) (3f - scale) / 1.8f else 1f
			drawText(canvas, text, x, y, pixel, alpha * arrive.coerceIn(0f, 1f), colors)
			canvas.restore()
		}

		/** One line of pixel text centred on [x], [y]: shadow, outline, gradient fill. */
		private fun drawText(canvas: Canvas, text: String, x: Float, y: Float, pixel: Float, alpha: Float, colors: IntArray) {
			if (alpha <= 0f) return
			val path = textPath(text)
			val width = PixelFont.width(text)
			canvas.save()
			canvas.translate(x - width * pixel / 2f, y - PixelFont.HEIGHT * pixel / 2f)
			canvas.scale(pixel, pixel)
			val a = (255 * alpha.coerceIn(0f, 1f)).toInt()

			paint.shader = null
			paint.style = Paint.Style.FILL
			paint.color = Color.argb(a, 60, 0, 0)
			canvas.save()
			canvas.translate(0.6f, 0.6f)
			canvas.drawPath(path, paint)
			canvas.restore()

			paint.style = Paint.Style.STROKE
			paint.strokeWidth = 0.45f
			paint.strokeJoin = Paint.Join.MITER
			paint.color = Color.argb(a, 0, 0, 0)
			canvas.drawPath(path, paint)

			paint.style = Paint.Style.FILL
			paint.shader = LinearGradient(0f, 0f, 0f, PixelFont.HEIGHT.toFloat(), colors, null, Shader.TileMode.CLAMP)
			paint.alpha = a
			canvas.drawPath(path, paint)
			paint.shader = null
			canvas.restore()
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity() = PixelFormat.TRANSLUCENT
	}

	private val GOLD = intArrayOf(0xFFFFF6B0.toInt(), 0xFFFFD23F.toInt(), 0xFFFF8A00.toInt(), 0xFFD7263D.toInt())
	private val BLOOD = intArrayOf(0xFFFF6B6B.toInt(), 0xFFE0112B.toInt(), 0xFF8B0000.toInt())
	private val RED_WHITE = intArrayOf(0xFFFFFFFF.toInt(), 0xFFFFD0D0.toInt(), 0xFFFF3B3B.toInt())
	private val WHITE = intArrayOf(0xFFFFFFFF.toInt(), 0xFFE0E0E0.toInt())
}

/** A CRT for the finish: curvature, colour bleed, scanlines, a rolling bright band and jitter. */
internal const val ARCADE_CRT = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float strength;
uniform float time;
half4 main(float2 p) {
    float2 uv = p / size * 2.0 - 1.0;
    uv *= 1.0 + 0.09 * strength * (uv.yx * uv.yx);
    if (abs(uv.x) > 1.0 || abs(uv.y) > 1.0) return half4(0.0, 0.0, 0.0, 1.0);
    float2 q = (uv + 1.0) * 0.5 * size;
    q.x += sin(time * 47.0 + q.y * 0.045) * 0.7 * density * strength;
    float bleed = 2.2 * density * strength;
    half4 c = img.eval(q);
    c.r = img.eval(q + float2(bleed, 0.0)).r;
    c.b = img.eval(q - float2(bleed, 0.0)).b;
    float scan = mix(1.0, 0.72 + 0.28 * sin(q.y / density * 3.14159265), strength);
    float band = max(0.0, 1.0 - abs(fract(q.y / size.y - time * 0.35) - 0.5) * 7.0);
    float vignette = mix(1.0, smoothstep(1.45, 0.45, length(uv)), strength);
    float light = scan * vignette * (1.0 + 0.1 * strength * band);
    return half4(c.rgb * half(light), c.a);
}
"""

/** A hand-drawn 5x7 pixel font: capitals, digits and a little punctuation. Original, no licence. */
internal object PixelFont {
	const val HEIGHT = 7
	private const val ADVANCE = 6

	private val GLYPHS: Map<Char, Array<String>> = mapOf(
		'A' to arrayOf(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
		'B' to arrayOf("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
		'C' to arrayOf(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
		'D' to arrayOf("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
		'E' to arrayOf("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
		'F' to arrayOf("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
		'G' to arrayOf(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"),
		'H' to arrayOf("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
		'I' to arrayOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"),
		'J' to arrayOf("..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."),
		'K' to arrayOf("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
		'L' to arrayOf("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
		'M' to arrayOf("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),
		'N' to arrayOf("#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"),
		'O' to arrayOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
		'P' to arrayOf("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
		'Q' to arrayOf(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
		'R' to arrayOf("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
		'S' to arrayOf(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
		'T' to arrayOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
		'U' to arrayOf("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
		'V' to arrayOf("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
		'W' to arrayOf("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"),
		'X' to arrayOf("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
		'Y' to arrayOf("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
		'Z' to arrayOf("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
		'0' to arrayOf(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
		'1' to arrayOf("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
		'2' to arrayOf(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
		'3' to arrayOf("####.", "....#", "....#", ".###.", "....#", "....#", "####."),
		'4' to arrayOf("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
		'5' to arrayOf("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
		'6' to arrayOf(".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."),
		'7' to arrayOf("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
		'8' to arrayOf(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
		'9' to arrayOf(".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."),
		'!' to arrayOf("..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."),
		'-' to arrayOf(".....", ".....", ".....", ".###.", ".....", ".....", "....."),
		'+' to arrayOf(".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),
		'%' to arrayOf("##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"),
		'>' to arrayOf("#....", ".#...", "..#..", "...#.", "..#..", ".#...", "#...."),
		'?' to arrayOf(".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."),
		'/' to arrayOf("....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."),
		'.' to arrayOf(".....", ".....", ".....", ".....", ".....", ".....", "..#.."),
		':' to arrayOf(".....", "..#..", ".....", ".....", ".....", "..#..", "....."),
	)

	/** Width in pixels, without the gap after the last letter. */
	fun width(text: String) = (text.length * ADVANCE - 1).coerceAtLeast(0)

	/** The text as unit squares, one per lit pixel, merged into a single path. */
	fun path(text: String): Path {
		val path = Path()
		text.uppercase().forEachIndexed { index, ch ->
			val glyph = GLYPHS[ch] ?: return@forEachIndexed
			val left = index * ADVANCE
			for (row in 0 until HEIGHT) for (col in 0 until 5) {
				if (glyph[row][col] == '#') {
					path.addRect(
						(left + col).toFloat(), row.toFloat(),
						(left + col + 1).toFloat(), (row + 1).toFloat(),
						Path.Direction.CW,
					)
				}
			}
		}
		// Squares sharing edges would otherwise stroke their inner seams.
		path.op(Path(), Path.Op.UNION)
		return path
	}
}
