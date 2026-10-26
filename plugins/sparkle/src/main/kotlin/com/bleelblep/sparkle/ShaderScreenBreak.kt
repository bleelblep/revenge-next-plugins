package com.bleelblep.sparkle

import android.annotation.TargetApi
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * The screen tricks as AGSL shaders (Android 13+), with the window snapshot as their input. Every pixel
 * works out which bit of the snapshot it shows, so the screen is really cut, torn, stretched and
 * cracked rather than moved in clipped slabs:
 * - CUT (the Horseman's scythe): a white-hot slash streaks across, the two halves shear apart along it
 *   with a burning rift between them and glowing, colour-split edges, then slam back together.
 * - CLAWS (Krampus): three jagged gashes rake across one after another and gape open onto a red glow,
 *   the screen bulging away from each like torn paper with pale fibres at the edge, then close to scars.
 * - HOOK (Krampus's chain): the hook punches a cracked hole and the screen stretches toward his hand
 *   like rubber around it, then springs back with a wobble (now and then it is dragged off whole).
 * - HORN (Krampus's head-butt): a dent of crushed glass, a shockwave ring, long wandering cracks out
 *   from the impact joined by broken rings, and the shards between them shifting and catching the light.
 * - FLURRY (the Horseman, three swings): three slashes a beat apart at different angles, each shearing
 *   its own cut, so the screen ends up in up to eight sliding pieces before it all slams back.
 * - PUMPKIN (the Horseman's jack-o'-lantern): it arcs across and smashes; the screen burns through in
 *   ragged holes with flames inside, a glowing rim, a scorched halo and heat haze, then heals over.
 * - REAP (the Horseman's reaping): the screen twists into a swirl round one point and drains to a ghostly
 *   green while souls spiral in, then it snaps back with a flash.
 * Sparks, embers, glass bits and the chain are Canvas drawing on top. All of it is worked out from the
 * effect's age. If the shader fails to draw, [ScreenBreak.shadersBroken] is set and the effect ends;
 * later ones use [LegacyBreakView].
 */
@TargetApi(33)
internal class ShaderBreakView(
	context: Context, private var shot: Bitmap?, val kind: ScreenBreak.Kind, val ox: Float, val oy: Float, val facing: Int,
	val hand: FloatArray?, val onBite: (() -> Unit)?, val done: () -> Unit,
) : View(context), ScreenBreak.Effect {
	private val start = now()
	private val shader = RuntimeShader(COMMON + when (kind) {
		ScreenBreak.Kind.CUT -> CUT
		ScreenBreak.Kind.CLAWS -> CLAWS
		ScreenBreak.Kind.HOOK -> HOOK
		ScreenBreak.Kind.HORN -> HORN
		ScreenBreak.Kind.FLURRY -> FLURRY
		ScreenBreak.Kind.PUMPKIN -> PUMPKIN
		ScreenBreak.Kind.REAP -> REAP
	})
	private val paint = Paint().apply { shader = this@ShaderBreakView.shader }
	private val fill = Paint().apply { isAntiAlias = true }
	private val glow = Paint().apply { isAntiAlias = true; blendMode = BlendMode.PLUS; strokeCap = Paint.Cap.ROUND; style = Paint.Style.STROKE }
	private val line = Paint().apply { isAntiAlias = true; strokeCap = Paint.Cap.ROUND; style = Paint.Style.STROKE }
	private val path = Path()
	private var imageReady = false
	private var finished = false
	private var bitten = false
	private val seed = Random.nextFloat() * 100f
	private val bits = ArrayList<Bit>()

	val duration = when (kind) {
		ScreenBreak.Kind.CUT -> 1.5f
		ScreenBreak.Kind.CLAWS -> 1.5f
		ScreenBreak.Kind.HOOK -> 2.4f
		ScreenBreak.Kind.HORN -> 1.6f
		ScreenBreak.Kind.FLURRY -> 1.9f
		ScreenBreak.Kind.PUMPKIN -> 2.9f
		ScreenBreak.Kind.REAP -> 2.2f
	}

	// CUT: the angle as before (mostly flat, sometimes near vertical), each cut pointing away from the pet.
	private val cutDir = cutDirection(
		(if (Random.nextFloat() < 0.3f) (90f + Random.nextFloat() * 30f - 15f) else (Random.nextFloat() * 70f - 35f)) * DEG)
	private val cross = kind == ScreenBreak.Kind.CUT && Random.nextFloat() < 0.25f
	private val cutDir2 = cutDirection(atan2(cutDir[1], cutDir[0]) + (90f + Random.nextFloat() * 40f - 20f) * DEG)

	// CLAWS: down and forward, steep.
	private val clawAngle = (55f + Random.nextFloat() * 20f) * DEG
	private val clawDir = floatArrayOf(cos(clawAngle) * facing, sin(clawAngle))
	private var clawCentre = floatArrayOf(ox, oy)

	// HOOK: how hard it hauls, and the rare drag right off the screen.
	private val pullK = 0.25f + Random.nextFloat() * 0.2f
	private val dragOff = kind == ScreenBreak.Kind.HOOK && Random.nextFloat() < 0.2f
	private var anchorX = 0f
	private var anchorY = 0f

	// FLURRY: three cuts round one point, each at its own angle and a beat after the last.
	private val flurryStarts = floatArrayOf(0f, 0.2f, 0.4f)
	private val flurryDirs = run {
		val a0 = (Random.nextFloat() * 70f - 35f) * DEG
		val turn = (50f + Random.nextFloat() * 25f) * DEG
		listOf(cutDirection(a0), cutDirection(a0 + turn), cutDirection(a0 - turn))
	}
	private val flurryJitter = List(3) { floatArrayOf(Random.nextFloat() - 0.5f, Random.nextFloat() - 0.5f) }
	private var flurryCentre = floatArrayOf(ox, oy)
	private val flurrySparked = BooleanArray(3)

	// PUMPKIN: where it lands, and two smaller fires from the splash.
	private var impactX = 0f
	private var impactY = 0f
	private val splash = List(2) { floatArrayOf((Random.nextFloat() - 0.5f) * 2f, (Random.nextFloat() - 0.5f) * 2f) }
	private var landed = false

	// REAP: the eye of the swirl, and the souls drawn into it (start, angle, distance, size).
	private var eyeX = ox
	private var eyeY = oy
	private val souls = List(22) { floatArrayOf(Random.nextFloat(), Random.nextFloat() * 2f * PI.toFloat(), 0.25f + Random.nextFloat() * 0.35f, Random.nextFloat()) }
	private var flashed = false

	init {
		isClickable = false
		isFocusable = false
		importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
	}

	override fun release() {
		finished = true
		shot?.recycle()
		shot = null
	}

	private fun dp(v: Float) = v * resources.displayMetrics.density

	private fun cutDirection(a: Float): FloatArray {
		var dx = cos(a); var dy = sin(a)
		if (dx * facing < 0f || (dx * facing == 0f && dy > 0f)) { dx = -dx; dy = -dy }
		return floatArrayOf(dx, dy)
	}

	override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
		imageReady = false
		// HOOK: the bite lands on the far half of the screen from the pet, somewhere in its upper part.
		anchorX = if (facing > 0) w * (0.55f + Random.nextFloat() * 0.38f) else w * (0.07f + Random.nextFloat() * 0.38f)
		anchorY = h * (0.12f + Random.nextFloat() * 0.45f)
		// CLAWS: the rake starts by the claw and is pulled toward the middle of the screen.
		val cx = ox + (w / 2f - ox) * 0.45f
		val cy = oy + (h / 2f - oy) * 0.45f
		clawCentre = floatArrayOf(cx.coerceIn(w * 0.2f, w * 0.8f), cy.coerceIn(h * 0.2f, h * 0.8f))
		// FLURRY: half way from the blade to the middle of the screen.
		flurryCentre = floatArrayOf((ox + (w / 2f - ox) * 0.5f).coerceIn(w * 0.25f, w * 0.75f), (oy + (h / 2f - oy) * 0.5f).coerceIn(h * 0.25f, h * 0.75f))
		// PUMPKIN: somewhere in the upper middle, on the side he faces.
		impactX = if (facing > 0) w * (0.45f + Random.nextFloat() * 0.35f) else w * (0.2f + Random.nextFloat() * 0.35f)
		impactY = h * (0.22f + Random.nextFloat() * 0.3f)
		// REAP: between the blade and the middle of the screen.
		eyeX = (ox + (w / 2f - ox) * 0.6f).coerceIn(w * 0.25f, w * 0.75f)
		eyeY = (oy + (h * 0.42f - oy) * 0.6f).coerceIn(h * 0.25f, h * 0.7f)
	}

	private fun bindImage() {
		val b = shot ?: return
		val bs = BitmapShader(b, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
		bs.setLocalMatrix(Matrix().apply { setScale(width / b.width.toFloat(), height / b.height.toFloat()) })
		shader.setInputShader("img", bs)
		imageReady = true
	}

	override fun onDraw(canvas: Canvas) {
		if (finished) return
		val a = now() - start
		if (a >= duration) { finish(); return }
		if (!canvas.isHardwareAccelerated) { broken(null); return }
		val w = width.toFloat()
		val h = height.toFloat()
		try {
			if (!imageReady) bindImage()
			if (!imageReady) { finish(); return }
			shader.setFloatUniform("size", w, h)
			shader.setFloatUniform("density", dp(1f))
			shader.setFloatUniform("t", a)
			when (kind) {
				ScreenBreak.Kind.CUT -> cut(a, w, h)
				ScreenBreak.Kind.CLAWS -> claws(a, w, h)
				ScreenBreak.Kind.HOOK -> hook(a, w, h)
				ScreenBreak.Kind.HORN -> horn(a, w, h)
				ScreenBreak.Kind.FLURRY -> flurry(a, w, h)
				ScreenBreak.Kind.PUMPKIN -> pumpkin(a, w, h)
				ScreenBreak.Kind.REAP -> reap(a, w, h)
			}
			canvas.drawRect(0f, 0f, w, h, paint)
		} catch (e: Throwable) {
			broken(e)
			return
		}
		if (kind == ScreenBreak.Kind.HOOK) drawChain(canvas, a)
		if (kind == ScreenBreak.Kind.PUMPKIN) drawLob(canvas, a)
		if (kind == ScreenBreak.Kind.REAP) drawSouls(canvas, a)
		drawBits(canvas, a)
		postInvalidateOnAnimation()
	}

	private fun broken(e: Throwable?) {
		ScreenBreak.shadersBroken = true
		android.util.Log.w("Sparkle", "screen trick shader failed, using the legacy overlay from now on: ${e?.message ?: "no hardware canvas"}")
		finish()
	}

	// ------------------------------------------------------------ timelines

	private fun easeOut(u: Float): Float { val k = u.coerceIn(0f, 1f); return 1f - (1f - k) * (1f - k) * (1f - k) }
	private fun easeIn(u: Float): Float { val k = u.coerceIn(0f, 1f); return k * k }

	/** Apart, then back with one overshoot: 0 before [t0], peak at [t1], settled at [t2]. */
	private fun apart(a: Float, t0: Float, t1: Float, t2: Float): Float = when {
		a < t0 -> 0f
		a < t1 -> easeOut((a - t0) / (t1 - t0))
		a < t2 -> { val u = (a - t1) / (t2 - t1); (1f - u) * cos(1.5f * PI.toFloat() * u) }
		else -> 0f
	}

	/** A jolt that dies away between [t0] and [t1]. */
	private fun shake(a: Float, t0: Float, t1: Float, amp: Float) {
		if (a < t0 || a > t1) { shader.setFloatUniform("shake", 0f, 0f); return }
		val k = 1f - (a - t0) / (t1 - t0)
		shader.setFloatUniform("shake", dp(amp) * k * sin(a * 97f), dp(amp) * 0.6f * k * cos(a * 83f))
	}

	private fun cut(a: Float, w: Float, h: Float) {
		val m = min(w, h)
		val g = apart(a, 0.1f, 0.55f, 1.35f)
		shader.setFloatUniform("origin", ox, oy)
		shader.setFloatUniform("dir1", cutDir[0], cutDir[1])
		shader.setFloatUniform("dir2", cutDir2[0], cutDir2[1])
		shader.setFloatUniform("crossed", if (cross) 1f else 0f)
		shader.setFloatUniform("gap", g * 0.065f * m)
		shader.setFloatUniform("slide", g * 0.035f * m)
		shader.setFloatUniform("heat", if (a < 0.1f) a / 0.1f else exp(-(a - 0.1f) * 2.4f))
		shader.setFloatUniform("sweep1", -0.3f + 2.6f * easeOut(a / 0.13f))
		shader.setFloatUniform("sweep2", -0.3f + 2.6f * easeOut((a - 0.09f) / 0.13f))
		shader.setFloatUniform("lineA", if (a < 0.22f) 1f else (1f - (a - 0.22f) / 0.35f).coerceIn(0f, 1f))
		shake(a, 0.08f, 0.45f, 3f)
		if (bits.isEmpty()) {
			for (d in listOf(cutDir) + (if (cross) listOf(cutDir2) else emptyList())) sparksAlong(ox, oy, d, 0.04f, 16)
		}
	}

	private fun claws(a: Float, w: Float, h: Float) {
		val m = min(w, h)
		val len = 0.55f * m
		val open = when {
			a < 0.06f -> 0f
			a < 0.2f -> easeOut((a - 0.06f) / 0.14f)
			a < 0.75f -> 1f
			else -> 1f - easeIn((a - 0.75f) / 0.4f)
		}
		val scar = when {
			a < 0.75f -> 0f
			a < 1.15f -> (a - 0.75f) / 0.4f
			else -> (1f - (a - 1.15f) / 0.35f).coerceIn(0f, 1f)
		} * 0.8f
		shader.setFloatUniform("origin", clawCentre[0], clawCentre[1])
		shader.setFloatUniform("dir", clawDir[0], clawDir[1])
		shader.setFloatUniform("spacing", dp(24f))
		shader.setFloatUniform("len", len)
		shader.setFloatUniform("width", dp(10f))
		shader.setFloatUniform("open", open)
		shader.setFloatUniform("rake", easeOut(a / 0.2f))
		shader.setFloatUniform("heat", if (a < 0.15f) 1f else exp(-(a - 0.15f) * 1.8f))
		shader.setFloatUniform("scar", scar)
		shake(a, 0.05f, 0.4f, 2.5f)
		if (bits.isEmpty()) {
			val nx = -clawDir[1]; val ny = clawDir[0]
			for (i in 0 until 36) {
				val claw = Random.nextInt(3) - 1
				val u = (Random.nextFloat() - 0.5f) * len * 0.8f
				val x = clawCentre[0] + nx * claw * dp(24f) + clawDir[0] * u
				val y = clawCentre[1] + ny * claw * dp(24f) + clawDir[1] * u
				// Each ember leaves when its claw has passed that point.
				val passed = ((u / len + 0.5f) + (claw + 1) * 0.12f) / 1.35f * 0.2f
				bits.add(Bit(x, y, (Random.nextFloat() - 0.5f) * dp(60f), -dp(30f) - Random.nextFloat() * dp(70f), passed + Random.nextFloat() * 0.5f,
					0.5f + Random.nextFloat() * 0.5f, dp(1.5f) + Random.nextFloat() * dp(2f), Bit.EMBER, -dp(40f)))
			}
		}
	}

	private fun hookPull(a: Float, vx: Float, vy: Float): FloatArray {
		val reach = 0.25f
		val tear = 1.55f
		if (a < reach) return floatArrayOf(0f, 0f, 0f, 0f)
		var k = when {
			a < 0.35f -> 0.04f * ((a - reach) / 0.1f)
			a < 1.35f -> 0.04f + (pullK - 0.04f) * easeOut((a - 0.35f) / 1.0f)
			a < tear -> pullK + sin((a - 1.35f) * 60f) * 0.012f
			dragOff -> pullK
			else -> { val u = a - tear; pullK * exp(-u * 5f) * cos(u * 16f) }
		}
		var sx = 0f; var sy = 0f
		if (dragOff && a >= tear) {
			// Dragged clean off toward the hand's side, then back in from the other edge.
			val u = ((a - tear) / 0.8f).coerceIn(0f, 1f)
			sx = if (u < 0.45f) facing * width * 1.2f * easeOut(u / 0.45f) else -facing * width * 1.2f * (1f - easeOut((u - 0.45f) / 0.55f))
			if (u >= 0.45f) k = 0f
			sy = 0f
		}
		return floatArrayOf(vx * k, vy * k, sx, sy)
	}

	private fun hook(a: Float, w: Float, h: Float) {
		val hx = hand?.get(0) ?: ox
		val hy = hand?.get(1) ?: oy
		if (a >= 0.25f && !bitten) {
			bitten = true
			onBite?.invoke()
			for (i in 0 until 14) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(80f) + Random.nextFloat() * dp(220f)
				bits.add(Bit(anchorX, anchorY, cos(ang) * sp, sin(ang) * sp - dp(60f), a, 0.3f + Random.nextFloat() * 0.25f,
					dp(1.5f) + Random.nextFloat() * dp(1f), Bit.SPARK, dp(900f)))
			}
			for (i in 0 until 8) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(60f) + Random.nextFloat() * dp(160f)
				bits.add(Bit(anchorX, anchorY, cos(ang) * sp, sin(ang) * sp - dp(120f), a, 0.7f + Random.nextFloat() * 0.3f,
					dp(3f) + Random.nextFloat() * dp(3f), Bit.GLASS, dp(1100f)))
			}
		}
		val p = hookPull(a, hx - anchorX, hy - anchorY)
		shader.setFloatUniform("anchor", anchorX, anchorY)
		shader.setFloatUniform("pull", p[0], p[1])
		shader.setFloatUniform("radius", 0.4f * min(w, h))
		shader.setFloatUniform("slideAll", p[2], p[3])
		shader.setFloatUniform("bite", if (a < 0.25f) 0f else easeOut((a - 0.25f) / 0.08f))
		shader.setFloatUniform("seed", seed)
		shake(a, 0.25f, 0.45f, 2f)
	}

	private fun horn(a: Float, w: Float, h: Float) {
		val m = min(w, h)
		shader.setFloatUniform("origin", ox, oy)
		shader.setFloatUniform("bulge", dp(20f) * sin(PI.toFloat() * (a / 0.45f).coerceIn(0f, 1f)) * exp(-2f * a))
		shader.setFloatUniform("crack", (if (a < 0.05f) a / 0.05f else 1f) * (1f - easeIn((a - 1.0f) / 0.55f)))
		shader.setFloatUniform("shard", easeOut(a / 0.08f) * (1f - easeIn((a - 0.9f) / 0.5f)))
		shader.setFloatUniform("ring", a * max(w, h) * 1.6f)
		shader.setFloatUniform("ringA", (1f - a / 0.55f).coerceIn(0f, 1f))
		shader.setFloatUniform("reachPx", 0.4f * m)
		shader.setFloatUniform("seed", seed)
		shake(a, 0.0f, 0.35f, 4f)
		if (bits.isEmpty()) {
			for (i in 0 until 18) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(90f) + Random.nextFloat() * dp(260f)
				bits.add(Bit(ox, oy, cos(ang) * sp, sin(ang) * sp - dp(160f), Random.nextFloat() * 0.05f, 0.8f + Random.nextFloat() * 0.4f,
					dp(2.5f) + Random.nextFloat() * dp(4f), Bit.GLASS, dp(1300f)))
			}
		}
	}

	private fun sparksAlong(x: Float, y: Float, d: FloatArray, born: Float, n: Int) {
		for (i in 0 until n) {
			val along = (Random.nextFloat() * 2f - 1f) * dp(40f)
			val sp = dp(140f) + Random.nextFloat() * dp(320f)
			val spread = (Random.nextFloat() - 0.5f) * 1.6f
			val side = if (Random.nextBoolean()) 1f else -1f
			bits.add(Bit(x + d[0] * along, y + d[1] * along, (d[0] * 0.8f - d[1] * side * spread) * sp, (d[1] * 0.8f + d[0] * side * spread) * sp - dp(60f),
				born + Random.nextFloat() * 0.08f, 0.35f + Random.nextFloat() * 0.3f, dp(1.5f) + Random.nextFloat() * dp(1.5f), Bit.SPARK, dp(900f)))
		}
	}

	private fun flurry(a: Float, w: Float, h: Float) {
		val m = min(w, h)
		var heat = 0f
		for (i in 0 until 3) {
			val st = flurryStarts[i]
			val d = flurryDirs[i]
			val cx = flurryCentre[0] + flurryJitter[i][0] * 0.16f * m
			val cy = flurryCentre[1] + flurryJitter[i][1] * 0.16f * m
			// Each cut opens, holds while the others land, and all of them close together near the end.
			val open = when {
				a < st + 0.06f -> 0f
				a < st + 0.3f -> easeOut((a - st - 0.06f) / 0.24f)
				a < 1.25f -> 1f
				a < 1.75f -> { val u = (a - 1.25f) / 0.5f; (1f - u) * cos(1.5f * PI.toFloat() * u) }
				else -> 0f
			}
			val g = open * 0.04f * m
			val sl = open * 0.025f * m
			shader.setFloatUniform("o$i", cx, cy)
			shader.setFloatUniform("d$i", d[0], d[1])
			shader.setFloatUniform("v$i", -d[1] * g + d[0] * sl, d[0] * g + d[1] * sl)
			shader.setFloatUniform("sw$i", -0.3f + 2.6f * easeOut((a - st) / 0.12f))
			shader.setFloatUniform("la$i", if (a < st) 0f else if (a < st + 0.2f) 1f else (1f - (a - st - 0.2f) / 0.3f).coerceIn(0f, 1f))
			if (a >= st) heat = max(heat, if (a < st + 0.08f) (a - st) / 0.08f else exp(-(a - st - 0.08f) * 2.2f))
			if (a >= st && !flurrySparked[i]) {
				flurrySparked[i] = true
				sparksAlong(cx, cy, d, a, 12)
				if (i > 0) Sounds.swoosh(0.8f)
			}
		}
		// The slam back together glows once more.
		if (a >= 1.62f) heat = max(heat, 0.6f * (1f - (a - 1.62f) / 0.25f).coerceIn(0f, 1f))
		shader.setFloatUniform("heat", heat)
		if (a < 1.0f) shake(a, 0.05f, 0.9f, 3f) else shake(a, 1.6f, 1.85f, 4f)
	}

	private fun lobAt(a: Float): FloatArray {
		val hx = hand?.get(0) ?: ox
		val hy = hand?.get(1) ?: oy
		val u = (a / LOB).coerceIn(0f, 1f)
		val arc = max(dp(90f), (hy - impactY) * 0.5f + dp(60f))
		return floatArrayOf(hx + (impactX - hx) * u, hy + (impactY - hy) * u - arc * 4f * u * (1f - u))
	}

	private fun pumpkin(a: Float, w: Float, h: Float) {
		val m = min(w, h)
		val b = a - LOB
		if (b >= 0f && !landed) {
			landed = true
			Sounds.thud(1f)
			for (i in 0 until 14) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(120f) + Random.nextFloat() * dp(260f)
				bits.add(Bit(impactX, impactY, cos(ang) * sp, sin(ang) * sp - dp(180f), a, 0.8f + Random.nextFloat() * 0.4f,
					dp(4f) + Random.nextFloat() * dp(4f), Bit.CHUNK, dp(1300f)))
			}
			for (i in 0 until 16) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(80f) + Random.nextFloat() * dp(200f)
				bits.add(Bit(impactX, impactY, cos(ang) * sp, sin(ang) * sp - dp(140f), a, 0.7f + Random.nextFloat() * 0.4f,
					dp(1.6f) + Random.nextFloat() * dp(1f), Bit.SEED, dp(1200f)))
			}
			for (i in 0 until 26) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(150f) + Random.nextFloat() * dp(300f)
				bits.add(Bit(impactX, impactY, cos(ang) * sp, sin(ang) * sp - dp(80f), a, 0.3f + Random.nextFloat() * 0.35f,
					dp(1.5f) + Random.nextFloat() * dp(1.5f), Bit.SPARK, dp(900f)))
			}
			for (i in 0 until 30) {
				bits.add(Bit(impactX + (Random.nextFloat() - 0.5f) * 0.4f * m, impactY + (Random.nextFloat() - 0.5f) * 0.3f * m,
					(Random.nextFloat() - 0.5f) * dp(40f), -dp(30f) - Random.nextFloat() * dp(60f), a + 0.2f + Random.nextFloat() * 1.3f,
					0.6f + Random.nextFloat() * 0.6f, dp(1.5f) + Random.nextFloat() * dp(1.5f), Bit.EMBER, -dp(30f)))
			}
		}
		fun radius(delay: Float, scale: Float): Float {
			val u = b - delay
			if (u <= 0f) return 0f
			return 0.24f * m * scale * easeOut(u / 0.5f) * (1f - easeIn((b - 1.25f) / 0.75f))
		}
		shader.setFloatUniform("origin", impactX, impactY)
		shader.setFloatUniform("spot1", impactX + splash[0][0] * 0.22f * m, impactY + splash[0][1] * 0.18f * m + 0.1f * m)
		shader.setFloatUniform("spot2", impactX + splash[1][0] * 0.22f * m, impactY + splash[1][1] * 0.18f * m + 0.1f * m)
		shader.setFloatUniform("r0", radius(0f, 1f))
		shader.setFloatUniform("r1", radius(0.15f, 0.45f))
		shader.setFloatUniform("r2", radius(0.3f, 0.35f))
		shader.setFloatUniform("scorch", if (b < 0f) 0f else (if (b < 0.1f) b / 0.1f else 1f) * (1f - easeIn((b - 1.6f) / 0.8f)))
		shader.setFloatUniform("heat", if (b < 0f) 0f else exp(-max(0f, b - 0.3f) * 0.9f))
		shader.setFloatUniform("seed", seed)
		shake(a, LOB, LOB + 0.4f, 5f)
	}

	private fun reap(a: Float, w: Float, h: Float) {
		val twist = when {
			a < 0.35f -> 0f
			a < 1.2f -> 2.6f * easeIn((a - 0.35f) / 0.85f)
			a < 1.45f -> 2.6f + sin((a - 1.2f) * 40f) * 0.05f
			a < 1.95f -> { val u = (a - 1.45f) / 0.5f; 2.6f * (1f - u) * cos(1.5f * PI.toFloat() * u) }
			else -> 0f
		} * facing
		val drain = when {
			a < 0.35f -> 0f
			a < 1.2f -> easeOut((a - 0.35f) / 0.85f)
			a < 1.45f -> 1f
			else -> 1f - easeOut((a - 1.45f) / 0.5f)
		}
		if (a >= 1.45f && !flashed) {
			flashed = true
			Sounds.swoosh(1f)
			for (i in 0 until 24) {
				val ang = Random.nextFloat() * 2f * PI.toFloat()
				val sp = dp(160f) + Random.nextFloat() * dp(320f)
				bits.add(Bit(eyeX, eyeY, cos(ang) * sp, sin(ang) * sp, a, 0.35f + Random.nextFloat() * 0.3f,
					dp(1.5f) + Random.nextFloat() * dp(1.5f), Bit.WISP, 0f))
			}
		}
		shader.setFloatUniform("origin", eyeX, eyeY)
		shader.setFloatUniform("twist", twist)
		shader.setFloatUniform("radius", 0.55f * min(w, h))
		shader.setFloatUniform("drain", drain)
		shader.setFloatUniform("flash", if (a < 1.45f) 0f else (1f - (a - 1.45f) / 0.3f).coerceIn(0f, 1f))
		shake(a, 1.45f, 1.75f, 3f)
	}

	// ------------------------------------------------------------ on top: bits and the chain

	private class Bit(val x: Float, val y: Float, val vx: Float, val vy: Float, val born: Float, val life: Float, val size: Float,
	                  val kind: Int, val gravity: Float) {
		val spin = (Random.nextFloat() - 0.5f) * 1400f
		val tint = Random.nextFloat()
		companion object { const val SPARK = 0; const val EMBER = 1; const val GLASS = 2; const val CHUNK = 3; const val SEED = 4; const val WISP = 5 }
	}

	private fun drawBits(canvas: Canvas, a: Float) {
		for (b in bits) {
			val age = a - b.born
			if (age < 0f || age > b.life) continue
			val k = 1f - age / b.life
			val x = b.x + b.vx * age
			val y = b.y + b.vy * age + 0.5f * b.gravity * age * age
			when (b.kind) {
				Bit.SPARK -> {
					// A streak along its velocity, white-hot to orange as it cools.
					val vx = b.vx; val vy = b.vy + b.gravity * age
					val tail = 0.025f
					glow.strokeWidth = b.size
					glow.color = Color.argb((255 * k).toInt(), 255, (150 + 100 * k).toInt(), (60 + 160 * k * k).toInt())
					canvas.drawLine(x - vx * tail, y - vy * tail, x, y, glow)
				}
				Bit.EMBER -> {
					val flick = 0.6f + 0.4f * sin(age * 30f + b.tint * 20f)
					fill.blendMode = BlendMode.PLUS
					fill.color = Color.argb((200 * k * flick).toInt(), 255, (60 + 90 * b.tint).toInt(), 20)
					canvas.drawCircle(x + sin(age * 6f + b.tint * 9f) * dp(4f), y, b.size * (0.6f + 0.4f * k), fill)
					fill.blendMode = null
				}
				Bit.CHUNK -> {
					// A wedge of pumpkin shell, orange outside, pale flesh inside, tumbling.
					canvas.save()
					canvas.rotate(b.spin * age, x, y)
					val s = b.size
					val alpha = (255 * min(1f, k * 2f)).toInt()
					path.reset()
					path.moveTo(x - s, y - s * 0.3f)
					path.quadTo(x, y - s * 1.1f, x + s, y - s * 0.3f)
					path.lineTo(x + s * 0.5f, y + s * 0.5f)
					path.lineTo(x - s * 0.4f, y + s * 0.5f)
					path.close()
					fill.color = Color.argb(alpha, 226, 124, 28)
					canvas.drawPath(path, fill)
					fill.color = Color.argb(alpha, 250, 196, 110)
					canvas.drawRect(x - s * 0.4f, y + s * 0.1f, x + s * 0.5f, y + s * 0.5f, fill)
					canvas.restore()
				}
				Bit.SEED -> {
					canvas.save()
					canvas.rotate(b.spin * age, x, y)
					fill.color = Color.argb((255 * min(1f, k * 2f)).toInt(), 246, 236, 200)
					canvas.drawOval(x - b.size, y - b.size * 0.6f, x + b.size, y + b.size * 0.6f, fill)
					canvas.restore()
				}
				Bit.WISP -> {
					glow.strokeWidth = b.size * 1.6f
					glow.color = Color.argb((220 * k).toInt(), 120, 255, 170)
					canvas.drawLine(x - b.vx * 0.03f, y - b.vy * 0.03f, x, y, glow)
				}
				else -> {
					// A tumbling sliver of glass: a thin triangle catching the light as it turns.
					val r = b.spin * age * DEG
					val s = b.size
					val shine = 0.55f + 0.45f * cos(r * 2f)
					path.reset()
					path.moveTo(x + cos(r) * s, y + sin(r) * s)
					path.lineTo(x + cos(r + 2.3f) * s * 0.6f, y + sin(r + 2.3f) * s * 0.6f)
					path.lineTo(x + cos(r + 3.9f) * s * 0.8f, y + sin(r + 3.9f) * s * 0.8f)
					path.close()
					fill.color = Color.argb((235 * min(1f, k * 2f)).toInt(), (200 + 55 * shine).toInt(), (215 + 40 * shine).toInt(), 255)
					canvas.drawPath(path, fill)
				}
			}
		}
	}

	/** The jack-o'-lantern in flight: spinning, face aglow, a little flame trail behind. */
	private fun drawLob(canvas: Canvas, a: Float) {
		if (a >= LOB) return
		val p = lobAt(a)
		fill.blendMode = BlendMode.PLUS
		for (i in 1..5) {
			val q = lobAt((a - i * 0.025f).coerceAtLeast(0f))
			fill.color = Color.argb(150 - i * 25, 255, 120 + i * 10, 30)
			canvas.drawCircle(q[0], q[1], dp(9f) - i * dp(1.2f), fill)
		}
		fill.blendMode = null
		val r = dp(11f)
		canvas.save()
		canvas.rotate(a * 720f * facing, p[0], p[1])
		fill.color = 0xFF180E08.toInt(); canvas.drawCircle(p[0], p[1], r + dp(1.5f), fill)
		fill.color = 0xFFE27C1C.toInt(); canvas.drawCircle(p[0], p[1], r, fill)
		fill.color = 0xFFB85C10.toInt(); canvas.drawOval(p[0] - r * 0.45f, p[1] - r, p[0] + r * 0.45f, p[1] + r, fill)
		fill.color = 0xFFF09A3C.toInt(); canvas.drawOval(p[0] - r * 0.2f, p[1] - r, p[0] + r * 0.2f, p[1] + r, fill)
		fill.color = 0xFF56782F.toInt(); canvas.drawRect(p[0] - dp(1.5f), p[1] - r - dp(4f), p[0] + dp(1.5f), p[1] - r + dp(1f), fill)
		fill.color = 0xFFFFE070.toInt()
		path.reset()
		for (sx in floatArrayOf(-1f, 1f)) {
			path.moveTo(p[0] + sx * r * 0.55f, p[1] - r * 0.15f)
			path.lineTo(p[0] + sx * r * 0.25f, p[1] - r * 0.15f)
			path.lineTo(p[0] + sx * r * 0.4f, p[1] - r * 0.5f)
			path.close()
		}
		path.moveTo(p[0] - r * 0.6f, p[1] + r * 0.2f)
		path.lineTo(p[0] + r * 0.6f, p[1] + r * 0.2f)
		path.lineTo(p[0] + r * 0.3f, p[1] + r * 0.55f)
		path.lineTo(p[0] - r * 0.3f, p[1] + r * 0.55f)
		path.close()
		canvas.drawPath(path, fill)
		canvas.restore()
	}

	/** Souls drawn into the swirl: green wisps spiralling in from all over the screen, each with a tail. */
	private fun drawSouls(canvas: Canvas, a: Float) {
		val reach = max(width, height) * 0.6f
		fill.blendMode = BlendMode.PLUS
		for (s in souls) {
			val u = (a - (0.3f + s[0] * 0.5f)) / 0.75f
			if (u < 0f || u > 1f) continue
			for (j in 0 until 6) {
				val uj = (u - j * 0.03f).coerceIn(0f, 1f)
				val r = reach * s[2] * 1.6f * (1f - uj * uj)
				val ang = s[1] + uj * 5f * facing
				val alpha = (1f - j / 6f) * min(1f, u * 4f) * (1f - u * u)
				fill.color = Color.argb((210 * alpha).toInt(), 110, 255, 160)
				canvas.drawCircle(eyeX + cos(ang) * r, eyeY + sin(ang) * r, dp(3.5f) * (1f - j * 0.12f) * (0.7f + 0.6f * s[3]), fill)
			}
		}
		fill.blendMode = null
	}

	private fun drawChain(canvas: Canvas, a: Float) {
		val hx = hand?.get(0) ?: ox
		val hy = hand?.get(1) ?: oy
		val reach = 0.25f
		val p = hookPull(a, hx - anchorX, hy - anchorY)
		val tipX: Float
		val tipY: Float
		if (a < reach) {
			val k = easeOut(a / reach)
			tipX = hx + (anchorX - hx) * k
			tipY = hy + (anchorY - hy) * k
		} else {
			tipX = anchorX + p[0] + p[2]
			tipY = anchorY + p[1] + p[3]
		}
		// Taut while hauling, slack while flying out and after letting go.
		val taut = a in 0.35f..1.55f
		val sag = if (taut) dp(2f) else dp(22f)
		val dist = hypot(tipX - hx, tipY - hy)
		val n = max(3, (dist / dp(7f)).toInt())
		var px = hx; var py = hy
		for (i in 1..n) {
			val t = i / n.toFloat()
			val x = hx + (tipX - hx) * t
			val y = hy + (tipY - hy) * t + sin(t * PI.toFloat()) * sag
			val ang = atan2(y - py, x - px) / DEG
			canvas.save()
			canvas.rotate(ang, (x + px) / 2f, (y + py) / 2f)
			val cx = (x + px) / 2f; val cy = (y + py) / 2f
			if (i % 2 == 0) {
				// A link face on: an oval ring.
				line.strokeWidth = dp(3.4f); line.color = 0xFF2A2C34.toInt()
				canvas.drawOval(cx - dp(5f), cy - dp(3f), cx + dp(5f), cy + dp(3f), line)
				line.strokeWidth = dp(1.8f); line.color = 0xFFA9AFBD.toInt()
				canvas.drawOval(cx - dp(5f), cy - dp(3f), cx + dp(5f), cy + dp(3f), line)
				line.strokeWidth = dp(0.8f); line.color = 0xFFE4E8F0.toInt()
				canvas.drawArc(cx - dp(5f), cy - dp(3f), cx + dp(5f), cy + dp(3f), 200f, 80f, false, line)
			} else {
				// A link side on: a bar.
				line.strokeWidth = dp(3.6f); line.color = 0xFF2A2C34.toInt()
				canvas.drawLine(cx - dp(5f), cy, cx + dp(5f), cy, line)
				line.strokeWidth = dp(2f); line.color = 0xFF7D8392.toInt()
				canvas.drawLine(cx - dp(5f), cy, cx + dp(5f), cy, line)
			}
			canvas.restore()
			px = x; py = y
		}
		// The hook: a shank and a J with a barb, facing along the chain.
		val ang = atan2(tipY - hy, tipX - hx) / DEG
		canvas.save()
		canvas.rotate(ang, tipX, tipY)
		path.reset()
		path.moveTo(tipX - dp(4f), tipY)
		path.lineTo(tipX + dp(6f), tipY)
		path.arcTo(tipX + dp(1f), tipY, tipX + dp(11f), tipY + dp(10f), -90f, 180f, false)
		path.lineTo(tipX + dp(3f), tipY + dp(7f))
		line.strokeWidth = dp(4f); line.color = 0xFF2A2C34.toInt()
		canvas.drawPath(path, line)
		line.strokeWidth = dp(2.2f); line.color = 0xFFC3C8D4.toInt()
		canvas.drawPath(path, line)
		canvas.restore()
	}

	private fun finish() {
		if (finished) return
		finished = true
		post { done() }
	}

	override fun onDetachedFromWindow() {
		super.onDetachedFromWindow()
		if (!finished) finish()
	}

	private companion object {
		val DEG = PI.toFloat() / 180f
		/** Seconds the jack-o'-lantern is in the air. */
		const val LOB = 0.45f
		fun now() = SystemClock.uptimeMillis() / 1000f

		const val COMMON = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float t;
uniform float2 shake;

float hash1(float2 q) {
    q = fract(q * float2(123.34, 456.21));
    q += dot(q, q + 45.32);
    return fract(q.x * q.y);
}
float2 hash2(float2 q) {
    float a = hash1(q);
    return float2(a, hash1(q + a + 19.19));
}
float vnoise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash1(float2(i, 3.7)), hash1(float2(i + 1.0, 3.7)), f * f * (3.0 - 2.0 * f));
}
half3 shot(float2 q) {
    return img.eval(clamp(q, float2(0.5), size - 0.5)).rgb;
}
"""

		// The slash: pieces either side of one cut (or four quarters of two) pushed off it and slid along
		// it; between them a rift that burns; on their edges a white-hot rim and a colour split.
		const val CUT = """
