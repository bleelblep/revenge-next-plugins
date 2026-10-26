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
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * The screen tricks as they were before the shaders (0.17.1), kept for phones below Android 13 and
 * ones whose shaders won't compile ([ScreenBreak] picks). The snapshot is cut into clipped pieces and
 * moved with Canvas calls: CUT and CLAWS slide bands apart over a dark fill, HOOK drags the whole shot,
 * HORN bulges it with drawBitmapMesh and draws straight crack lines. Unchanged apart from the move.
 */
private fun legacyNow() = SystemClock.uptimeMillis() / 1000f

private class LegacySpark(val x: Float, val y: Float, val vx: Float, val vy: Float, val born: Float, val size: Float)

internal class LegacyBreakView(
	context: Context, private var shot: Bitmap?, val kind: ScreenBreak.Kind, val ox: Float, val oy: Float, val facing: Int,
	val hand: FloatArray?, val onBite: (() -> Unit)?, val done: () -> Unit,
) : View(context), ScreenBreak.Effect {
	private val start = legacyNow()
	private val paint = Paint().apply { isFilterBitmap = true }
	private val fill = Paint()
	private val line = Paint().apply { strokeCap = Paint.Cap.ROUND; style = Paint.Style.STROKE; isAntiAlias = false }
	private val dest = RectF()
	private val path = Path()
	private val dark = 0xFF0B0A12.toInt()
	private var finished = false
	private var bitten = false
	private val sparks = ArrayList<LegacySpark>()

	// Geometry chosen once.
	private val angle: Float = when (kind) {
		ScreenBreak.Kind.CUT -> if (Random.nextFloat() < 0.3f) (90f + Random.nextFloat() * 30f - 15f) else (Random.nextFloat() * 70f - 35f)
		ScreenBreak.Kind.CLAWS -> -60f + Random.nextFloat() * 20f
		else -> 0f
	} * (PI.toFloat() / 180f)
	private val cross = kind == ScreenBreak.Kind.CUT && Random.nextFloat() < 0.25f
	private val angle2 = angle + (90f + Random.nextFloat() * 40f - 20f) * (PI.toFloat() / 180f)
	private val pull = 0.25f + Random.nextFloat() * 0.35f
	private val dragOff = kind == ScreenBreak.Kind.HOOK && Random.nextFloat() < 0.2f
	private val cracks = List(5) { Random.nextFloat() * 2f * PI.toFloat() }
	private val crackKinks = List(5) { floatArrayOf(Random.nextFloat() * 0.6f - 0.3f, Random.nextFloat() * 0.6f - 0.3f) }
	private var anchorX = 0f
	private var anchorY = 0f
	private val mesh = 12
	private val meshRows = 20
	private var verts: FloatArray? = null

	val duration = when (kind) { ScreenBreak.Kind.CUT -> 1.4f; ScreenBreak.Kind.CLAWS -> 1.2f; ScreenBreak.Kind.HOOK -> 2.3f; else -> 1.0f }

	init {
		isClickable = false
		isFocusable = false
		importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
		for (i in 0 until 14) {
			val a = Random.nextFloat() * 2f * PI.toFloat()
			val s = dp(120f) + Random.nextFloat() * dp(260f)
			sparks.add(LegacySpark(ox, oy, cos(a) * s, sin(a) * s - dp(80f), Random.nextFloat() * 0.08f, dp(2f) + Random.nextFloat() * dp(2f)))
		}
	}

	override fun release() {
		finished = true
		shot?.recycle()
		shot = null
	}

	private fun dp(v: Float) = v * resources.displayMetrics.density

	override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
		// The chain's anchor: the far half of the screen from the pet, somewhere in its upper part.
		val far = if (facing > 0) w * (0.55f + Random.nextFloat() * 0.38f) else w * (0.07f + Random.nextFloat() * 0.38f)
		anchorX = far
		anchorY = h * (0.12f + Random.nextFloat() * 0.45f)
	}

	private fun easeOut(u: Float): Float { val k = u.coerceIn(0f, 1f); return 1f - (1f - k) * (1f - k) * (1f - k) }

	/** Apart, then back with one overshoot: 0 before [t0], peak at [t1], settled at [t2]. */
	private fun apart(a: Float, t0: Float, t1: Float, t2: Float): Float = when {
		a < t0 -> 0f
		a < t1 -> easeOut((a - t0) / (t1 - t0))
		a < t2 -> { val u = (a - t1) / (t2 - t1); (1f - u) * cos(1.5f * PI.toFloat() * u) }
		else -> 0f
	}

	private fun drawShot(canvas: Canvas) {
		val b = shot ?: return
		dest.set(0f, 0f, width.toFloat(), height.toFloat())
		canvas.drawBitmap(b, null, dest, paint)
	}

	/** Clips to the strip between offsets [c0] and [c1] along normal n of a line through (ox, oy) at [ang]. */
	private fun clipBand(canvas: Canvas, ang: Float, c0: Float, c1: Float) {
		val l = 2f * max(width, height).toFloat()
		val dx = cos(ang); val dy = sin(ang)
		val nx = -dy; val ny = dx
		path.reset()
		path.moveTo(ox + nx * c0 - dx * l, oy + ny * c0 - dy * l)
		path.lineTo(ox + nx * c0 + dx * l, oy + ny * c0 + dy * l)
		path.lineTo(ox + nx * c1 + dx * l, oy + ny * c1 + dy * l)
		path.lineTo(ox + nx * c1 - dx * l, oy + ny * c1 - dy * l)
		path.close()
		canvas.clipPath(path)
	}

	private fun piece(canvas: Canvas, bands: List<Triple<Float, Float, Float>>, tx: Float, ty: Float, rot: Float = 0f, px: Float = 0f, py: Float = 0f) {
		canvas.save()
		for ((ang, c0, c1) in bands) clipBand(canvas, ang, c0, c1)
		canvas.translate(tx, ty)
		if (rot != 0f) canvas.rotate(rot, px, py)
		drawShot(canvas)
		canvas.restore()
	}

	override fun onDraw(canvas: Canvas) {
		if (finished) return
		val a = legacyNow() - start
		if (a >= duration) { finish(); return }
		val w = width.toFloat()
		val h = height.toFloat()
		val big = 4f * max(w, h)
		when (kind) {
			ScreenBreak.Kind.CUT -> {
				canvas.drawColor(dark)
				val g = apart(a, 0.12f, 0.6f, 1.3f) * 0.09f * min(w, h)
				val n1x = -sin(angle); val n1y = cos(angle)
				if (!cross) {
					piece(canvas, listOf(Triple(angle, -big, 0f)), -n1x * g, -n1y * g)
					piece(canvas, listOf(Triple(angle, 0f, big)), n1x * g, n1y * g)
				} else {
					val n2x = -sin(angle2); val n2y = cos(angle2)
					for (s1 in intArrayOf(-1, 1)) for (s2 in intArrayOf(-1, 1)) {
						val bands = listOf(Triple(angle, if (s1 < 0) -big else 0f, if (s1 < 0) 0f else big), Triple(angle2, if (s2 < 0) -big else 0f, if (s2 < 0) 0f else big))
						piece(canvas, bands, (n1x * s1 + n2x * s2) * g * 0.7f, (n1y * s1 + n2y * s2) * g * 0.7f)
					}
				}
				drawCutLine(canvas, angle, a, big)
				if (cross) drawCutLine(canvas, angle2, a - 0.08f, big)
				drawSparks(canvas, a)
			}
			ScreenBreak.Kind.CLAWS -> {
				canvas.drawColor(dark)
				val gap = dp(26f)
				val g = apart(a, 0.1f, 0.5f, 1.15f)
				val nx = -sin(angle); val ny = cos(angle)
				val shift = g * 0.05f * min(w, h)
				val drop = g * dp(34f)
				piece(canvas, listOf(Triple(angle, -big, -gap)), -nx * shift, -ny * shift)
				piece(canvas, listOf(Triple(angle, gap, big)), nx * shift, ny * shift)
				piece(canvas, listOf(Triple(angle, -gap, 0f)), 0f, drop * 0.7f)
				piece(canvas, listOf(Triple(angle, 0f, gap)), 0f, drop)
				for (c in floatArrayOf(-gap, 0f, gap)) drawCutLine(canvas, angle, a, big, c, 0.1f)
				drawSparks(canvas, a)
			}
			ScreenBreak.Kind.HOOK -> drawHook(canvas, a, w, h)
			else -> drawHorn(canvas, a, w, h) // HORN; ScreenBreak maps the shader-only kinds before they get here
		}
		postInvalidateOnAnimation()
	}

	private fun drawCutLine(canvas: Canvas, ang: Float, a: Float, big: Float, offset: Float = 0f, grow: Float = 0.12f) {
		if (a < 0f || a > 0.55f) return
		val k = (a / grow).coerceIn(0f, 1f)
		val fade = if (a < 0.3f) 1f else (1f - (a - 0.3f) / 0.25f).coerceIn(0f, 1f)
		val dx = cos(ang); val dy = sin(ang)
		val nx = -dy; val ny = dx
		val cx = ox + nx * offset; val cy = oy + ny * offset
		line.strokeWidth = dp(3f)
		line.color = Color.argb((255 * fade).toInt(), 255, 233, 168)
		canvas.drawLine(cx - dx * big * k, cy - dy * big * k, cx + dx * big * k, cy + dy * big * k, line)
		line.strokeWidth = dp(1f)
		line.color = Color.argb((255 * fade).toInt(), 255, 255, 255)
		canvas.drawLine(cx - dx * big * k, cy - dy * big * k, cx + dx * big * k, cy + dy * big * k, line)
	}

	private fun drawSparks(canvas: Canvas, a: Float) {
		for (s in sparks) {
			val age = a - s.born
			if (age < 0f || age > 0.5f) continue
			val x = s.x + s.vx * age
			val y = s.y + s.vy * age + dp(900f) * age * age
			fill.color = Color.argb((255 * (1f - age / 0.5f)).toInt(), 255, 236, 170)
			canvas.drawRect(x, y, x + s.size, y + s.size, fill)
		}
	}

	private fun drawEyes(canvas: Canvas, cx: Float, cy: Float, k: Float) {
		if (k <= 0f) return
		fill.color = Color.argb((255 * k).toInt(), 255, 42, 58)
		val e = dp(5f)
		canvas.drawRect(cx - e * 3, cy, cx - e, cy + e * 1.2f, fill)
		canvas.drawRect(cx + e, cy, cx + e * 3, cy + e * 1.2f, fill)
	}

	private fun drawChain(canvas: Canvas, fromX: Float, fromY: Float, toX: Float, toY: Float, sag: Float) {
		val d = hypot(toX - fromX, toY - fromY)
		val n = max(3, (d / dp(9f)).toInt())
		line.strokeWidth = dp(2f)
		for (i in 0..n) {
			val t = i / n.toFloat()
			val x = fromX + (toX - fromX) * t
			val y = fromY + (toY - fromY) * t + sin(t * PI.toFloat()) * sag
			line.color = if (i % 2 == 0) 0xFF9CA2B0.toInt() else 0xFF606472.toInt()
			canvas.drawCircle(x, y, dp(3f), line)
		}
		// The hook: a short bent stroke at the end.
		line.color = 0xFFB8BCC8.toInt()
		line.strokeWidth = dp(3f)
		canvas.drawLine(toX, toY, toX + dp(6f) * facing, toY + dp(7f), line)
		canvas.drawLine(toX + dp(6f) * facing, toY + dp(7f), toX - dp(2f) * facing, toY + dp(11f), line)
	}

	private fun drawHook(canvas: Canvas, a: Float, w: Float, h: Float) {
		canvas.drawColor(dark)
		val hx = hand?.get(0) ?: ox
		val hy = hand?.get(1) ?: oy
		val reach = 0.25f
		val tipK = (a / reach).coerceIn(0f, 1f)
		// How far the screen has been pulled toward the hand, as a fraction of the hand-anchor distance.
		var tx = 0f; var ty = 0f; var rot = 0f
		val vx = hx - anchorX; val vy = hy - anchorY
		val tear = 1.5f
		if (a >= reach) {
			if (!bitten) { bitten = true; onBite?.invoke() }
			val k = when {
				a < 0.35f -> 0.03f * ((a - reach) / 0.1f)
				a < 1.3f -> 0.03f + (pull - 0.03f) * easeOut((a - 0.35f) / 0.95f)
				a < tear -> pull + sin((a - 1.3f) * 60f) * 0.01f
				else -> if (dragOff) pull else pull * (1f - easeOut((a - tear) / 0.5f)) * cos(1.5f * PI.toFloat() * ((a - tear) / 0.8f).coerceIn(0f, 1f))
			}
			tx = vx * k; ty = vy * k
			rot = -facing * 4f * (k / pull).coerceIn(0f, 1f)
			if (dragOff && a >= tear) {
				// Dragged clean off toward the hand's side, then back in from the other edge.
				val u = ((a - tear) / 0.8f).coerceIn(0f, 1f)
				if (u < 0.45f) tx = vx * pull + facing * w * 1.2f * easeOut(u / 0.45f)
				else tx = -facing * w * 1.2f * (1f - easeOut((u - 0.45f) / 0.55f))
				ty = vy * pull * (1f - u)
				rot = 0f
			}
		}
		drawEyes(canvas, if (facing > 0) w * 0.85f else w * 0.15f, h * 0.45f, ((abs(tx) + abs(ty)) / (0.2f * min(w, h))).coerceIn(0f, 1f))
		canvas.save()
		canvas.translate(tx, ty)
		if (rot != 0f) canvas.rotate(rot, anchorX, anchorY)
		drawShot(canvas)
		canvas.restore()
		// The chain, from the hand to the hook (which rides on the dragged screen).
		val tipX = if (a < reach) hx + (anchorX - hx) * tipK else anchorX + tx
		val tipY = if (a < reach) hy + (anchorY - hy) * tipK else anchorY + ty
		val taut = if (a in 0.35f..tear) 0f else dp(18f)
		val recoil = if (a > tear && !dragOff) (1f - easeOut((a - tear) / 0.3f)) else 1f
		drawChain(canvas, hx, hy, hx + (tipX - hx) * recoil, hy + (tipY - hy) * recoil, taut)
		if (a in reach..reach + 0.25f) {
			val k = 1f - (a - reach) / 0.25f
			fill.color = Color.argb((255 * k).toInt(), 255, 236, 170)
			for (i in 0 until 6) {
				val ang = i / 6f * 2f * PI.toFloat()
				val r = dp(6f) + (1f - k) * dp(18f)
				canvas.drawRect(tipX + cos(ang) * r - dp(1.5f), tipY + sin(ang) * r - dp(1.5f), tipX + cos(ang) * r + dp(1.5f), tipY + sin(ang) * r + dp(1.5f), fill)
			}
		}
	}

	private fun drawHorn(canvas: Canvas, a: Float, w: Float, h: Float) {
		val b = shot ?: return
		canvas.drawColor(dark)
		val cols = mesh; val rows = meshRows
		val v = verts ?: FloatArray((cols + 1) * (rows + 1) * 2).also { verts = it }
		// Bulge: out fast, back with a little suck, gone by 0.8 s.
		val amp = dp(22f) * sin(PI.toFloat() * (a / 0.8f).coerceIn(0f, 1f)) * exp(-1.5f * a)
		val radius = 0.35f * min(w, h)
		var i = 0
		for (r in 0..rows) for (c in 0..cols) {
			val x = w * c / cols
			val y = h * r / rows
			val dx = x - ox; val dy = y - oy
			val d = hypot(dx, dy)
			val k = exp(-(d / radius) * (d / radius))
			val ux = if (d > 1f) dx / d else 0f
			val uy = if (d > 1f) dy / d else 0f
			v[i++] = x + ux * amp * k
			v[i++] = y + uy * amp * k
		}
		val shake = if (a in 0.03f..0.3f) dp(2f) * sin(a * 90f) else 0f
		canvas.save()
		canvas.translate(shake, 0f)
		// The bitmap may be half size: the mesh is in view pixels, so scale the draw.
		canvas.save()
		val sx = w / b.width; val sy = h / b.height
		// drawBitmapMesh maps bitmap texels to the vertices directly, so pre-scale the vertex grid back.
		canvas.scale(1f, 1f)
		canvas.drawBitmapMesh(b, cols, rows, scaleVerts(v, 1f), 0, null, 0, paint)
		canvas.restore()
		canvas.restore()
		// Cracks radiate from the impact, drawn in 0.3 s, fading after 0.6 s.
		val grow = easeOut(a / 0.3f)
		val fade = if (a < 0.6f) 1f else (1f - (a - 0.6f) / 0.4f).coerceIn(0f, 1f)
		val len = 0.25f * min(w, h) * grow
		line.strokeWidth = dp(2f)
		line.color = Color.argb((230 * fade).toInt(), 20, 18, 30)
		for ((n, ang) in cracks.withIndex()) {
			val kink = crackKinks[n]
			val x1 = ox + cos(ang) * len * 0.45f; val y1 = oy + sin(ang) * len * 0.45f
			val a2 = ang + kink[0]; val x2 = x1 + cos(a2) * len * 0.35f; val y2 = y1 + sin(a2) * len * 0.35f
			val a3 = a2 + kink[1]; val x3 = x2 + cos(a3) * len * 0.2f; val y3 = y2 + sin(a3) * len * 0.2f
			canvas.drawLine(ox, oy, x1, y1, line); canvas.drawLine(x1, y1, x2, y2, line); canvas.drawLine(x2, y2, x3, y3, line)
		}
		line.strokeWidth = dp(1f)
		line.color = Color.argb((200 * fade).toInt(), 255, 255, 255)
		for ((n, ang) in cracks.withIndex()) {
			val x1 = ox + cos(ang) * len * 0.45f; val y1 = oy + sin(ang) * len * 0.45f
			canvas.drawLine(ox + dp(1f), oy + dp(1f), x1 + dp(1f), y1 + dp(1f), line)
		}
		if (a < 0.3f) drawSparks(canvas, a)
	}

	private fun scaleVerts(v: FloatArray, k: Float): FloatArray = if (k == 1f) v else FloatArray(v.size) { v[it] * k }

	private fun finish() {
		if (finished) return
		finished = true
		post { done() }
	}

	override fun onDetachedFromWindow() {
		super.onDetachedFromWindow()
		if (!finished) finish()
	}
}
