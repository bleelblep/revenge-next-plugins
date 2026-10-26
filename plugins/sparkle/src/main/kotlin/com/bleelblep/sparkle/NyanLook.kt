package com.bleelblep.sparkle

import android.graphics.Bitmap

/**
 * Nyan Cat as the pet, built in code from the real frames' parts (NyanData.kt, made by
 * tools/nyan_parts.py from art/nyancat.svg): tail, four legs, the pop-tart body, head, cheeks and
 * eyes, separately, for each of the six flying frames. Moods are poses of those parts -- tucked
 * legs, closed or squinting eyes, a drooped head, little pixel icons -- so nothing is hand-drawn.
 *
 * Frames are rendered at one art pixel per bitmap pixel and cached; PetView scales them up with hard
 * edges. The cat faces right and is mirrored when walking left.
 *
 * Nyan Cat (c) Chris Torres. Frames from iliana/html5nyancat via Gowee/nyancat-svg. Local use only.
 */
internal object NyanLook : Look {
	override val hasMotionPoses = true
	override val timedShake = true
	/** Room round the 34 x 21 cat for icons above its head and a lifted body. */
	private const val OX = 3
	private const val OY = 7
	override val cellW = NyanData.W + 6
	override val cellH = NyanData.H + OY + 2
	override val refW = NyanData.W.toFloat()

	override fun directional(anim: Anim) = true

	// Colours from the art, plus the icons'.
	private const val BLACK = 0xFF000000.toInt()
	private const val GREY = 0xFF999999.toInt()
	private const val WHITE = 0xFFFFFFFF.toInt()
	private const val CHEEK = 0xFFFF9999.toInt()
	private const val RED = 0xFFFF3366.toInt()
	private const val YELLOW = 0xFFFFDD33.toInt()
	private const val GREEN = 0xFF66DD66.toInt()

	private enum class Legs { FLY, TUCK, SPREAD }
	private enum class Eyes { OPEN, CLOSED, HAPPY, BIG, DIZZY, SAD, BACK, SHADES }
	private enum class Icon { NONE, HEART, ALERT, MAIL, MUSIC, BOLT, BATTERY }

	private data class Pose(
		val src: Int = 0,
		val legs: Legs = Legs.FLY,
		val tail: Int = src,
		val bodyDy: Int = 0,
		val headDx: Int = 0,
		val headDy: Int = 0,
		val eyes: Eyes = Eyes.OPEN,
		val blush: Boolean = false,
		val mouth: Boolean = false,
		val icon: Icon = Icon.NONE,
		/** -1 = none, else which twinkle pattern. */
		val sparkles: Int = -1,
		/** -1 = none, else how high the z's have floated. */
		val zs: Int = -1,
		/** Asleep, curled up: legs tucked away, head sunk onto the pop-tart, tail wrapped under. */
		val curled: Boolean = false,
		/** Blowing: 0 = no, 1 = cheeks puffing, 2 = cheeks full. */
		val puff: Int = 0,
	)

	private val cache = HashMap<Pose, Bitmap>()

	override val blowReleases: List<BlowRelease> by lazy {
		// From the mouth, at the same frames the unicorn lets its bubbles go.
		val (mx, my) = mouthAt(Pose())
		listOf(
			BlowRelease(6, mx + 2.5f, my, 9f, 0),
			BlowRelease(10, mx + 2.5f, my, 8f, 2),
			BlowRelease(12, mx + 2.5f, my, 6f, 5),
		)
	}

	override fun frame(anim: Anim, seconds: Float, still: Int): Bitmap? =
		runCatching {
			val p = pose(anim, seconds, still)
			cache.getOrPut(p) { render(p) }
		}.getOrNull()

	private fun fly(seconds: Float, fps: Float) = (seconds * fps).toInt().mod(6)

	/** Blinks for a moment every few seconds. */
	private fun blink(seconds: Float, eyes: Eyes = Eyes.OPEN) =
		if ((seconds % 3.7f) > 3.55f) Eyes.CLOSED else eyes