uniform float2 origin;
uniform float2 dir1;
uniform float2 dir2;
uniform float crossed;
uniform float gap;
uniform float slide;
uniform float heat;
uniform float sweep1;
uniform float sweep2;
uniform float lineA;

float3 ember(float x) {
    float3 c = mix(float3(0.35, 0.03, 0.0), float3(1.0, 0.42, 0.06), smoothstep(0.0, 0.5, x));
    return mix(c, float3(1.0, 0.93, 0.75), smoothstep(0.6, 1.0, x));
}

float slashLight(float2 p, float2 d, float head) {
    float2 n = float2(-d.y, d.x);
    float s = abs(dot(p - origin, n));
    float u = dot(p - origin, d) / length(size) * 2.0;
    float behind = head - u;
    if (behind < 0.0) return 0.0;
    float core = exp(-s / (1.2 * density)) + 0.45 * exp(-s / (7.0 * density));
    return core * (0.35 + 0.65 * exp(-behind * 1.6));
}

half4 main(float2 p0) {
    float2 p = p0 - shake;
    float2 n1 = float2(-dir1.y, dir1.x);
    float2 n2 = float2(-dir2.y, dir2.x);
    float inside = -1.0;
    float outside = 100000.0;
    float2 q = p;
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        if (fi > 1.5 && crossed < 0.5) continue;
        float s1 = mod(fi, 2.0) < 0.5 ? -1.0 : 1.0;
        float s2 = fi < 1.5 ? -1.0 : 1.0;
        float2 off = crossed > 0.5
            ? (n1 * s1 + n2 * s2) * gap * 0.7 + (dir1 * s1 - dir2 * s2) * slide * 0.5
            : n1 * s1 * gap + dir1 * s1 * slide;
        float2 qq = p - off;
        float a = dot(qq - origin, n1) * s1;
        if (crossed > 0.5) a = min(a, dot(qq - origin, n2) * s2);
        if (a >= 0.0 && inside < 0.0) { inside = a; q = qq; }
        outside = min(outside, -a);
    }
    float3 col;
    if (inside >= 0.0) {
        float ca = 2.5 * density * heat * exp(-inside / (18.0 * density));
        col = float3(shot(q + n1 * ca).r, shot(q).g, shot(q - n1 * ca).b);
        col = mix(col, ember(0.75 + 0.25 * heat), exp(-inside / (1.6 * density)) * heat);
        col += ember(0.4) * exp(-inside / (9.0 * density)) * heat * 0.35;
        col *= 1.0 - 0.3 * exp(-inside / (5.0 * density)) * (1.0 - heat) * step(0.5, gap);
    } else {
        float flick = 0.75 + 0.25 * vnoise(dot(p, dir1) / (14.0 * density) + t * 9.0);
        float g = exp(-outside / (4.0 * density));
        col = float3(0.03, 0.02, 0.05) + ember(g * flick) * g * (0.35 + 0.65 * heat);
    }
    float l = slashLight(p, dir1, sweep1);
    if (crossed > 0.5) l = max(l, slashLight(p, dir2, sweep2));
    col += float3(1.0, 0.86, 0.6) * l * lineA;
    return half4(half3(col), 1.0);
}
"""

		// Three gashes, each a beat behind the last: a jagged lens that opens onto a red glow, with the
		// screen around it pushed back, shadowed and frayed pale at the edge, closing to a red scar.
		const val CLAWS = """
