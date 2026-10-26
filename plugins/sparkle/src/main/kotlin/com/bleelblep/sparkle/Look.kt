package com.bleelblep.sparkle

import android.graphics.Bitmap

/**
 * Which character the pet is drawn as. Pet.kt only ever asks the current look for a frame of an
 * [Anim], its duration and its cell size, so every behaviour works the same with any look.
 */
internal interface Look {
	/** The frame bitmaps' size; the pet view keeps this aspect. */
	val cellW: Int
	val cellH: Int
	/** Cell pixels across that the size setting measures (the character's own width, not the padding). */
	val refW: Float
	/** Dedicated upright poses; Pet applies ceiling inversion / wind-up rotation. */
	val hasMotionPoses: Boolean get() = false
	val timedShake: Boolean get() = false
	/**
	 * Share of the cell above the body in an upright pose: room for things drawn into some frames
	 * (z's, hearts, a '!'). Pet places the mouth, speech bubble, hearts and treat-seeking against the
	 * body under it, not the whole cell. 0.12 is the unicorn's, which those placements were tuned on.
	 */
	val headroom: Float get() = 0.12f
	/** The mouth in cell pixels (facing right), when the look knows it; else Pet estimates it. */
	val mouthAt: FloatArray? get() = null

	fun frame(anim: Anim, seconds: Float, still: Int = -1): Bitmap?

	/** How long a one-shot animation takes; the same for every look, so moods keep their timing. */
	fun duration(anim: Anim): Float {
		val name = Motion.name(anim, this)
		return if (name != null) MotionData.strips.getValue(name).times.sum() / 1000f else Sprites.duration(anim)
	}

	/** Mirrored when facing left. */
	fun directional(anim: Anim): Boolean

	/** Where blown things leave the character, per [Anim.BLOW] frame. */
	val blowReleases: List<BlowRelease>
}

/** The pixel unicorn: the hand-made sprite strips (Sprites.kt, SpriteData.kt). */
internal object UnicornLook : Look {
	override val hasMotionPoses = true
	override val cellW get() = Sprites.cellW
	override val cellH get() = Sprites.cellH
	override val refW = 90f
	override fun frame(anim: Anim, seconds: Float, still: Int) = Sprites.frame(anim, seconds, still)
	override fun directional(anim: Anim) = anim.directional
	override val blowReleases get() = BlowRelease.all
}

internal object Looks {
	const val UNICORN = 0
	const val NYAN = 1
	/** 2..7 the six cats, 8..13 the six dogs (SheetLook.all, in PetData's order). */
	const val FIRST_SHEET = 2
	const val GARY = 14
	/** Seasonal pets, in SeasonalData's order, then BossData's; new entries append to preserve saved IDs. */
	const val FIRST_SEASONAL = 15
	val LAST get() = FIRST_SEASONAL + SeasonalData.pets.size + BossData.pets.size - 1

	enum class Kind { UNICORN, NYAN, CAT, DOG, GARY, SEASONAL }

	fun of(id: Int): Look = when (id) {
		NYAN -> NyanLook
		GARY -> GaryLook
		in FIRST_SHEET until GARY -> SheetLook.all[id - FIRST_SHEET]
		in FIRST_SEASONAL..LAST -> SheetLook.seasonal[id - FIRST_SEASONAL]
		else -> UnicornLook
	}

	fun kindOf(id: Int): Kind = when (val look = of(id)) {
		NyanLook -> Kind.NYAN
		GaryLook -> Kind.GARY
		is SheetLook -> look.kind
		else -> Kind.UNICORN
	}

	val current: Look get() = of(Settings.look)
	val kind: Kind get() = kindOf(Settings.look)
}
