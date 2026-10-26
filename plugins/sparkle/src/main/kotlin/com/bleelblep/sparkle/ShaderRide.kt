package com.bleelblep.sparkle

import android.annotation.TargetApi
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * The ride on Android 13+. Discord itself becomes the night: [NIGHT] is a RenderEffect on the content
 * view (filed with [SharedLayers] under [KEY], so VFX and the rest still stack), which keeps the real UI
 * live underneath while it goes moonlit blue, darker at the edges, with fog drifting along the bottom.
 * The jack-o'-lantern in his hand casts a warm, flickering pool of light that travels across the chat
 * with him, and the burning hoof prints ripple the screen above them with heat haze. Our own views are
 * siblings of the content view, so the pet, the horse and this view are not graded.
 *
 * This view draws the rest: a haloed moon with cloud passing over it, bat silhouettes, falling leaves,
 * real flames streaming off the hooves (additive particles that rise, shrink and cool), dust and sparks
 * on a landing or a skid, and the horse and rider, the rider's bob locked to the gallop. The horse
 * speeds up out of a turn, brakes into the edge and either rears or skids round; it gallops faster or
 * slower and its legs keep pace. Ending: it slows to a stop while the night lifts.
 *
 * If the shader fails mid-ride the grade is dropped for a flat dim, and [ScreenBreak.shadersBroken] is
 * set so the next ride is the legacy one.
 */