uniform float2 origin;
uniform float2 dir;
uniform float spacing;
uniform float len;
uniform float width;
uniform float open;
uniform float rake;
uniform float heat;
uniform float scar;

half4 main(float2 p0) {
    float2 p = p0 - shake;
    float2 n = float2(-dir.y, dir.x);
    float2 disp = float2(0.0);
    float inGash = -1.0;
    float edgeOut = 100000.0;
    float scarL = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i) - 1.0;
        float L = len * (1.0 - 0.12 * abs(fi));
        float2 c = origin + n * fi * spacing + dir * fi * len * 0.06;
        float u = dot(p - c, dir);
        float v = dot(p - c, n);
        float x = u / (0.5 * L);
        if (abs(x) >= 1.0) continue;
        float drawn = clamp(rake * 1.35 - (fi + 1.0) * 0.12, 0.0, 1.0);
        float along = (x + 1.0) * 0.5;
        if (along > drawn) continue;
        float prof = pow(1.0 - x * x, 0.75);
        float jag = 0.7 + 0.6 * vnoise(u / (3.5 * density) + fi * 13.0);
        float hw = width * open * prof * jag * smoothstep(0.0, 0.12, drawn - along);
        float av = abs(v);
        if (av < hw) {
            inGash = max(inGash, hw - av);
        } else {
            edgeOut = min(edgeOut, av - hw);
            disp += n * sign(v) * hw * exp(-(av - hw) / (16.0 * density));
        }
        scarL = max(scarL, exp(-av / (1.3 * density)) * prof);
    }
    float3 col;
    if (inGash >= 0.0) {
        float g = exp(-inGash / (3.0 * density));
        float flick = 0.8 + 0.2 * vnoise(dot(p, dir) / (9.0 * density) - t * 7.0);
        col = mix(float3(0.06, 0.0, 0.015), float3(1.0, 0.16, 0.04) * flick, g * (0.4 + 0.6 * heat));
        col += float3(1.0, 0.7, 0.4) * exp(-inGash / (0.9 * density)) * heat * 0.6;
    } else {
        col = shot(p - disp);
        float near = exp(-edgeOut / (3.0 * density)) * open;
        col *= 1.0 - 0.55 * near;
        col = mix(col, float3(0.95, 0.9, 0.84), exp(-edgeOut / (0.8 * density)) * open * 0.7);
    }
    col += float3(0.85, 0.08, 0.05) * scarL * scar;
    return half4(half3(col), 1.0);
}
"""

		// Rubber: the point the hook bit is dragged by `pull`, the rest less the further away it is
		// (a little of it moves everywhere). Inverted by fixed-point steps. The hole and its cracks are
		// drawn in the snapshot's own space, so they travel with the stretched screen.
		const val HOOK = """
