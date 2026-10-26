package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.Base64

/**
 * The sheet-based pets: LuizMelo's cats and dogs (CC0, built by tools/build_pets.py into PetData.kt)
	 * and seasonal pets (legacy open assets and purchased ToffeeCraft artwork).
 * Each pet is cropped to one box for all its animations, so it never shifts between poses; here every
 * frame gets a little room round it ([PAD_TOP], [PAD_SIDE]) for the things drawn on top: z's,
 * reaction icons, dizzy stars, sparkles.
 *
 * Shimeji's moods map onto the pack's animations (idle, walk, run, meow/bark, lying down, itch,
 * sleeping, sitting, licking, stretching); a pet missing one falls back along [FALLBACKS].
 *
 * The animals face right and are mirrored walking left. Sizes are kept in proportion within a kind:
 * the size setting measures the ginger cat for cats and the Golden Retriever for dogs, so a Great
 * Dane stays bigger than an Akita.
 */
/** The data any sheet-based pet needs: the cats, the dogs and the seasonal holiday pets. */
internal interface SheetPet {
	val id: String
	val name: String
	val w: Int
	val h: Int
	val strips: Map<String, Pair<Int, Array<String>>>
	val mouth: FloatArray? get() = null
	/** Cell pixels the size setting measures: the whole cell unless the pet's art needs room round it. */
	val refW: Int get() = w
	/** How fast the idle strip plays; the boss pets breathe slowly. */
	val idleFps: Float get() = 8f
}

internal class SheetLook(private val pet: SheetPet, val kind: Looks.Kind) : Look {
	override val cellW = pet.w + PAD_SIDE * 2
	override val cellH = pet.h + PAD_TOP + PAD_BOTTOM
	override val refW = when (kind) {
		Looks.Kind.DOG -> DOG_REF_W
		// Each seasonal pet's own width: most are built exactly 48 wide, but a pet scaled by a whole
		// number to keep its pixels even (build_seasonal.INTEGER_SCALE) can come out a little wider.
		Looks.Kind.SEASONAL -> pet.refW.toFloat()
		else -> CAT_REF_W
	}

	override fun directional(anim: Anim) = true

	val name get() = pet.name
	private val revisedSeasonal = kind == Looks.Kind.SEASONAL && pet.strips.containsKey("rest")
	override val timedShake get() = revisedSeasonal
	val idleFps: Float get() = if (revisedSeasonal && (pet.id.startsWith("chicken_") || pet.id == "chick")) 3f else pet.idleFps
	val idleFrameCount: Int get() = pet.strips["idle"]?.first ?: 1

	private val strips = HashMap<String, List<Bitmap>>()
	private val cache = HashMap<String, Bitmap>()

	private fun strip(name: String): List<Bitmap> = strips.getOrPut(name) {
		runCatching {
			val (count, chunks) = pet.strips.getValue(name)
			val bytes = Base64.decode(chunks.joinToString(""), Base64.DEFAULT)
			val sheet = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
			List(count) { i -> Bitmap.createBitmap(sheet, i * pet.w, 0, pet.w, pet.h) }
		}.getOrDefault(emptyList())
	}

	/** [name], or the first fallback this pet has. */
	private fun frames(name: String): Pair<String, List<Bitmap>> {
		for (n in listOf(name) + FALLBACKS[name].orEmpty()) {
			val f = strip(n)
			if (f.isNotEmpty()) return n to f
		}
		return "idle" to strip("idle")
	}

	private enum class Over { NONE, ZS, HEART, ALERT, MAIL, MUSIC, BOLT, BATTERY, DIZZY, SPARKLES }