	private fun pose(anim: Anim, s: Float, still: Int): Pose = when (anim) {
		Anim.WALK, Anim.JUMP, Anim.OUTRO -> Pose(src = fly(s, 12f), eyes = blink(s))
		Anim.SPIN -> Pose(src = fly(s, 14f), eyes = Eyes.BIG)
		Anim.IDLE, Anim.HANG -> Pose(src = fly(s, 6f), eyes = blink(s))
		Anim.HAPPY -> Pose(src = fly(s, 12f), eyes = Eyes.HAPPY, blush = true, sparkles = (s * 5f).toInt() % 3)
		Anim.SLEEP -> Pose(
			curled = true, bodyDy = if ((s * 1.25f).toInt() % 2 == 0) 0 else 1,
			eyes = Eyes.CLOSED, zs = (s * 2.5f).toInt() % 3,
		)
		Anim.SURPRISED, Anim.SHAKE -> Pose(src = 4, legs = Legs.SPREAD, bodyDy = -1, eyes = Eyes.BIG)
		Anim.SAD -> Pose(legs = Legs.TUCK, tail = 3, headDy = 1, eyes = Eyes.SAD)
		Anim.DIZZY -> Pose(src = fly(s, 8f), headDx = if ((s * 6f).toInt() % 2 == 0) -1 else 1, eyes = Eyes.DIZZY)
		Anim.REACTION -> Pose(
			src = fly(s, 6f), eyes = blink(s), blush = still == 0,
			icon = when (still) { 0 -> Icon.HEART; 1 -> Icon.ALERT; 2 -> Icon.MAIL; else -> Icon.MUSIC },
		)
		Anim.CHARGING -> Pose(legs = Legs.TUCK, eyes = Eyes.HAPPY, icon = if ((s * 2f).toInt() % 2 == 0) Icon.BOLT else Icon.NONE)
		Anim.LOW_BATTERY -> Pose(legs = Legs.TUCK, tail = 3, headDy = 1, eyes = if ((s * 1.5f).toInt() % 2 == 0) Eyes.CLOSED else Eyes.SAD, icon = Icon.BATTERY)
		Anim.VARIANT -> when (still) {
			1 -> Pose(src = fly(s, 6f), eyes = Eyes.HAPPY, blush = true, icon = Icon.HEART)
			2 -> Pose(src = fly(s, 6f), eyes = blink(s), sparkles = (s * 5f).toInt() % 3)
			3 -> Pose(src = fly(s, 6f), eyes = Eyes.SHADES)
			else -> Pose(src = fly(s, 6f), eyes = blink(s))
		}
		Anim.BLOW -> {
			// Before each puff leaves, the cheeks fill (two frames), then the mouth pops open with a
			// little forward nod, on the frame the puff is released.
			val f = (s * Anim.BLOW.fps).toInt()
			val releases = blowReleases.map { it.frame }
			when {
				f in releases -> Pose(legs = Legs.TUCK, eyes = Eyes.HAPPY, mouth = true, headDx = 1)
				(f + 1) in releases -> Pose(legs = Legs.TUCK, eyes = Eyes.CLOSED, puff = 2)
				(f + 2) in releases -> Pose(legs = Legs.TUCK, eyes = Eyes.CLOSED, puff = 1)
				f > (releases.maxOrNull() ?: 0) -> Pose(legs = Legs.TUCK, eyes = Eyes.HAPPY, blush = true, sparkles = f % 3)
				else -> Pose(legs = Legs.TUCK, eyes = Eyes.HAPPY)
			}
		}
		Anim.LOOK -> {
			// Keep Nyan's glance timing independent of the unicorn's longer turn strip.
			val f = (s * 6f).toInt()
			Pose(legs = Legs.TUCK, eyes = if (f in 1..3) Eyes.BACK else Eyes.OPEN, headDx = if (f in 1..3) -1 else 0)
		}
	}

	// ------------------------------------------------------------------------------------------
	// Rendering
	// ------------------------------------------------------------------------------------------

	private fun part(frame: Int, name: String): IntArray =
		NyanData.frames[frame.coerceIn(0, NyanData.frames.size - 1)][NyanData.parts.indexOf(name)]