@TargetApi(33)
internal class ShaderRideView(
	private val root: ViewGroup, val rider: SheetLook, val horse: SheetLook, val px: Float, startX: Float, var facing: Int,
	val seconds: Float, val floor: () -> Float, val onEnd: (Float, Int) -> Unit,
) : View(root.context), Ride.Scene {
	private val night = RuntimeShader(NIGHT)
	private val content: View? = root.findViewById(android.R.id.content)
	private var graded = true

	private val born = now()
	private var last = SystemClock.uptimeMillis()
	private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
	private val fill = Paint().apply { isAntiAlias = true }
	private val add = Paint().apply { isAntiAlias = true; blendMode = BlendMode.PLUS }
	private val path = Path()
	private val dest = RectF()
	private val hw = horse.cellW * px
	private val hh = horse.cellH * px
	private val rw = rider.cellW * px
	private val rh = rider.cellH * px

	private var x = startX
	private var y = 0f
	private var v = 0f
	private var vy = 0f
	private var jumpOff = 0f
	private val maxSpeed = dp(250f)
	private var phase = "gallop"
	private var phaseAt = born
	private var turnKind = "skid"
	private var gait = 0f
	private var nextJump = born + 12f + Random.nextFloat() * 18f
	private var endAt = -1f
	private var gradeK = 0f
	override var finished = false

	private class Flame(val x: Float, val y: Float, val vx: Float, val vy: Float, val born: Float, val life: Float, val size: Float, val kind: Int)
	private class Mark(val x: Float, val y: Float, val born: Float)
	private class Bat(var x: Float, val band: Float, val speed: Float, val phase: Float, val size: Float)
	private class Leaf(var x: Float, var y: Float, var vx: Float, val vy: Float, val spin: Float, val color: Int, val size: Float)

	private val flames = ArrayList<Flame>()
	private val marks = ArrayList<Mark>()
	private val bats = List(7) { Bat(Random.nextFloat() * 2000f, Random.nextFloat(), dp(50f) + Random.nextFloat() * dp(80f), Random.nextFloat() * 6f, dp(5f) + Random.nextFloat() * dp(5f)) }
	private val leaves = ArrayList<Leaf>()
	private var lastFlame = 0f
	private var lastMark = 0f
	private val trailX = FloatArray(TRAIL)
	private val trailY = FloatArray(TRAIL)
	private val trailA = FloatArray(TRAIL)

	init {
		isClickable = false
		isFocusable = false
		importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
		Sounds.appear(force = false)
	}

	private fun dp(v: Float) = v * resources.displayMetrics.density
	private fun now() = SystemClock.uptimeMillis() / 1000f

	override fun stopSoon() { if (endAt < 0f) endAt = now() }

	/** The rider's rect, as drawn (mirrored with the horse). */
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

	/** A point in the horse's cell (art pixels, facing right) in decor pixels, mirrored when facing left. */
	private fun horsePoint(cx: Float, cy: Float): FloatArray {
		val hx = x + cx * px
		return floatArrayOf(if (facing > 0) hx else 2f * x + hw - hx, y + cy * px)
	}

	private fun gallopFrame() = (gait.toInt()).mod(6)

	// ------------------------------------------------------------ movement

	private fun step(dt: Float, t: Float) {
		val w = width.toFloat()
		val fl = floor()
		y = fl - hh + jumpOff
		if (jumpOff < 0f || vy != 0f) {
			vy += dp(2200f) * dt
			jumpOff += vy * dt
			if (jumpOff >= 0f) {
				jumpOff = 0f; vy = 0f
				Sounds.thud(0.6f)
				burst(t, 10, dust = true)
				burst(t, 14, dust = false)
			}
		}
		when (phase) {
			"gallop" -> {
				// Distance left to the edge it is heading for; brake so it arrives slow.
				val toEdge = if (facing > 0) w - (x + hw) else x
				val brake = sqrt(max(0f, 2f * dp(700f) * toEdge))
				val target = min(maxSpeed, brake)
				v += ((target - v).coerceIn(-dp(900f) * dt, dp(420f) * dt))
				x += v * dt * facing
				if (toEdge <= dp(2f) && jumpOff == 0f) {
					x = if (facing > 0) w - hw else 0f
					phase = "turn"; phaseAt = t
					turnKind = if (Random.nextInt(3) == 0) "rear" else "skid"
					if (turnKind == "rear") Sounds.swoosh(0.4f) else burst(t, 8, dust = true)
				}
				if (t >= nextJump && jumpOff == 0f && v > maxSpeed * 0.6f && toEdge > w * 0.35f) {
					vy = -dp(900f); jumpOff = -0.01f
					nextJump = t + 18f + Random.nextFloat() * 22f
					Sounds.hop(0.6f)
				}
			}
			"turn" -> {
				v = 0f
				val len = if (turnKind == "rear") 0.8f else 0.35f
				if (t - phaseAt >= len) { facing = -facing; phase = "gallop"; phaseAt = t }
			}
			"off" -> {
				v = max(0f, v - dp(500f) * dt)
				x += v * dt * facing
				x = x.coerceIn(0f, max(0f, w - hw))
			}
		}
		// The legs keep pace with the speed.
		gait += dt * 10f * (v / maxSpeed).coerceIn(0f, 1.3f)

		// Fire off the hooves while they are on the ground and moving.
		val grounded = jumpOff == 0f && phase != "turn"
		if (grounded && v > dp(40f)) {
			val rate = 0.012f + 0.03f * (1f - v / maxSpeed).coerceIn(0f, 1f)
			while (t - lastFlame > rate) {
				lastFlame += rate
				if (t - lastFlame > 0.2f) lastFlame = t
				val hoof = if (Random.nextBoolean()) horsePoint(18f, 46f) else horsePoint(44f, 46f)
				flames.add(Flame(hoof[0] + (Random.nextFloat() - 0.5f) * dp(6f), hoof[1], -facing * v * (0.15f + Random.nextFloat() * 0.15f),
					-dp(40f) - Random.nextFloat() * dp(70f), t, 0.35f + Random.nextFloat() * 0.35f, dp(4f) + Random.nextFloat() * dp(4f), if (Random.nextInt(6) == 0) 1 else 0))
			}
			if (t - lastMark > 0.09f) {
				lastMark = t
				val hoof = horsePoint(30f, 46f)
				marks.add(Mark(hoof[0], fl - dp(1f), t))
			}
		} else lastFlame = t
		flames.removeAll { t - it.born > it.life }
		marks.removeAll { t - it.born > MARK_LIFE }

		for (b in bats) { b.x -= b.speed * dt; if (b.x < -dp(40f)) b.x = w + dp(40f) + Random.nextFloat() * w * 0.6f }
		if (leaves.size < 12 && Random.nextFloat() < dt * 2f) {
			leaves.add(Leaf(Random.nextFloat() * w, -dp(10f), (Random.nextFloat() - 0.6f) * dp(50f), dp(45f) + Random.nextFloat() * dp(55f), (Random.nextFloat() - 0.5f) * 400f,
				listOf(0xFFB8521E.toInt(), 0xFF8A3A14.toInt(), 0xFFD27B2A.toInt()).random(), dp(4f) + Random.nextFloat() * dp(4f)))
		}
		val it = leaves.iterator()
		val cx = x + hw / 2f
		while (it.hasNext()) {
			val l = it.next()
			// The horse's wind: leaves near it are swept along the way it is going.
			val near = (1f - abs(l.x - cx) / dp(90f)).coerceIn(0f, 1f) * (1f - abs(l.y - (y + hh / 2f)) / dp(120f)).coerceIn(0f, 1f)
			l.vx += facing * v * near * 3f * dt
			l.vx *= 1f - 0.8f * dt
			l.x += l.vx * dt + sin(t * 2f + l.y) * dp(20f) * dt
			l.y += l.vy * dt
			if (l.y > height + dp(20f) || l.x < -dp(40f) || l.x > w + dp(40f)) it.remove()
		}
	}

	/** Dust puffs (grey, slow) or sparks (hot, fast) at the hooves. */
	private fun burst(t: Float, n: Int, dust: Boolean) {
		for (i in 0 until n) {
			val hoof = horsePoint(if (Random.nextBoolean()) 18f else 44f, 46f)
			val sp = if (dust) dp(30f) + Random.nextFloat() * dp(50f) else dp(80f) + Random.nextFloat() * dp(160f)
			val ang = PI_F + Random.nextFloat() * PI_F
			flames.add(Flame(hoof[0], hoof[1], kotlin.math.cos(ang) * sp, kotlin.math.sin(ang) * sp, t, if (dust) 0.6f + Random.nextFloat() * 0.4f else 0.3f + Random.nextFloat() * 0.25f,
				if (dust) dp(5f) + Random.nextFloat() * dp(5f) else dp(1.5f) + Random.nextFloat() * dp(1.5f), if (dust) 2 else 3))
		}
	}

	// ------------------------------------------------------------ the grade

	private fun grade(t: Float, k: Float) {
		val c = content ?: return
		if (!graded) return
		try {
			if (k <= 0f) { SharedLayers.set(c, KEY, null); return }
			val loc = IntArray(2); val rootLoc = IntArray(2)
			c.getLocationInWindow(loc); root.getLocationInWindow(rootLoc)
			val offX = (loc[0] - rootLoc[0]).toFloat()
			val offY = (loc[1] - rootLoc[1]).toFloat()
			val lamp = lampPoint()
			night.setFloatUniform("size", c.width.toFloat(), c.height.toFloat())
			night.setFloatUniform("density", dp(1f))
			night.setFloatUniform("t", t - born)
			night.setFloatUniform("k", k)
			night.setFloatUniform("lamp", lamp[0] - offX, lamp[1] - offY)
			night.setFloatUniform("lampR", dp(120f))
			night.setFloatUniform("moon", width * MOON_X - offX, height * MOON_Y - offY)
			// The newest marks: where the ground is still burning.
			for (i in 0 until TRAIL) {
				val m = marks.getOrNull(marks.size - 1 - i * 2)
				if (m == null) { trailX[i] = 0f; trailY[i] = 0f; trailA[i] = -1f }
				else { trailX[i] = m.x - offX; trailY[i] = m.y - offY; trailA[i] = ((t - m.born) / MARK_LIFE).coerceIn(0f, 1f) }
			}
			night.setFloatUniform("tx", trailX)
			night.setFloatUniform("ty", trailY)
			night.setFloatUniform("ta", trailA)
			SharedLayers.set(c, KEY, RenderEffect.createRuntimeShaderEffect(night, "img"))
		} catch (e: Throwable) {
			graded = false
			ScreenBreak.shadersBroken = true
			android.util.Log.w("Sparkle", "ride night shader failed, dimming instead: ${e.message}")
			clearGrade()
		}
	}

	private fun clearGrade() {
		val c = content ?: return
		runCatching { SharedLayers.set(c, KEY, null) }
	}

	/** Where the jack-o'-lantern in his hand is, in decor pixels. */
	private fun lampPoint(): FloatArray {
		val f = gallopFrame()
		val rb = RIDER_BOB[f]
		val hb = if (phase == "gallop" || phase == "off") HORSE_BOB[f] else 0f
		// The rider strip's pumpkin is at (21, 28) in its cell, drawn facing right; mirror like the sprites.
		val lx = x + (30f - 32f) * px + 21.5f * px
		val ly = y - 28f * px + (28f + rb + hb) * px
		val mx = if (facing > 0) lx else 2f * x + hw - lx
		return floatArrayOf(mx, ly)
	}

	// ------------------------------------------------------------ drawing

	override fun onDraw(canvas: Canvas) {
		if (finished) return
		val t = now()
		val dt = ((SystemClock.uptimeMillis() - last) / 1000f).coerceIn(0f, 0.05f)
		last = SystemClock.uptimeMillis()
		if (endAt < 0f && t - born >= seconds) endAt = t
		if (endAt >= 0f && phase != "off") { phase = "off"; phaseAt = t }
		step(dt, t)
		gradeK = if (endAt >= 0f) (1f - (t - endAt) / 1.2f).coerceIn(0f, 1f) else ((t - born) / 1.2f).coerceIn(0f, 1f)
		if (endAt >= 0f && t - endAt >= 1.2f && v <= 0f) { finish(); return }
		val k = gradeK
		grade(t, k)
		val w = width.toFloat()
		val h = height.toFloat()
		if (!graded || content == null) canvas.drawColor(Color.argb((255 * 0.5f * k).toInt(), 10, 10, 34))

		drawMoon(canvas, t, w, h, k)
		drawBats(canvas, t, h, k)
		for (l in leaves) {
			canvas.save()
			canvas.rotate(t * l.spin, l.x, l.y)
			fill.color = (l.color and 0x00FFFFFF) or ((255 * k).toInt() shl 24)
			canvas.drawRect(l.x - l.size / 2f, l.y - l.size / 3f, l.x + l.size / 2f, l.y + l.size / 3f, fill)
			canvas.restore()
		}
		// Burning prints on the floor: a low glow that cools from yellow to red.
		for (m in marks) {
			val life = 1f - (t - m.born) / MARK_LIFE
			add.color = Color.argb((140 * life).toInt(), 255, (80 + 120 * life).toInt(), 20)
			canvas.drawOval(m.x - dp(7f) * life - dp(2f), m.y - dp(2f), m.x + dp(7f) * life + dp(2f), m.y + dp(2f), add)
		}
		drawFlames(canvas, t, back = true)
		drawRiderAndHorse(canvas, t)
		drawFlames(canvas, t, back = false)
		postInvalidateOnAnimation()
	}

	private fun drawMoon(canvas: Canvas, t: Float, w: Float, h: Float, k: Float) {
		if (k <= 0f) return
		val mx = w * MOON_X
		val my = h * MOON_Y
		val mr = dp(24f)
		fill.shader = RadialGradient(mx, my, mr * 4f, intArrayOf(Color.argb((90 * k).toInt(), 200, 210, 255), Color.argb(0, 200, 210, 255)), null, Shader.TileMode.CLAMP)
		canvas.drawCircle(mx, my, mr * 4f, fill)
		fill.shader = null
		fill.color = Color.argb((255 * k).toInt(), 238, 234, 214)
		canvas.drawCircle(mx, my, mr, fill)
		fill.color = Color.argb((255 * k).toInt(), 210, 204, 182)
		canvas.drawCircle(mx - mr * 0.3f, my - mr * 0.2f, mr * 0.2f, fill)
		canvas.drawCircle(mx + mr * 0.28f, my + mr * 0.35f, mr * 0.13f, fill)
		canvas.drawCircle(mx + mr * 0.35f, my - mr * 0.35f, mr * 0.09f, fill)
		// A thin cloud drifting across the moon now and then.
		val span = w + dp(320f)
		val cx = ((t - born) * dp(14f)) % span - dp(160f)
		fill.color = Color.argb((150 * k).toInt(), 22, 24, 48)
		canvas.drawRoundRect(cx - dp(70f), my + dp(2f), cx + dp(70f), my + dp(14f), dp(8f), dp(8f), fill)
		canvas.drawRoundRect(cx - dp(30f), my - dp(6f), cx + dp(50f), my + dp(6f), dp(8f), dp(8f), fill)
	}

	private fun drawBats(canvas: Canvas, t: Float, h: Float, k: Float) {
		fill.color = Color.argb((255 * k).toInt(), 14, 12, 22)
		for (b in bats) {
			val by = h * (0.1f + b.band * 0.3f) + sin(t * 3f + b.phase) * dp(10f)
			val flap = sin(t * 15f + b.phase)
			val s = b.size
			path.reset()
			// Body, then each wing: shoulder, tip (up or down with the flap), and a scalloped trailing edge.
			path.addOval(b.x - s * 0.3f, by - s * 0.25f, b.x + s * 0.3f, by + s * 0.35f, Path.Direction.CW)
			for (side in floatArrayOf(-1f, 1f)) {
				path.moveTo(b.x + side * s * 0.2f, by - s * 0.1f)
				path.lineTo(b.x + side * s * 1.7f, by - flap * s * 0.8f)
				path.lineTo(b.x + side * s * 1.2f, by + s * 0.25f - flap * s * 0.3f)
				path.lineTo(b.x + side * s * 0.8f, by + s * 0.05f)
				path.lineTo(b.x + side * s * 0.45f, by + s * 0.3f)
				path.close()
			}
			canvas.drawPath(path, fill)
		}
	}

	private fun drawFlames(canvas: Canvas, t: Float, back: Boolean) {
		for (f in flames) {
			val age = t - f.born
			val u = (age / f.life).coerceIn(0f, 1f)
			val fx = f.x + f.vx * age
			val fy = f.y + f.vy * age + (if (f.kind == 3) dp(600f) * age * age else 0f)
			when (f.kind) {
				0, 1 -> {
					if (back != (f.kind == 0)) continue
					// Cools white-yellow -> orange -> red as it rises and shrinks.
					val r = f.size * (1f - u * 0.8f)
					val g = (230 * (1f - u)).toInt().coerceAtLeast(30)
					add.color = Color.argb((230 * (1f - u)).toInt(), 255, g, (120 * (1f - u) * (1f - u)).toInt())
					canvas.drawCircle(fx + sin(age * 25f + f.x) * dp(1.5f), fy, r, add)
				}
				2 -> {
					if (!back) continue
					fill.color = Color.argb((90 * (1f - u)).toInt(), 120, 116, 130)
					canvas.drawCircle(fx, fy, f.size * (0.6f + u), fill)
				}
				else -> {
					if (back) continue
					add.color = Color.argb((255 * (1f - u)).toInt(), 255, 200, 90)
					canvas.drawCircle(fx, fy, f.size, add)
				}
			}
		}
	}

	private fun drawRiderAndHorse(canvas: Canvas, t: Float) {
		val f = gallopFrame()
		val strip: String
		val hf: android.graphics.Bitmap?
		var riderLift = 0f
		when {
			phase == "turn" && turnKind == "rear" -> {
				val u = t - phaseAt
				strip = "rear"
				hf = horse.stripFrame(strip, u, 10f, false)
				val ri = (u * 10f).toInt().coerceIn(0, REAR.size - 1)
				riderLift = REAR[ri] * 0.6f
			}
			phase == "turn" -> { strip = "gallop"; hf = horse.stripFrame(strip, 0.4f, 10f, true) } // skidding, legs gathered
			v < dp(10f) && jumpOff == 0f -> { strip = "idle"; hf = horse.stripFrame(strip, t - born, 4f, true) }
			else -> { strip = "gallop"; hf = horse.stripFrame(strip, (f + 0.5f) / 10f, 10f, true) }
		}
		val bobbing = strip == "gallop" && phase != "turn"
		val rf = rider.stripFrame("ride", ((if (bobbing) f else 3) + 0.5f) / 10f, 10f, true)
		canvas.save()
		if (facing < 0) canvas.scale(-1f, 1f, x + hw / 2f, 0f)
		// The lantern's own glow on the horse's flank, under the sprites' outline.
		val lamp = lampPoint()
		val lx = if (facing > 0) lamp[0] else 2f * x + hw - lamp[0]
		val flick = 0.85f + 0.15f * sin(t * 13f) * sin(t * 7.3f)
		fill.shader = RadialGradient(lx, lamp[1], dp(26f), intArrayOf(Color.argb((110 * flick).toInt(), 255, 170, 60), Color.argb(0, 255, 170, 60)), null, Shader.TileMode.CLAMP)
		canvas.drawCircle(lx, lamp[1], dp(26f), fill)
		fill.shader = null
		if (hf != null) { dest.set(x, y, x + hw, y + hh); canvas.drawBitmap(hf, null, dest, paint) }
		if (rf != null) {
			val rx = x + (30f - 32f) * px
			val ry = y - 28f * px + (if (bobbing) HORSE_BOB[f] else 0f) * px - riderLift * px
			dest.set(rx, ry, rx + rw, ry + rh)
			canvas.drawBitmap(rf, null, dest, paint)
		}
		canvas.restore()
	}

	private fun finish() {
		if (finished) return
		finished = true
		clearGrade()
		val fx = x; val ff = facing
		post { onEnd(fx, ff) }
	}

	override fun onDetachedFromWindow() {
		super.onDetachedFromWindow()
		clearGrade()
		if (!finished) finish()
	}

	private companion object {
		const val KEY = "35-sparkle-ride"
		const val TRAIL = 10
		const val MARK_LIFE = 1.1f
		const val MOON_X = 0.82f
		const val MOON_Y = 0.11f
		val PI_F = Math.PI.toFloat()
		/** boss_art's gallop bob per frame (the horse's body in its cell) and the rider strip's own. */
		val HORSE_BOB = floatArrayOf(-2f, -1f, 0f, 1f, 1f, 0f)
		val RIDER_BOB = floatArrayOf(-1f, -2f, -1f, 0f, 1f, 0f)
		/** boss_art's rear heights per frame: how far the front (and the saddle, about half) comes up. */
		val REAR = floatArrayOf(0f, 3f, 6f, 8f, 8f, 6f, 3f, 0f)

		const val NIGHT = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float t;
uniform float k;
uniform float2 lamp;
uniform float lampR;
uniform float2 moon;
uniform float[10] tx;
uniform float[10] ty;
uniform float[10] ta;

float hash1(float2 q) {
    q = fract(q * float2(123.34, 456.21));
    q += dot(q, q + 45.32);
    return fract(q.x * q.y);
}
float vnoise2(float2 q) {
    float2 i = floor(q);
    float2 f = fract(q);
    float2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i), hash1(i + float2(1.0, 0.0)), u.x), mix(hash1(i + float2(0.0, 1.0)), hash1(i + float2(1.0, 1.0)), u.x), u.y);
}