	/** Which strip, how fast, whether it loops (else holds the last frame), and what goes on top. */
	private class Pick(val strip: String, val fps: Float, val loop: Boolean = true, val over: Over = Over.NONE, val still: Int = -1)
	/** Purchased packs use their own poses rather than the original cats' grooming names. */
	private fun seasonalPick(anim: Anim, still: Int): Pick = when (anim) {
		Anim.IDLE -> Pick("idle", idleFps)
		Anim.HANG -> Pick("hang", 6f)
		Anim.WALK -> Pick("walk", 8f)
		// Pet.kt owns the jump trajectory; source jumps include baked-in travel.
		Anim.JUMP -> Pick("takeoff", 10f, loop = false)
		Anim.OUTRO -> Pick("outro", 8f, loop = false)
		Anim.SPIN -> Pick("spin", 10f)
		Anim.SLEEP -> Pick("rest", 3f, over = if (pet.id.startsWith("christmas_") || pet.id == "cotton_boo") Over.NONE else Over.ZS)
		Anim.SAD -> Pick("sad", 3f)
		// A pet with its own low-battery strip (the Mini Ghost fades) uses it; the rest look sad.
		Anim.LOW_BATTERY -> Pick(if (pet.strips.containsKey("low")) "low" else "sad", 3f, over = Over.BATTERY)
		Anim.CHARGING -> Pick("charge", 5f, over = Over.BOLT)
		Anim.HAPPY -> Pick("happy", 8f, over = Over.SPARKLES)
		Anim.SURPRISED, Anim.SHAKE -> Pick("startle", 10f, loop = false, over = Over.ALERT)
		Anim.DIZZY -> Pick("dizzy", 8f, over = Over.DIZZY)
		Anim.REACTION -> Pick("reaction", 6f, over = when (still) {
			0 -> Over.HEART; 1 -> Over.ALERT; 2 -> Over.MAIL; else -> Over.MUSIC
		})
		Anim.BLOW -> Pick("blow", Anim.BLOW.fps, loop = false)
		Anim.LOOK -> Pick("look", 8f, loop = false)
		Anim.VARIANT -> when {
			pet.strips.containsKey("peck") && still == 1 -> Pick("peck", 6f)
			pet.strips.containsKey("lick1") && still == 1 -> Pick("lick1", 6f)
			pet.strips.containsKey("lick2") && still == 2 -> Pick("lick2", 6f)
			pet.strips.containsKey("sit") -> Pick("sit", 4f)
			else -> Pick("fidget", 6f)
		}
	}

	/** The strip a fidget ([Anim.VARIANT]) plays for [still], for the settings page's tester. */
	fun variantStrip(still: Int): String =
		frames(if (revisedSeasonal) seasonalPick(Anim.VARIANT, still).strip else pick(Anim.VARIANT, 0f, still).strip).first

	override fun duration(anim: Anim): Float {
		if (!revisedSeasonal) return super<Look>.duration(anim)
		val p = seasonalPick(anim, -1)
		return (pet.strips[p.strip]?.first ?: 1) / p.fps.coerceAtLeast(1f)
	}

	private fun pick(anim: Anim, s: Float, still: Int): Pick = when (anim) {
		Anim.IDLE, Anim.HANG -> Pick("idle", 8f)
		Anim.WALK -> Pick("walk", 10f)
		Anim.JUMP, Anim.OUTRO -> Pick("run", 12f)
		Anim.SPIN -> Pick("run", 14f)
		Anim.HAPPY -> Pick("itch", 8f, over = Over.SPARKLES)
		Anim.SLEEP -> Pick(if ((s * 0.8f).toInt() % 2 == 0) "sleep1" else "sleep2", 0f, over = Over.ZS)
		Anim.SURPRISED, Anim.SHAKE -> Pick("sit", 0f, over = Over.ALERT)
		Anim.SAD -> Pick("lay", 8f, loop = false)
		Anim.DIZZY -> Pick("sit", 0f, over = Over.DIZZY)
		Anim.REACTION -> Pick(
			"voice", 6f,
			over = when (still) { 0 -> Over.HEART; 1 -> Over.ALERT; 2 -> Over.MAIL; else -> Over.MUSIC },
		)
		Anim.CHARGING -> Pick("stretch", 8f, loop = false, over = if ((s * 2f).toInt() % 2 == 0) Over.BOLT else Over.NONE)
		Anim.LOW_BATTERY -> Pick("lay", 8f, loop = false, over = Over.BATTERY)
		Anim.VARIANT -> when (still) {
			1 -> Pick("lick1", 8f)
			2 -> Pick("lick2", 8f)
			3 -> Pick("stretch", 8f, loop = false)
			else -> Pick("sit", 0f)
		}
		Anim.BLOW -> Pick("voice", 6f)
		Anim.LOOK -> Pick("sit", 0f)
	}

	/** Whether this pet has a strip called [name] of its own (not through a fallback). */
	fun has(name: String) = pet.strips.containsKey(name)

	/**
	 * A frame of the strip [name] at [seconds] in, [fps] frames a second, looping or held on the last
	 * frame: the boss pets' own moves (attack, throw, horn, pull, ride) and the horse, which are not
	 * [Anim]s. Composed like any other frame (padding, outline), nothing drawn on top.
	 */
	fun stripFrame(name: String, seconds: Float, fps: Float, loop: Boolean): Bitmap? = runCatching {
		val (n, list) = frames(name)
		if (list.isEmpty()) return null
		val index = if (loop) (seconds * fps).toInt().mod(list.size) else (seconds * fps).toInt().coerceIn(0, list.size - 1)
		cache.getOrPut("$n:$index:NONE:0:$outlineColour") { compose(list[index], Over.NONE, 0) }
	}.getOrNull()