	private class Canvas1x(val w: Int, val h: Int) {
		val px = IntArray(w * h)
		fun set(x: Int, y: Int, c: Int) {
			if (x in 0 until w && y in 0 until h) px[y * w + x] = c
		}
		fun get(x: Int, y: Int) = if (x in 0 until w && y in 0 until h) px[y * w + x] else 0
	}

	private fun draw(c: Canvas1x, packed: IntArray, dx: Int, dy: Int, recolour: ((Int) -> Int)? = null) {
		for (p in packed) {
			val x = p ushr 16
			val y = (p ushr 8) and 0xFF
			val colour = NyanData.palette[p and 0xFF]
			c.set(OX + x + dx, OY + y + dy, recolour?.invoke(colour) ?: colour)
		}
	}

	/** Top-left of a 2 x 2 eye part, in cell pixels after the head's offset. */
	private fun eyeAt(packed: IntArray, pose: Pose): Pair<Int, Int> {
		var mx = Int.MAX_VALUE
		var my = Int.MAX_VALUE
		for (p in packed) {
			mx = minOf(mx, p ushr 16)
			my = minOf(my, (p ushr 8) and 0xFF)
		}
		return (OX + mx + pose.headDx) to (OY + my + pose.headDy + pose.bodyDy)
	}

	/** Where the mouth is, in cell pixels: under and between the eyes. */
	private fun mouthAt(pose: Pose): Pair<Float, Float> {
		val (lx, ly) = eyeAt(part(pose.src, "eyeL"), pose)
		val (rx, _) = eyeAt(part(pose.src, "eyeR"), pose)
		return ((lx + rx) / 2f + 1f) to (ly + 3.5f)
	}

	private fun render(pose: Pose): Bitmap = if (pose.curled) renderCurled(pose) else renderPose(pose)

	/**
	 * Asleep, curled up like a loaf: the pop-tart rests a pixel lower (breathing a pixel more), the
	 * legs are tucked away out of sight, the tail wraps forward along the bottom, and the head sinks
	 * onto the front with its chin down. Prototyped in tools/preview_nyan_poses.py.
	 */
	private fun renderCurled(pose: Pose): Bitmap {
		val c = Canvas1x(cellW, cellH)
		val by = 1 + pose.bodyDy
		val body = part(0, "body")
		draw(c, body, 0, by)
		var bx0 = Int.MAX_VALUE
		var by1 = Int.MIN_VALUE
		for (p in body) {
			bx0 = minOf(bx0, OX + (p ushr 16))
			by1 = maxOf(by1, OY + ((p ushr 8) and 0xFF) + by)
		}
		// The tail, wrapped round the bottom of the pop-tart: a grey band with an outline.
		val ty = by1 + 1
		for (x in bx0 + 1 until bx0 + 13) {
			c.set(x, ty - 1, if (x == bx0 + 1) BLACK else GREY)
			c.set(x, ty, GREY)
			c.set(x, ty + 1, BLACK)
		}
		c.set(bx0 + 13, ty - 1, BLACK)
		c.set(bx0 + 13, ty, BLACK)
		c.set(bx0, ty, BLACK)
		val head = pose.copy(curled = false, headDx = -1, headDy = 2, bodyDy = by)
		draw(c, part(0, "head"), -1, by + 2)
		draw(c, part(0, "cheekL"), -1, by + 2)
		draw(c, part(0, "cheekR"), -1, by + 2)
		eyes(c, head.copy(bodyDy = 0, headDy = by + 2))
		if (pose.zs >= 0) zs(c, head.copy(bodyDy = 0, headDy = by + 2))
		return Bitmap.createBitmap(c.px, cellW, cellH, Bitmap.Config.ARGB_8888)
	}

