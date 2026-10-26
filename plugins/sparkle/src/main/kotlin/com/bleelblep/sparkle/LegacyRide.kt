package com.bleelblep.sparkle

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * The ride as it was in 0.17.1, kept for phones below Android 13 and ones whose shaders fail ([Ride]
 * picks): a flat dark overlay with a moon, fog bands, block bats and leaves, block flame prints, and the
 * horse and rider composited from their strips. Unchanged apart from the move.
 */
private class LegacyBat(var x: Float, val y: Float, val speed: Float, val phase: Float, val size: Float)
private class LegacyLeaf(var x: Float, var y: Float, val vx: Float, val vy: Float, val spin: Float, val color: Int, val size: Float)
private class LegacyPrint(val x: Float, val y: Float, val born: Float)

internal class LegacyRideView(
	context: Context, val rider: SheetLook, val horse: SheetLook, val px: Float, startX: Float, var facing: Int,
	val seconds: Float, val floor: () -> Float, val onEnd: (Float, Int) -> Unit,
) : View(context), Ride.Scene {
	private val born = now()
	private var last = SystemClock.uptimeMillis()
	private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
	private val fill = Paint()
	private val dest = RectF()
	private val hw = horse.cellW * px
	private val hh = horse.cellH * px
	private val rw = rider.cellW * px
	private val rh = rider.cellH * px
	private var x = startX
	private var y = 0f
	private var vy = 0f
	private var jumpOff = 0f
	private var speed = dp(230f)
	private var phase = "gallop"
	private var phaseAt = born
	private var nextJump = born + 15f + Random.nextFloat() * 20f
	private var endAt = -1f
	private val bats = List(9) { LegacyBat(Random.nextFloat() * 2000f, 0f, dp(60f) + Random.nextFloat() * dp(90f), Random.nextFloat() * 6f, dp(6f) + Random.nextFloat() * dp(6f)) }
	private val leaves = ArrayList<LegacyLeaf>()
	private val prints = ArrayList<LegacyPrint>()
	private var lastPrint = 0f
	private val moonX = 0.84f
	private val moonY = 0.11f
	override var finished = false

	init {
		isClickable = false
		isFocusable = false
		importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
		Sounds.appear(force = false)
	}

	private fun dp(v: Float) = v * resources.displayMetrics.density
	private fun now() = SystemClock.uptimeMillis() / 1000f

	override fun stopSoon() { if (endAt < 0f) endAt = now() }

	/** The rider's rect for taps. */
	private fun riderRect(): RectF {
		val rx = if (facing > 0) x + (30f - 32f) * px else x + hw - rw - (30f - 32f) * px
		val ry = y - 28f * px
		return RectF(rx, ry, rx + rw, ry + rh)
	}

	override fun onTouchEvent(event: MotionEvent): Boolean {
		if (event.actionMasked == MotionEvent.ACTION_DOWN) {
			val r = riderRect()
			r.inset(-dp(8f), -dp(8f))
			val horseRect = RectF(x, y, x + hw, y + hh)
			return (r.contains(event.x, event.y) || horseRect.contains(event.x, event.y)).also { if (it) stopSoon() }
		}
		return false
	}

	private fun step(dt: Float, t: Float) {
		val w = width.toFloat()
		val fl = floor()
		val base = fl - hh
		// Jump: an arc; otherwise the hooves are on the floor.
		if (jumpOff < 0f || vy != 0f) {
			vy += dp(2200f) * dt
			jumpOff += vy * dt
			if (jumpOff >= 0f) { jumpOff = 0f; vy = 0f; Sounds.thud(0.5f) }
		}
		y = base + jumpOff
		when (phase) {
			"gallop" -> {
				x += speed * dt * facing
				val atEdge = (facing > 0 && x + hw >= w) || (facing < 0 && x <= 0f)
				if (atEdge) {
					x = if (facing > 0) w - hw else 0f
					if (Random.nextInt(3) == 0 && jumpOff == 0f) { phase = "rear"; phaseAt = t; Sounds.swoosh(0.4f) }
					else facing = -facing
				}
				if (t >= nextJump && jumpOff == 0f) {
					vy = -dp(900f); jumpOff = -0.01f
					nextJump = t + 20f + Random.nextFloat() * 20f
				}
				// Hoof prints while on the ground.
				if (jumpOff == 0f && t - lastPrint > 0.07f) {
					lastPrint = t
					prints.add(LegacyPrint(x + hw * (if (facing > 0) 0.3f else 0.7f) + (Random.nextFloat() - 0.5f) * dp(6f), fl - dp(2f), t))
				}
			}
			"rear" -> if (t - phaseAt >= 0.8f) { facing = -facing; phase = "gallop"; phaseAt = t }
			"off" -> {}
		}
		prints.removeAll { t - it.born > 0.7f }
		for (b in bats) { b.x -= b.speed * dt; if (b.x < -dp(40f)) b.x = w + dp(40f) + Random.nextFloat() * w * 0.5f }
		if (leaves.size < 14 && Random.nextFloat() < dt * 2.5f) {
			leaves.add(LegacyLeaf(Random.nextFloat() * w, -dp(10f), (Random.nextFloat() - 0.7f) * dp(60f), dp(50f) + Random.nextFloat() * dp(60f), (Random.nextFloat() - 0.5f) * 400f,
				listOf(0xFFB8521E.toInt(), 0xFF8A3A14.toInt(), 0xFFD27B2A.toInt()).random(), dp(4f) + Random.nextFloat() * dp(4f)))
		}
		val it = leaves.iterator()
		while (it.hasNext()) { val l = it.next(); l.x += l.vx * dt + sin(t * 2f + l.y) * dp(20f) * dt; l.y += l.vy * dt; if (l.y > height + dp(20f)) it.remove() }
	}

	override fun onDraw(canvas: Canvas) {
		if (finished) return
		val t = now()
		val dt = ((SystemClock.uptimeMillis() - last) / 1000f).coerceIn(0f, 0.05f)
		last = SystemClock.uptimeMillis()
		if (endAt < 0f && t - born >= seconds) endAt = t
		val w = width.toFloat()
		val h = height.toFloat()
		val fadeIn = ((t - born) / 0.8f).coerceIn(0f, 1f)
		val fadeOut = if (endAt >= 0f) (1f - (t - endAt) / 0.8f).coerceIn(0f, 1f) else 1f
		val k = min(fadeIn, fadeOut)
		if (endAt >= 0f && phase != "off") { phase = "off"; phaseAt = t }
		if (endAt >= 0f && t - endAt >= 0.8f) { finish(); return }
		step(dt, t)
		// Night.
		canvas.drawColor(Color.argb((255 * 0.55f * k).toInt(), 10, 10, 34))
		// Moon with a couple of craters, pixel style.
		val mr = dp(26f)
		fill.color = Color.argb((255 * k).toInt(), 236, 232, 210)
		canvas.drawCircle(w * moonX, h * moonY, mr, fill)
		fill.color = Color.argb((255 * k).toInt(), 206, 200, 176)
		canvas.drawCircle(w * moonX - mr * 0.3f, h * moonY - mr * 0.2f, mr * 0.18f, fill)
		canvas.drawCircle(w * moonX + mr * 0.25f, h * moonY + mr * 0.35f, mr * 0.12f, fill)
		// Fog bands drifting.
		fill.color = Color.argb((255 * 0.12f * k).toInt(), 200, 200, 230)
		for (i in 0 until 2) {
			val fy = h * (0.62f + i * 0.14f) + sin(t * 0.3f + i) * dp(8f)
			val fx = ((t * dp(12f) * (1 + i)) % (w + dp(300f))) - dp(300f)
			canvas.drawRoundRect(fx, fy, fx + dp(280f), fy + dp(28f), dp(14f), dp(14f), fill)
			canvas.drawRoundRect(fx + w * 0.5f, fy + dp(20f), fx + w * 0.5f + dp(220f), fy + dp(44f), dp(12f), dp(12f), fill)
		}
		// Bats: two wings flapping, drawn as five little blocks.
		fill.color = Color.argb((255 * k).toInt(), 16, 14, 24)
		for (b in bats) {
			val by = h * (0.12f + (b.phase % 1f) * 0.3f) + sin(t * 3f + b.phase) * dp(10f)
			val flap = sin(t * 14f + b.phase) * b.size * 0.6f
			canvas.drawRect(b.x - b.size * 0.3f, by, b.x + b.size * 0.3f, by + b.size * 0.5f, fill)
			canvas.drawRect(b.x - b.size * 1.6f, by - flap, b.x - b.size * 0.3f, by - flap + b.size * 0.45f, fill)
			canvas.drawRect(b.x + b.size * 0.3f, by - flap, b.x + b.size * 1.6f, by - flap + b.size * 0.45f, fill)
		}
		for (l in leaves) {
			canvas.save()
			canvas.rotate(t * l.spin, l.x, l.y)
			fill.color = (l.color and 0x00FFFFFF) or ((255 * k).toInt() shl 24)
			canvas.drawRect(l.x - l.size / 2f, l.y - l.size / 3f, l.x + l.size / 2f, l.y + l.size / 3f, fill)
			canvas.restore()
		}
		// Flaming hoof prints: three stacked blocks, yellow over orange over red, shrinking as they age.
		for (p in prints) {
			val age = t - p.born
			val life = (1f - age / 0.7f).coerceIn(0f, 1f)
			val s = dp(5f) * life
			fill.color = Color.argb((255 * life * k).toInt(), 220, 60, 30); canvas.drawRect(p.x - s, p.y - s * 0.6f, p.x + s, p.y, fill)
			fill.color = Color.argb((255 * life * k).toInt(), 255, 140, 40); canvas.drawRect(p.x - s * 0.7f, p.y - s * 1.6f, p.x + s * 0.7f, p.y - s * 0.5f, fill)
			fill.color = Color.argb((255 * life * k).toInt(), 255, 230, 120); canvas.drawRect(p.x - s * 0.35f, p.y - s * 2.4f, p.x + s * 0.35f, p.y - s * 1.4f, fill)
		}
		// The horse, then the rider on its back.
		if (phase != "off" || k > 0f) {
			val strip = if (phase == "rear") "rear" else "gallop"
			val hf = horse.stripFrame(strip, t - phaseAt, if (phase == "rear") 8f else 10f, phase != "rear")
			val rf = rider.stripFrame("ride", t - born, 10f, true)
			val alpha = (255 * (if (phase == "off") k else 1f)).toInt()
			paint.alpha = alpha
			canvas.save()
			if (facing < 0) canvas.scale(-1f, 1f, x + hw / 2f, 0f)
			if (hf != null) { dest.set(x, y, x + hw, y + hh); canvas.drawBitmap(hf, null, dest, paint) }
			if (rf != null) {
				val rx = x + (30f - 32f) * px
				val ry = y - 28f * px + (if (phase == "rear") -6f * px else 0f)
				dest.set(rx, ry, rx + rw, ry + rh)
				canvas.drawBitmap(rf, null, dest, paint)
			}
			canvas.restore()
			paint.alpha = 255
		}
		postInvalidateOnAnimation()
	}

	private fun finish() {
		if (finished) return
		finished = true
		val fx = x; val ff = facing
		post { onEnd(fx, ff) }
	}

	override fun onDetachedFromWindow() {
		super.onDetachedFromWindow()
		if (!finished) finish()
	}
}
