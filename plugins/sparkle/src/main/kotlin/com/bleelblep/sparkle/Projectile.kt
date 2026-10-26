package com.bleelblep.sparkle

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * The Horseman's thrown scythe. It leaves his hand spinning, flies straight, bounces off the edges of
 * the screen (and the keyboard, when it's up) a few times with a spark and a clank each time, then
 * curves back to wherever his hand is now and is caught. A full-screen view over the pet that takes
 * no touches; drawn in the pet's pixel scale from a small code-drawn scythe. Main thread only.
 */
internal object Projectile {
	private var view: FlyView? = null
	val active get() = view != null

	/**
	 * Throws from ([x], [y]) toward [facing] at the pet's pixel scale [px] (screen pixels per art pixel).
	 * [floor] and [top] bound the flight; [home] is asked for the hand's position while it returns.
	 * [onBounce] per bounce, [onDone] when caught (or given up).
	 */
	fun throwScythe(root: ViewGroup, above: View?, x: Float, y: Float, facing: Int, px: Float, top: () -> Float, floor: () -> Float,
	                home: () -> FloatArray, onBounce: () -> Unit, onDone: () -> Unit) {
		cancel()
		val v = FlyView(root.context, x, y, facing, px, top, floor, home, onBounce) {
			cancel()
			onDone()
		}
		val index = above?.let { root.indexOfChild(it) }?.takeIf { it >= 0 }?.plus(1) ?: root.childCount
		root.addView(v, index.coerceAtMost(root.childCount), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		view = v
	}

	fun cancel() {
		val v = view ?: return
		view = null
		v.finished = true
		(v.parent as? ViewGroup)?.removeView(v)
	}

	/** The scythe at 24 art pixels, scaled up with hard pixels. */
	private fun scytheBitmap(px: Float): Bitmap {
		val cell = 24
		val small = Bitmap.createBitmap(cell, cell, Bitmap.Config.ARGB_8888)
		val c = Canvas(small)
		val p = Paint().apply { isAntiAlias = false }
		p.color = 0xFF5C3C24.toInt(); p.strokeWidth = 2f
		c.drawLine(3f, 21f, 15f, 5f, p)
		p.color = 0xFFC8CEDC.toInt()
		val blade = Path().apply { moveTo(13f, 7f); lineTo(22f, 9f); lineTo(23f, 4f); lineTo(17f, 1f); lineTo(14f, 3f); close() }
		c.drawPath(blade, p)
		p.color = 0xFF808A9C.toInt(); p.strokeWidth = 1f
		c.drawLine(14f, 3f, 23f, 4f, p)
		p.color = 0xFFFFFFFF.toInt()
		c.drawPoint(18f, 4f, p)
		// Outline.
		val out = Bitmap.createBitmap(cell, cell, Bitmap.Config.ARGB_8888)
		val oc = Canvas(out)
		val op = Paint().apply { colorFilter = android.graphics.PorterDuffColorFilter(0xFF08060E.toInt(), android.graphics.PorterDuff.Mode.SRC_IN) }
		for ((dx, dy) in listOf(1 to 0, -1 to 0, 0 to 1, 0 to -1)) oc.drawBitmap(small, dx.toFloat(), dy.toFloat(), op)
		oc.drawBitmap(small, 0f, 0f, null)
		small.recycle()
		val size = max(8, (cell * px).toInt())
		return Bitmap.createScaledBitmap(out, size, size, false).also { if (it !== out) out.recycle() }
	}

	private class Spark(val x: Float, val y: Float, val vx: Float, val vy: Float, val born: Float)

	private class FlyView(
		context: Context, startX: Float, startY: Float, val facing: Int, px: Float, val top: () -> Float, val floor: () -> Float,
		val home: () -> FloatArray, val onBounce: () -> Unit, val done: () -> Unit,
	) : View(context) {
		private val bmp = scytheBitmap(px)
		private val size = bmp.width.toFloat()
		private val paint = Paint().apply { isFilterBitmap = false }
		private val fill = Paint()
		private val dest = RectF()
		private var x = startX - size / 2f
		private var y = startY - size / 2f
		private val speed = dp(900f) + Random.nextFloat() * dp(500f)
		private var vx: Float
		private var vy: Float
		private var spin = (2f + Random.nextFloat()) * 360f * (if (facing > 0) 1 else -1)
		private var rot = 0f
		private var bouncesLeft = 4 + Random.nextInt(5)
		private var homing = false
		private var last = SystemClock.uptimeMillis()
		private val born = last
		private val sparks = ArrayList<Spark>()
		var finished = false

		init {
			val a = (Random.nextFloat() * 60f - 30f) * PI.toFloat() / 180f
			vx = cos(a) * speed * facing
			vy = sin(a) * speed - dp(200f)
			isClickable = false
			isFocusable = false
			importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
		}

		private fun dp(v: Float) = v * resources.displayMetrics.density
		private fun now() = SystemClock.uptimeMillis()

		private fun burst(cx: Float, cy: Float) {
			val t = now() / 1000f
			for (i in 0 until 8) {
				val a = Random.nextFloat() * 2f * PI.toFloat()
				val s = dp(80f) + Random.nextFloat() * dp(200f)
				sparks.add(Spark(cx, cy, cos(a) * s, sin(a) * s, t))
			}
			onBounce()
		}

		private fun step(dt: Float) {
			val w = width.toFloat()
			val minY = top()
			val maxY = floor() - size
			if (!homing) {
				x += vx * dt
				y += vy * dt
				var bounced = false
				if (x < 0f) { x = 0f; vx = -vx; bounced = true }
				if (x + size > w) { x = w - size; vx = -vx; bounced = true }
				if (y < minY) { y = minY; vy = -vy; bounced = true }
				if (y > maxY) { y = maxY; vy = -vy; bounced = true }
				if (bounced) {
					burst(x + size / 2f, y + size / 2f)
					spin = -spin
					if (--bouncesLeft <= 0) homing = true
				}
			} else {
				val h = home()
				val tx = h[0] - size / 2f
				val ty = h[1] - size / 2f
				val dx = tx - x; val dy = ty - y
				val d = hypot(dx, dy)
				if (d < dp(14f) || now() - born > 9000L) { finish(); return }
				// Steer toward the hand, keeping speed: a curve home rather than a snap.
				val want = atan2(dy, dx)
				val have = atan2(vy, vx)
				var diff = want - have
				while (diff > PI) diff -= 2f * PI.toFloat()
				while (diff < -PI) diff += 2f * PI.toFloat()
				val turn = diff.coerceIn(-7f * dt, 7f * dt)
				val ang = have + turn
				val s = min(speed, max(dp(500f), d * 3f))
				vx = cos(ang) * s; vy = sin(ang) * s
				x += vx * dt; y += vy * dt
			}
			rot += spin * dt
		}

		override fun onDraw(canvas: Canvas) {
			if (finished) return
			val t = now()
			val dt = ((t - last) / 1000f).coerceIn(0f, 0.05f)
			last = t
			step(dt)
			if (finished) return
			val ts = t / 1000f
			for (s in sparks) {
				val age = ts - s.born
				if (age < 0f || age > 0.45f) continue
				fill.color = Color.argb((255 * (1f - age / 0.45f)).toInt(), 255, 236, 170)
				val px = s.x + s.vx * age; val py = s.y + s.vy * age + dp(700f) * age * age
				canvas.drawRect(px, py, px + dp(3f), py + dp(3f), fill)
			}
			sparks.removeAll { ts - it.born > 0.45f }
			canvas.save()
			canvas.rotate(rot, x + size / 2f, y + size / 2f)
			if (facing < 0) canvas.scale(-1f, 1f, x + size / 2f, y + size / 2f)
			dest.set(x, y, x + size, y + size)
			canvas.drawBitmap(bmp, null, dest, paint)
			canvas.restore()
			postInvalidateOnAnimation()
		}

		private fun finish() {
			if (finished) return
			finished = true
			post { done() }
		}

		override fun onDetachedFromWindow() {
			super.onDetachedFromWindow()
			if (!finished) finish()
			bmp.recycle()
		}
	}
}