half4 main(float2 p) {
    // Heat haze above the burning prints, and their glow on the floor.
    float2 disp = float2(0.0);
    float burn = 0.0;
    for (int i = 0; i < 10; ++i) {
        if (ta[i] < 0.0) continue;
        float2 d = p - float2(tx[i], ty[i] - 14.0 * density);
        float life = 1.0 - ta[i];
        float w = exp(-dot(d, d) / (324.0 * density * density)) * life;
        disp.x += sin(p.y / (4.0 * density) + t * 14.0) * 1.6 * density * w;
        disp.y -= abs(cos(p.x / (5.0 * density) + t * 11.0)) * 1.2 * density * w;
        float2 g = p - float2(tx[i], ty[i]);
        burn += exp(-length(g) / (12.0 * density)) * life;
    }
    half4 src = img.eval(p + disp * k);
    float3 col = src.rgb;
    float lum = dot(col, float3(0.3, 0.59, 0.11));

    // Moonlight: cold, desaturated, darker toward the edges, a little brighter toward the moon.
    float3 nightC = mix(col, lum * float3(0.55, 0.68, 1.0), 0.55) * 0.66 + float3(0.0, 0.01, 0.04);
    float2 e = (p / size - 0.5) * float2(1.0, 0.8);
    nightC *= 1.0 - 0.45 * smoothstep(0.35, 1.0, length(e) * 1.6);
    nightC += float3(0.5, 0.6, 0.85) * exp(-length(p - moon) / (size.x * 0.6)) * 0.07;

    // The jack-o'-lantern's warm pool, flickering.
    float dl = length(p - lamp);
    float L = exp(-(dl * dl) / (lampR * lampR)) * (0.85 + 0.15 * sin(t * 13.0) * sin(t * 7.3));
    float3 lit = col * float3(1.12, 0.92, 0.72) + float3(0.08, 0.03, 0.0);
    nightC = mix(nightC, lit, L * 0.85);

    // Low fog drifting along the bottom, lit orange where the lantern reaches.
    float fy = smoothstep(size.y * 0.5, size.y, p.y);
    float2 fq = float2(p.x / (110.0 * density) + t * 0.05, p.y / (60.0 * density));
    float fogN = 0.6 * vnoise2(fq) + 0.4 * vnoise2(fq * 2.3 + float2(t * 0.08, 1.7));
    nightC += mix(float3(0.55, 0.6, 0.75), float3(1.0, 0.6, 0.3), L) * fogN * fy * 0.28;

    nightC += float3(1.0, 0.45, 0.1) * min(burn, 1.0) * 0.35;
    return half4(half3(mix(col, nightC, k)), src.a);
}
"""
	}
}