uniform float2 anchor;
uniform float2 pull;
uniform float radius;
uniform float2 slideAll;
uniform float bite;
uniform float seed;

float reach(float2 q) {
    float2 d = q - anchor;
    return 0.06 + 0.94 * exp(-dot(d, d) / (radius * radius));
}

half4 main(float2 p0) {
    float2 p = p0 - shake - slideAll;
    float2 q = p - pull * reach(p);
    q = p - pull * reach(q);
    q = p - pull * reach(q);
    q = p - pull * reach(q);
    // Past the window's edge the edge pixels smear in (shot clamps), rather than a dark gap.
    float k = reach(q);
    float2 ca = pull * 0.012 * k;
    float3 col = float3(shot(q + ca).r, shot(q).g, shot(q - ca).b);
    float st = clamp(length(pull) / radius * k * 2.0, 0.0, 1.0);
    col = mix(col, col * 1.12 + 0.03, st * 0.5);
    float2 d = q - anchor;
    float r = length(d);
    if (bite > 0.0) {
        float a = (atan(d.y, d.x) / 6.2832 + 0.5) * 7.0;
        float ks = floor(a);
        float f = fract(a) - 0.5 - (hash1(float2(seed, ks)) - 0.5) * 0.5;
        float lenK = (10.0 + 18.0 * hash1(float2(ks, seed))) * density * bite;
        float crack = (1.0 - smoothstep(0.0, 0.07, abs(f))) * (1.0 - smoothstep(lenK * 0.5, lenK, r));
        col = mix(col, float3(0.04, 0.03, 0.05), crack * (0.8 + 0.1 * sin(t * 30.0)));
        col = mix(col, float3(0.02, 0.0, 0.01), (1.0 - smoothstep(2.5 * density, 4.5 * density, r)) * bite);
    }
    return half4(half3(col), 1.0);
}
"""

		// Glass: radial cracks in a warped angle (uneven, wandering, each its own length) with broken rings
		// between them; each shard nudged off the impact and tinted; fine Voronoi cracks only in the crushed
		// middle; a dent of powdered glass; a shockwave ring that bends the screen as it passes.
		const val HORN = """