	private fun renderPose(pose: Pose): Bitmap {
		val c = Canvas1x(cellW, cellH)
		val by = pose.bodyDy

		// Tail and legs first: the body covers their tops.
		draw(c, part(pose.tail, "tail"), 0, by)
		val legFrame = when (pose.legs) {
			Legs.FLY -> pose.src
			Legs.TUCK -> 0
			Legs.SPREAD -> 4
		}
		val legDy = if (pose.legs == Legs.TUCK) -2 else 0
		for (i in 1..4) {
			val spread = if (pose.legs == Legs.SPREAD) (if (i <= 2) -1 else 1) else 0
			draw(c, part(legFrame, "leg$i"), spread, by + legDy)
		}
		draw(c, part(pose.src, "body"), 0, by)

		val hx = pose.headDx
		val hy = by + pose.headDy
		draw(c, part(pose.src, "head"), hx, hy)
		draw(c, part(pose.src, "cheekL"), hx, hy)
		draw(c, part(pose.src, "cheekR"), hx, hy)
		if (pose.puff > 0) puffCheeks(c, pose)
		if (pose.blush) {
			// A pixel more blush beside each cheek.
			for (name in listOf("cheekL", "cheekR")) {
				val (cx, cy) = eyeAt(part(pose.src, name), pose)
				c.set(cx - 1, cy, CHEEK)
				c.set(cx + 2, cy, CHEEK)
			}
		}
		eyes(c, pose)
		if (pose.mouth) {
			val (mx, my) = mouthAt(pose)
			val x = mx.toInt()
			val y = my.toInt()
			c.set(x, y, BLACK); c.set(x + 1, y, BLACK)
			c.set(x, y + 1, BLACK); c.set(x + 1, y + 1, BLACK)
		}
		if (pose.icon != Icon.NONE) icon(c, pose)
		if (pose.zs >= 0) zs(c, pose)
		if (pose.sparkles >= 0) sparkles(c, pose.sparkles)

		return Bitmap.createBitmap(c.px, cellW, cellH, Bitmap.Config.ARGB_8888)
	}

	private fun eyes(c: Canvas1x, pose: Pose) {
		val spots = listOf("eyeL", "eyeR").map { eyeAt(part(pose.src, it), pose) }
		when (pose.eyes) {
			Eyes.OPEN -> {
				draw(c, part(pose.src, "eyeL"), pose.headDx, pose.bodyDy + pose.headDy)
				draw(c, part(pose.src, "eyeR"), pose.headDx, pose.bodyDy + pose.headDy)
			}
			Eyes.CLOSED -> for ((x, y) in spots) {
				fill(c, x, y, 2, 2, GREY)
				c.set(x, y + 1, BLACK); c.set(x + 1, y + 1, BLACK)
			}
			Eyes.HAPPY -> for ((x, y) in spots) {
				// ^ ^
				fill(c, x, y, 2, 2, GREY)
				c.set(x, y + 1, BLACK); c.set(x + 1, y, BLACK); c.set(x + 2, y + 1, BLACK)
			}
			Eyes.BIG -> for ((x, y) in spots) {
				fill(c, x, y - 1, 3, 3, BLACK)
				c.set(x, y - 1, WHITE)
			}
			Eyes.DIZZY -> for ((x, y) in spots) {
				fill(c, x, y - 1, 3, 3, GREY)
				c.set(x, y - 1, BLACK); c.set(x + 2, y - 1, BLACK); c.set(x + 1, y, BLACK)
				c.set(x, y + 1, BLACK); c.set(x + 2, y + 1, BLACK)
			}
			Eyes.SAD -> for ((x, y) in spots) {
				fill(c, x, y, 2, 2, BLACK)
				c.set(x, y + 1, WHITE)
				c.set(x - 1, y - 1, BLACK) // a worried brow
			}
			Eyes.BACK -> for ((x, y) in spots) {
				fill(c, x, y, 2, 2, BLACK)
				c.set(x, y, WHITE) // looking the other way
			}
			Eyes.SHADES -> {
				val (lx, ly) = spots[0]
				val (rx, _) = spots[1]
				fill(c, lx - 1, ly, rx - lx + 4, 2, BLACK)
				c.set(lx, ly, WHITE)
				c.set(rx, ly, WHITE)
			}
		}
	}