	override fun frame(anim: Anim, seconds: Float, still: Int): Bitmap? = runCatching {
		val p = when {
			revisedSeasonal -> seasonalPick(anim, still)
			anim == Anim.SLEEP && pet.strips.containsKey("sleep") -> Pick("sleep", 4f)
			anim == Anim.JUMP && pet.strips.containsKey("jump") -> Pick("jump", 10f, loop = false)
			anim == Anim.SHAKE && pet.strips.containsKey("hurt") -> Pick("hurt", 8f, loop = false, over = Over.ALERT)
			else -> pick(anim, seconds, still)
		}
		val (name, list) = frames(p.strip)
		if (list.isEmpty()) return null
		val index = when {
			p.fps <= 0f -> 0
			p.loop -> (seconds * p.fps).toInt().mod(list.size)
			else -> (seconds * p.fps).toInt().coerceIn(0, list.size - 1)
		}
		val phase = (seconds * 4f).toInt() % 3
		val key = "$name:$index:${p.over}:${if (p.over == Over.ZS || p.over == Over.SPARKLES || p.over == Over.DIZZY) phase else 0}:$outlineColour"
		val base = cache.getOrPut(key) { compose(list[index], p.over, phase) }
		if (revisedSeasonal && anim == Anim.BLOW) {
			cache.getOrPut("bubble:$index:$outlineColour") { attachedBubble(base, index) }
		} else base
	}.getOrNull()

	// ------------------------------------------------------------------------------------------
	// Drawing
	// ------------------------------------------------------------------------------------------

	private val paint = Paint().apply { isAntiAlias = false; isFilterBitmap = false }

	/** The animal's head: the top-right of its box (they face right), in cell pixels. */
	private val headX get() = PAD_SIDE + pet.w - 6
	private val headY = PAD_TOP
	/** Anchor effects to the idle body's face, not to an animation's widest extent. */
	override val mouthAt: FloatArray? by lazy {
		if (!revisedSeasonal) null else if (pet.mouth != null) {
			floatArrayOf(PAD_SIDE + pet.mouth!![0], PAD_TOP + pet.mouth!![1])
		} else {
			val bmp = strip("idle").firstOrNull()
			if (bmp == null) null else {
				var left = bmp.width; var right = 0; var top = bmp.height; var bottom = 0
				for (y in 0 until bmp.height) for (x in 0 until bmp.width) {
					if ((bmp.getPixel(x, y) ushr 24) > 40) {
						left = minOf(left, x); right = maxOf(right, x)
						top = minOf(top, y); bottom = maxOf(bottom, y)
					}
				}
				val front = pet.id == "cotton_boo" || pet.id.startsWith("witch_ghost") || pet.id == "vampire_cat"
				floatArrayOf(PAD_SIDE + left + (right - left) * (if (front) 0.55f else 0.88f),
					PAD_TOP + top + (bottom - top) * (if (pet.id.startsWith("witch_ghost")) 0.72f else 0.38f))
			}
		}
	}

	/** Grow at the release centre, then hand off to the live bubble on its release frame. */
	private fun attachedBubble(base: Bitmap, frame: Int): Bitmap {
		val next = blowReleases.firstOrNull { frame < it.frame && frame >= it.frame - 2 } ?: return base
		val out = base.copy(Bitmap.Config.ARGB_8888, true)
		val c = Canvas(out)
		val radius = next.size * (if (frame == next.frame - 1) 1f else 0.55f) / 2f
		val bubble = Bubbles.image("bubble_${next.variant + 1}") ?: return base
		c.drawBitmap(bubble, null, RectF(next.x-radius, next.y-radius, next.x+radius, next.y+radius), paint)
		return out
	}

	private fun compose(sprite: Bitmap, over: Over, phase: Int): Bitmap {
		val out = Bitmap.createBitmap(cellW, cellH, Bitmap.Config.ARGB_8888)
		val c = Canvas(out)
		c.drawBitmap(sprite, PAD_SIDE.toFloat(), PAD_TOP.toFloat(), paint)
		if (outlineColour != 0) outline(out, outlineColour)
		val x = mouthAt?.get(0)?.toInt() ?: headX
		val y = headY - 7
		when (over) {
			Over.NONE -> {}
			Over.ZS -> for (k in 0..phase) stamp(c, x - 1 + k * 2, y + 2 - k * 2, listOf("www", ".w.", "www"))
			Over.HEART -> stamp(c, x - 1, y, listOf(".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."))
			Over.ALERT -> stamp(c, x, y, listOf("kyk", "kyk", "kyk", ".k.", "kyk"))
			Over.MAIL -> stamp(c, x - 2, y, listOf("kkkkkkk", "kwkwkwk", "kwwkwwk", "kwwwwwk", "kkkkkkk"))
			Over.MUSIC -> stamp(c, x, y, listOf(".www", ".w.w", ".w.w", "ww.w", "wwww"))
			Over.BOLT -> stamp(c, x, y, listOf("..yy", ".yy.", "yyyy", ".yy.", "yy.."))
			Over.BATTERY -> stamp(c, x - 2, y + 1, listOf("wwwwww.", "wrkkkww", "wrkkkww", "wwwwww."))
			Over.DIZZY -> {
				// Three little stars circling above the head.
				val spots = listOf(-3 to 2, 1 to 0, 5 to 2)
				for ((i, s) in spots.withIndex()) if ((i + phase) % 3 != 0) stamp(c, x + s.first, y + 2 + s.second, listOf(".y.", "yyy", ".y."))
			}
			Over.SPARKLES -> {
				val spots = listOf(1 to 1, cellW - 3 to 2, cellW / 2 to 0)
				for ((i, s) in spots.withIndex()) if ((i + phase) % 3 != 0) stamp(c, s.first - 1, s.second, listOf(".w.", "www", ".w."))
			}
		}
		return out
	}