uniform float2 origin;
uniform float bulge;
uniform float crack;
uniform float shard;
uniform float ring;
uniform float ringA;
uniform float reachPx;
uniform float seed;

float3 voro(float2 x) {
    float2 n = floor(x);
    float2 f = fract(x);
    float2 mg = float2(0.0);
    float2 mr = float2(0.0);
    float md = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            float2 g = float2(float(i), float(j));
            float2 r = g + hash2(n + g) - f;
            float d = dot(r, r);
            if (d < md) { md = d; mr = r; mg = g; }
        }
    }
    md = 8.0;
    for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
            float2 g = mg + float2(float(i), float(j));
            float2 r = g + hash2(n + g) - f;
            float2 dd = r - mr;
            if (dot(dd, dd) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(dd)));
        }
    }
    float2 id = n + mg;
    return float3(md, hash1(id + 7.1), hash1(id + 31.7));
}

float vnoise2(float2 q) {
    float2 i = floor(q);
    float2 f = fract(q);
    float2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i), hash1(i + float2(1.0, 0.0)), u.x), mix(hash1(i + float2(0.0, 1.0)), hash1(i + float2(1.0, 1.0)), u.x), u.y);
}

half4 main(float2 p0) {
    float2 p = p0 - shake;
    float2 v = p - origin;
    float r = length(v);
    float2 dirv = r > 0.5 ? v / r : float2(0.0, 1.0);
    float2 perp = float2(-dirv.y, dirv.x);
    float2 disp = dirv * bulge * exp(-(r * r) / (reachPx * reachPx * 0.35));
    float rr = r - ring;
    float ringK = (1.0 - smoothstep(0.0, 16.0 * density, abs(rr))) * ringA;
    disp += dirv * sin(rr / (16.0 * density) * 3.1416) * 5.0 * density * ringK;

    // Radial cracks: N uneven sectors in a warped angle, wandering as they run out.
    float N = 11.0;
    float an = atan(v.y, v.x) / 6.2832 + 0.5;
    float aw = an + 0.3 / N * sin(an * 12.566 + seed) + 0.5 / N * (vnoise2(float2(an * N * 0.8, r / (14.0 * density)) + seed) - 0.5);
    float sN = aw * N;
    float s = floor(sN);
    float fs = fract(sN);
    float sw = mod(s, N);
    float kb = mod(fs < 0.5 ? s : s + 1.0, N);
    float dA = min(fs, 1.0 - fs) / N * 6.2832 * max(r, 1.0);
    float cw = 1.0 * density;
    float lenK = reachPx * (0.45 + 0.55 * hash1(float2(kb, seed)));
    float alongK = 1.0 - smoothstep(lenK * 0.75, lenK, r);
    float radial = (1.0 - smoothstep(cw * 0.5, cw * 1.5, dA)) * alongK;
    float lit = (smoothstep(cw * 1.2, cw * 1.8, dA) - smoothstep(cw * 2.2, cw * 3.2, dA)) * step(fs, 0.5) * alongK;

    // Broken rings between them: up to three per sector, each at its own radius, some missing.
    float ringIdx = 0.0;
    float ringD = 100000.0;
    for (int j = 0; j < 3; j++) {
        float fj = float(j);
        float Rj = reachPx * (0.16 + 0.2 * fj + 0.05 * fj * fj) * (0.85 + 0.3 * hash1(float2(sw, fj + seed)));
        if (hash1(float2(sw + 3.1, fj * 7.0 + seed)) > 0.35) ringD = min(ringD, abs(r - Rj));
        ringIdx += step(Rj, r);
    }
    float m = 1.0 - smoothstep(reachPx * 0.6, reachPx, r);
    float rings = (1.0 - smoothstep(cw * 0.5, cw * 1.5, ringD)) * m;

    // Each shard (sector x ring band) is nudged off the impact and tilted to catch the light.
    float h1 = hash1(float2(sw, ringIdx + seed));
    float h2 = hash1(float2(ringIdx + 5.3, sw + seed));
    float on = m * shard;
    disp += (dirv * (0.5 + h1) * 3.0 + perp * (h2 - 0.5) * 2.5) * density * on;

    // Crushed glass right at the impact.
    float crushK = 1.0 - smoothstep(reachPx * 0.07, reachPx * 0.13, r);
    float3 vo = voro(v / (5.0 * density) + seed);
    float crushed = (1.0 - smoothstep(cw * 0.4 / (5.0 * density), cw * 1.2 / (5.0 * density), vo.x)) * crushK;
    disp += (vo.yz - 0.5) * 2.0 * density * crushK * shard;

    float lines = max(max(radial, rings), crushed) * crack;
    float3 col = shot(p - disp);
    col *= 1.0 + (h1 - 0.5) * 0.25 * on;
    col += float3(0.9, 0.95, 1.0) * 0.08 * h2 * on;
    col = mix(col, float3(0.05, 0.05, 0.08), lines * 0.9);
    col += float3(0.85, 0.9, 1.0) * lit * (1.0 - lines) * crack * 0.45;
    float dent = 1.0 - smoothstep(3.0 * density, 7.0 * density, r);
    col = mix(col, float3(0.92, 0.94, 1.0) * (0.75 + 0.25 * hash1(floor(p / density))), dent * crack);
    col += float3(1.0) * ringK * (0.1 + 0.04 * sin(t * 40.0));
    return half4(half3(col), 1.0);
}
"""

		// Three cuts (a beat apart). Each pixel tries the eight pieces the three lines make, each moved
		// by the sum of its sides' offsets, and shows the first one it really lies in; else the rift.
		const val FLURRY = """
