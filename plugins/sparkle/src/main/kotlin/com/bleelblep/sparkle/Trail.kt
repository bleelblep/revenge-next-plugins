package com.bleelblep.sparkle

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.view.View
import kotlin.random.Random

/**
 * Nyan Cat's rainbow and stars. A full-screen view placed just behind the pet, so the rainbow comes
 * out from under the cat and never covers it.
 *
 * The first step of the rainbow always sits straight behind the cat, where it normally is. The rest
 * follows the path the cat has just taken (about half a second of it, fading), so dragging or
 * flinging it swings the rainbow out behind; standing still, it's a short straight rainbow of
 * [STEPS] steps. The classic six stripes, in pixel steps that wave up and down a few times a second.
 * Stars twinkle behind it while it moves. Sizes are in art pixels ([px] screen pixels each).
 *
 * Main thread only.
 */
internal class TrailView(context: Context) : View(context) {
	private class Point(val x: Float, val y: Float, val t: Float)
	private class Star(val x: Float, val y: Float, val born: Float)

	private val points = ArrayDeque<Point>()
	private val stars = ArrayList<Star>()
	private val paint = Paint().apply { isAntiAlias = false }

	/** Screen pixels per art pixel, from the pet's current size. */
	var px = 4f
	/**
	 * Which way the cat faces, -1 (left) to 1 (right): the rainbow goes the other way. Follows the
	 * pet's card flip, so mid-turn it's somewhere in between and the rainbow swings round with it.
	 */
	var facing = 1f
	/** Hidden entirely: asleep, stuck upside down, away, partying. */
	var off = false
	/** Thrown or rocketing: the rainbow lingers much longer, so a fling leaves a long arc. */
	var flung = false

	/** How long a bit of rainbow stays behind, in seconds. */
	private val life get() = if (flung) LIFE_FLUNG else LIFE

	private fun now() = SystemClock.uptimeMillis() / 1000f

	init {
		isClickable = false
		isFocusable = false
	}

	/** Which way the cat walks, -1 or 1, as of the last [add]. */
	private var side = 0

	/**
	 * The cat's rear, mid-body, in this view's coordinates; [walkSide] is which way it faces (-1 or 1,
	 * not eased). Turning round starts a new path: the old one runs back under the cat, and the
	 * rainbow followed it there, folded up and stubby until it aged out.
	 */
	fun add(x: Float, y: Float, walkSide: Int) {
		val t = now()
		if (side != 0 && walkSide != side) points.clear()
		side = walkSide
		val last = points.lastOrNull()
		val moved = last != null && kotlin.math.hypot(x - last.x, y - last.y) > px * 0.5f
		if (last == null || moved) points.addLast(Point(x, y, t))
		while (points.size > 1 && t - points.first().t > life) points.removeFirst()
		if (last != null && kotlin.math.hypot(x - last.x, y - last.y) > px * 2f && Random.nextFloat() < 0.18f) {
			stars.add(Star(x - facing * px * (8 + Random.nextInt(30)), y + px * (Random.nextInt(25) - 12), t))
		}
		stars.removeAll { t - it.born > STAR_LIFE }
		invalidate()
	}

	fun clear() {
		points.clear()
		stars.clear()
		invalidate()
	}

	/**
	 * One step of the rainbow: a full step-wide block of the six stripes centred on [cx], [cy]. Steps
	 * overlap a little instead of being stretched between points, so a path that runs up or down
	 * never squeezes them into slivers with gaps between.
	 */
	private fun block(canvas: Canvas, cx: Float, cy: Float, lift: Float, alpha: Int, stripe: Float, step: Float) {
		val left = cx - step / 2f
		val top = cy - stripe * 3f + lift
		for ((k, colour) in COLOURS.withIndex()) {
			paint.color = colour
			paint.alpha = alpha
			canvas.drawRect(left, top + k * stripe, left + step + 1f, top + (k + 1) * stripe, paint)
		}
	}