	/**
	 * A one-pixel outline round the animal: every empty pixel that touches a drawn one (up, down,
	 * left or right) takes [colour]. Drawn before the icons and z's, so those stay clean.
	 */
	private fun outline(bmp: Bitmap, colour: Int) {
		val w = bmp.width
		val h = bmp.height
		val px = IntArray(w * h)
		bmp.getPixels(px, 0, w, 0, 0, w, h)
		val solid = BooleanArray(px.size) { (px[it] ushr 24) > 40 }
		for (y in 0 until h) for (x in 0 until w) {
			val i = y * w + x
			if (solid[i]) continue
			val touches = (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) ||
				(y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])
			if (touches) px[i] = colour
		}
		bmp.setPixels(px, 0, w, 0, 0, w, h)
	}

	private fun stamp(c: Canvas, x: Int, y: Int, rows: List<String>) {
		for ((j, row) in rows.withIndex()) for ((i, ch) in row.withIndex()) {
			val colour = COLOURS[ch] ?: continue
			paint.color = colour
			val px = (x + i).toFloat()
			val py = (y + j).toFloat()
			if (px < 0 || py < 0 || px >= cellW || py >= cellH) continue
			c.drawRect(px, py, px + 1f, py + 1f, paint)
		}
	}

	/** From the mouth, at the same frames the unicorn lets its bubbles go. */
	override val blowReleases: List<BlowRelease> by lazy {
		val mx = mouthAt?.get(0) ?: (PAD_SIDE + pet.w + 1f)
		val my = mouthAt?.get(1) ?: (PAD_TOP + pet.h * 0.3f)
		fun release(frame: Int, size: Float, variant: Int) = BlowRelease(frame,
			if (revisedSeasonal) (mx + size / 2f).coerceAtMost(cellW - size / 2f - 1f) else mx,
			my, size, variant)
		listOf(release(6, 9f, 0), release(10, 8f, 2), release(12, 6f, 5))
	}

	companion object {
		private const val PAD_TOP = 9
		private const val PAD_SIDE = 3
		/** Room under the feet for the outline. */
		private const val PAD_BOTTOM = 1

		/**
		 * The outline's colour (0 = none), set by Pet from Settings.outline and the Discord theme.
		 * Part of every frame's cache key, so a change shows on the next frame.
		 */
		@Volatile var outlineColour = 0
		/** Cell pixels the size setting measures: the ginger cat's and the Golden Retriever's widths. Seasonal pets use their own. */
		private const val CAT_REF_W = 30f
		private const val DOG_REF_W = 45f

		private val FALLBACKS = mapOf(
			"itch" to listOf("lick1", "voice"),
			"sleep2" to listOf("sleep1"),
			"lick2" to listOf("lick1"),
			"stretch" to listOf("idle"),
			"voice" to listOf("idle"),
			"lay" to listOf("sleep1"),
			"sit" to listOf("idle"),
			"run" to listOf("walk"),
		)

		private val COLOURS = mapOf(
			'w' to 0xFFFFFFFF.toInt(), 'k' to 0xFF2A1E3A.toInt(), 'y' to 0xFFFFDD33.toInt(),
			'r' to 0xFFFF3366.toInt(),
		)

		/** All twelve, in PetData's order: six cats, then six dogs. */
		val all: List<SheetLook> by lazy { PetData.pets.map { SheetLook(it, if (it.id.startsWith("dog_")) Looks.Kind.DOG else Looks.Kind.CAT) } }

		/** Seasonal holiday pets, in SeasonalData's order, then the boss pets (BossData.kt). */
		val seasonal: List<SheetLook> by lazy { (SeasonalData.pets + BossData.pets).map { SheetLook(it, Looks.Kind.SEASONAL) } }
	}
}