uniform float2 o0;
uniform float2 o1;
uniform float2 o2;
uniform float2 d0;
uniform float2 d1;
uniform float2 d2;
uniform float2 v0;
uniform float2 v1;
uniform float2 v2;
uniform float sw0;
uniform float sw1;
uniform float sw2;
uniform float la0;
uniform float la1;
uniform float la2;
uniform float heat;

float3 ember(float x) {
    float3 c = mix(float3(0.35, 0.03, 0.0), float3(1.0, 0.42, 0.06), smoothstep(0.0, 0.5, x));
    return mix(c, float3(1.0, 0.93, 0.75), smoothstep(0.6, 1.0, x));
}

float slashLight(float2 p, float2 o, float2 d, float head) {
    float2 n = float2(-d.y, d.x);
    float s = abs(dot(p - o, n));
    float u = dot(p - o, d) / length(size) * 2.0;
    float behind = head - u;
    if (behind < 0.0) return 0.0;
    float core = exp(-s / (1.2 * density)) + 0.45 * exp(-s / (7.0 * density));
    return core * (0.35 + 0.65 * exp(-behind * 1.6));
}

half4 main(float2 p0) {
    float2 p = p0 - shake;
    float2 n0 = float2(-d0.y, d0.x);
    float2 n1 = float2(-d1.y, d1.x);
    float2 n2 = float2(-d2.y, d2.x);
    float inside = -1.0;
    float outside = 100000.0;
    float2 q = p;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float s0 = mod(fi, 2.0) < 0.5 ? -1.0 : 1.0;
        float s1 = mod(floor(fi / 2.0), 2.0) < 0.5 ? -1.0 : 1.0;
        float s2 = fi < 3.5 ? -1.0 : 1.0;
        float2 qq = p - (v0 * s0 + v1 * s1 + v2 * s2) * 0.6;
        float a = min(min(dot(qq - o0, n0) * s0, dot(qq - o1, n1) * s1), dot(qq - o2, n2) * s2);
        if (a >= 0.0 && inside < 0.0) { inside = a; q = qq; }
        outside = min(outside, -a);
    }
    float3 col;
    if (inside >= 0.0) {
        float ca = 2.0 * density * heat * exp(-inside / (18.0 * density));
        col = float3(shot(q + float2(ca, 0.0)).r, shot(q).g, shot(q - float2(ca, 0.0)).b);
        col = mix(col, ember(0.75 + 0.25 * heat), exp(-inside / (1.6 * density)) * heat);
        col += ember(0.4) * exp(-inside / (9.0 * density)) * heat * 0.35;
    } else {
        float flick = 0.75 + 0.25 * vnoise(dot(p, d0) / (14.0 * density) + t * 9.0);
        float g = exp(-outside / (4.0 * density));
        col = float3(0.03, 0.02, 0.05) + ember(g * flick) * g * (0.35 + 0.65 * heat);
    }
    float l = slashLight(p, o0, d0, sw0) * la0;
    l = max(l, slashLight(p, o1, d1, sw1) * la1);
    l = max(l, slashLight(p, o2, d2, sw2) * la2);
    col += float3(1.0, 0.86, 0.6) * l;
    return half4(half3(col), 1.0);
}
"""

		// Burn-through: a noisy distance field from three fires (the hit and two splashes). Inside, a
		// hole full of flames; on the edge, a glowing rim; around it, a scorch from brown to black with a
		// few live embers; heat haze over the scorch.
		const val PUMPKIN = """