	/** Blowing: the head bulges [Pose.puff] pixels each side at cheek height, cheeks spread with it. */
	private fun puffCheeks(c: Canvas1x, pose: Pose) {
		val head = part(pose.src, "head")
		var x0 = Int.MAX_VALUE
		var x1 = Int.MIN_VALUE
		for (p in head) {
			x0 = minOf(x0, OX + (p ushr 16) + pose.headDx)
			x1 = maxOf(x1, OX + (p ushr 16) + pose.headDx)
		}
		val (lx, ly) = eyeAt(part(pose.src, "cheekL"), pose)
		val (rx, _) = eyeAt(part(pose.src, "cheekR"), pose)
		val grow = pose.puff
		for (yy in ly - 1..ly + 1) {
			for (g in 1..grow) {
				c.set(x0 - g + 1, yy, GREY)
				c.set(x1 + g - 1, yy, GREY)
			}
			c.set(x0 - grow, yy, BLACK)
			c.set(x1 + grow, yy, BLACK)
		}
		// The cheeks spread outward a pixel.
		fill(c, lx - 1, ly, 3, 2, CHEEK)
		fill(c, rx, ly, 3, 2, CHEEK)
	}

	private fun fill(c: Canvas1x, x: Int, y: Int, w: Int, h: Int, colour: Int) {
		for (j in 0 until h) for (i in 0 until w) c.set(x + i, y + j, colour)
	}

	private fun stamp(c: Canvas1x, x: Int, y: Int, rows: List<String>, colours: Map<Char, Int>) {
		for ((j, row) in rows.withIndex()) for ((i, ch) in row.withIndex()) {
			colours[ch]?.let { c.set(x + i, y + j, it) }
		}
	}

	/** Above the head, a little to the right. */
	private fun icon(c: Canvas1x, pose: Pose) {
		val (rx, ry) = eyeAt(part(pose.src, "eyeR"), pose)
		val x = rx - 1
		val y = maxOf(0, ry - 11)
		val k = BLACK
		when (pose.icon) {
			Icon.HEART -> stamp(c, x, y, listOf(".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."), mapOf('r' to RED))
			Icon.ALERT -> stamp(c, x + 1, y, listOf("kyk", "kyk", "kyk", ".k.", "kyk"), mapOf('y' to YELLOW, 'k' to k))
			Icon.MAIL -> stamp(c, x - 1, y, listOf("kkkkkkk", "kwkwkwk", "kwwkwwk", "kwwwwwk", "kkkkkkk"), mapOf('w' to WHITE, 'k' to k))
			Icon.MUSIC -> stamp(c, x, y, listOf(".kkk", ".k.k", ".k.k", "kk.k", "kkkk"), mapOf('k' to WHITE))
			Icon.BOLT -> stamp(c, x, y, listOf("..yy", ".yy.", "yyyy", ".yy.", "yy.."), mapOf('y' to YELLOW))
			Icon.BATTERY -> stamp(c, x - 1, y + 1, listOf("kkkkkk.", "krwwwkk", "krwwwkk", "kkkkkk."), mapOf('k' to WHITE, 'r' to RED, 'w' to 0))
			Icon.NONE -> {}
		}
	}

	/** z's rising from the head, a step higher each phase. */
	private fun zs(c: Canvas1x, pose: Pose) {
		val (rx, ry) = eyeAt(part(pose.src, "eyeR"), pose)
		val z = listOf("www", ".w.", "www")
		for (k in 0..pose.zs) {
			stamp(c, rx + 2 + k * 2, ry - 6 - k * 3, z, mapOf('w' to WHITE))
		}
	}

	/** Twinkling pixel stars round the cat. */
	private fun sparkles(c: Canvas1x, phase: Int) {
		val spots = listOf(1 to 2, cellW - 3 to 4, 2 to cellH - 6, cellW - 2 to cellH - 8, cellW / 2 to 1)
		for ((i, s) in spots.withIndex()) {
			val (x, y) = s
			when ((i + phase) % 3) {
				0 -> c.set(x, y, WHITE)
				1 -> { c.set(x, y, WHITE); c.set(x - 1, y, WHITE); c.set(x + 1, y, WHITE); c.set(x, y - 1, WHITE); c.set(x, y + 1, WHITE) }
				else -> {}
			}
		}
	}
}