	override fun onDraw(canvas: Canvas) {
		if (off || points.isEmpty()) return
		val t = now()
		val wave = ((t * WAVES_PER_SECOND).toInt() % 2)
		val stripe = px * 3f
		val step = px * 8f
		val head = points.last()
		val lift = { i: Int -> if ((i + wave) % 2 == 0) 0f else px }
		val back = -facing * step

		// Step centres, newest first, every [step] along the path the cat's rear took, starting half
		// a step behind it. Every step is on the path, so a slope is one smooth ribbon (the old fixed
		// first step sat level with the cat and kinked away from the rest).
		val centres = ArrayList<FloatArray>()
		var travelled = 0f
		var nextAt = step / 2f
		for (i in points.size - 1 downTo 1) {
			val a = points[i]
			val b = points[i - 1]
			val seg = kotlin.math.hypot(b.x - a.x, b.y - a.y)
			if (seg <= 0f) continue
			while (nextAt <= travelled + seg) {
				val k = (nextAt - travelled) / seg
				// Solid for the first half of its life, then fading out.
				val age = (t - (a.t + (b.t - a.t) * k)) / life
				val alpha = (2f - age * 2f).coerceIn(0f, 1f)
				centres.add(floatArrayOf(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, alpha))
				nextAt += step
			}
			travelled += seg
		}
		// Past the path's end the rainbow carries on the way the path was going -- never forwards and
		// never steeper than 45 degrees -- or straight back when there's hardly any path (standing
		// still, or just turned: then [back] eases with the card flip and the rainbow folds with it).
		val oldest = points.first()
		val dx = oldest.x - head.x
		val dy = oldest.y - head.y
		var ux = back
		var uy = 0f
		if (travelled >= step / 2f && dx * back > 0f) {
			val n = kotlin.math.hypot(dx, dy)
			ux = dx / n * step
			uy = dy / n * step
			if (kotlin.math.abs(uy) > kotlin.math.abs(ux)) uy = kotlin.math.abs(ux) * kotlin.math.sign(uy)
		}
		var sx = centres.lastOrNull()?.get(0) ?: (head.x + back / 2f - ux)
		var sy = centres.lastOrNull()?.get(1) ?: (head.y - uy)
		while (centres.size < STEPS) {
			sx += ux
			sy += uy
			centres.add(floatArrayOf(sx, sy, 1f))
		}
		// The rainbow's normal length is always solid; only what a drag or fling adds beyond it fades.
		// (A faded step from the path followed by solid filler read as a dim gap behind the cat.)
		for (i in 0 until STEPS) centres[i][2] = 1f
		// Oldest first, so newer steps cover older ones and overlaps never show as dim seams.
		for (i in centres.size - 1 downTo 0) {
			val c = centres[i]
			val alpha = (c[2] * 255).toInt()
			if (alpha <= 8) continue
			block(canvas, c[0], c[1], lift(i), alpha, stripe, step)
		}

		paint.color = 0xFFFFFFFF.toInt()
		for (s in stars) {
			val k = ((t - s.born) / STAR_LIFE).coerceIn(0f, 1f)
			paint.alpha = ((1f - k) * 255).toInt()
			val reach = when {
				k < 0.25f -> 0
				k < 0.5f -> 1
				k < 0.8f -> 2
				else -> 1
			}
			canvas.drawRect(s.x, s.y, s.x + px, s.y + px, paint)
			for (r in 1..reach) {
				val o = (r + 1) * px
				canvas.drawRect(s.x - o, s.y, s.x - o + px, s.y + px, paint)
				canvas.drawRect(s.x + o, s.y, s.x + o + px, s.y + px, paint)
				canvas.drawRect(s.x, s.y - o, s.x + px, s.y - o + px, paint)
				canvas.drawRect(s.x, s.y + o, s.x + px, s.y + o + px, paint)
			}
		}
		// Smooth while the path or stars are moving; otherwise just the wave's few steps a second.
		if (points.size > 1 || stars.isNotEmpty()) postInvalidateOnAnimation()
		else postInvalidateDelayed((1000f / WAVES_PER_SECOND).toLong())
	}

	companion object {
		private const val LIFE = 0.55f
		private const val LIFE_FLUNG = 1.3f
		private const val STAR_LIFE = 0.7f
		private const val WAVES_PER_SECOND = 6f
		/** The rainbow's length standing still, in 8-pixel steps: about one and a half cats. */
		private const val STEPS = 6
		/** The rainbow, top to bottom, as in the original. */
		val COLOURS = intArrayOf(
			0xFFFF0000.toInt(), 0xFFFF9900.toInt(), 0xFFFFFF00.toInt(),
			0xFF33FF00.toInt(), 0xFF0099FF.toInt(), 0xFF6633FF.toInt(),
		)
	}
}