uniform float2 origin;
uniform float2 spot1;
uniform float2 spot2;
uniform float r0;
uniform float r1;
uniform float r2;
uniform float scorch;
uniform float heat;
uniform float seed;

float vnoise2(float2 q) {
    float2 i = floor(q);
    float2 f = fract(q);
    float2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i), hash1(i + float2(1.0, 0.0)), u.x), mix(hash1(i + float2(0.0, 1.0)), hash1(i + float2(1.0, 1.0)), u.x), u.y);
}
float fbm(float2 q) {
    return 0.55 * vnoise2(q) + 0.3 * vnoise2(q * 2.1 + 3.7) + 0.15 * vnoise2(q * 4.3 + 9.1);
}
float burnF(float2 p, float2 c, float r, float n) {
    if (r < 0.5) return 9.0;
    return length(p - c) / r + (n - 0.5) * 0.7;
}
float3 fire(float x) {
    float3 c = mix(float3(0.3, 0.02, 0.0), float3(1.0, 0.38, 0.04), smoothstep(0.0, 0.5, x));
    return mix(c, float3(1.0, 0.9, 0.55), smoothstep(0.65, 1.0, x));
}

half4 main(float2 p0) {
    float2 p = p0 - shake;
    float n = fbm(p / (26.0 * density) + seed);
    float f = min(min(burnF(p, origin, r0, n), burnF(p, spot1, r1, n)), burnF(p, spot2, r2, n));
    float haze = heat * step(1.0, f) * exp(-max(f - 1.0, 0.0) * 3.0);
    float2 disp = float2(sin(p.y / (6.0 * density) + t * 12.0) * 1.5, cos(p.x / (7.0 * density) + t * 9.0) * 1.2) * density * haze;
    float3 col = shot(p + disp);
    float sk = (1.0 - smoothstep(1.0, 1.45, f)) * scorch;
    float3 burnt = mix(float3(0.25, 0.14, 0.06), float3(0.03, 0.02, 0.02), 1.0 - smoothstep(1.0, 1.35, f));
    col = mix(col, burnt, sk * 0.85);
    float2 cell = floor(p / (6.0 * density));
    float live = step(0.965, hash1(cell + seed)) * sk * (0.5 + 0.5 * sin(t * 9.0 + hash1(cell) * 30.0));
    col += float3(1.0, 0.45, 0.1) * live;
    if (f < 1.0) {
        float inner = 1.0 - f;
        float fl = fbm(float2(p.x / (14.0 * density), p.y / (14.0 * density) + t * 2.5) + seed);
        float g = exp(-inner * 6.0);
        col = float3(0.03, 0.01, 0.015) + fire(clamp(g * 1.1 + fl * 0.35 * (1.0 - inner), 0.0, 1.0)) * (g * 0.9 + fl * 0.25) * (0.5 + 0.5 * heat);
    }
    col += float3(1.0, 0.55, 0.15) * exp(-abs(f - 1.0) * 18.0) * (0.3 + 0.7 * heat) * step(f, 8.0);
    return half4(half3(col), 1.0);
}
"""

		// The reaping: a twist that is strongest at the eye and fades outward, pulling in slightly; the
		// colour drains to a ghostly green, the outskirts darken, spiral streaks turn, the eye glows.
		const val REAP = """
uniform float2 origin;
uniform float twist;
uniform float radius;
uniform float drain;
uniform float flash;

half4 main(float2 p0) {
    float2 p = p0 - shake;
    float2 v = p - origin;
    float r = length(v);
    float k = exp(-(r * r) / (radius * radius));
    float a = twist * k;
    float c = cos(a);
    float s = sin(a);
    float2 q = origin + float2(c * v.x + s * v.y, -s * v.x + c * v.y) * (1.0 - 0.12 * drain * k);
    float2 tang = r > 0.5 ? float2(-v.y, v.x) / r : float2(0.0);
    float2 ca = tang * 2.0 * density * drain * k;
    float3 col = float3(shot(q + ca).r, shot(q).g, shot(q - ca).b);
    float lum = dot(col, float3(0.3, 0.59, 0.11));
    float3 ghost = float3(0.3, 1.0, 0.6) * lum * 1.15 + float3(0.0, 0.05, 0.03);
    col = mix(col, ghost, drain * (0.35 + 0.65 * k));
    col *= 1.0 - 0.35 * drain * (1.0 - k);
    float spiral = pow(0.5 + 0.5 * sin(atan(v.y, v.x) * 5.0 - r / (12.0 * density) * sign(twist + 0.0001) + t * 6.0), 8.0);
    col += float3(0.4, 1.0, 0.6) * drain * k * 0.15 * spiral;
    col += float3(0.5, 1.0, 0.7) * exp(-r / (30.0 * density)) * drain * 0.8;
    col += float3(0.7, 1.0, 0.8) * flash * (0.25 + 0.5 * exp(-r / (80.0 * density)));
    return half4(half3(col), 1.0);
}
"""
	}
}
