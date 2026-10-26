package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64

/**
 * One animation from the sprite set. [directional] ones are drawn facing right and are mirrored
 * when Sparkle faces left; the rest face the viewer (or have a fixed side) and are never flipped.
 */
internal enum class Anim(val strip: String, val fps: Float, val loop: Boolean, val directional: Boolean = false) {
	IDLE("idle", 6f, true),
	WALK("walk_hover", 10f, true, directional = true),
	JUMP("jump", 12f, false),
	SPIN("spin", 12f, true),
	/** Dedicated already-inverted ceiling pose for the unicorn and Nyan Cat. */
	HANG("idle", 8f, true),
	HAPPY("happy", 6f, true),
	SLEEP("sleep", 2.5f, true),
	SURPRISED("surprised", 8f, true),
	SAD("sad", 5f, true),
	DIZZY("excited_dizzy", 7f, true),
	/** Four stills, one per bubble: heart, !, mail, music. Shown one at a time, not played. */
	REACTION("reaction_notification", 0f, false, directional = true),
	CHARGING("charging", 3f, false, directional = true),
	LOW_BATTERY("low_battery", 2f, false),
	SHAKE("shake_burst", 0f, false),
	OUTRO("outro_exit", 8f, false, directional = true),
	/** Four stills: plain, holding a heart, sparkling, sunglasses. Idle fidgets. */
	VARIANT("extra_variants", 0f, false),
	/**
	 * Blowing bubbles: raises the wand, a bubble grows on it and floats off, a smaller one follows,
	 * then a sparkly cheer. The bubbles that leave the wand are real ones from Bubbles.kt, released
	 * at [BlowRelease] so they take over exactly where the drawn one was.
	 */
	BLOW("blow", 8f, false, directional = true),
	/** Front, profile, rear pause, then back to idle. Built by tools/build_look.py. */
	LOOK("look", 16f, false),
}

/**
 * The moments in [Anim.BLOW] where a drawn bubble leaves the wand: on [frame], a bubble of [variant]
 * (fx/bubble_N.png, zero-based) and [size] cell pixels across is released centred on ([x], [y]) in
 * cell pixels, facing right. tools/build_blow.py uses these same positions for the attached bubbles.
 */
internal class BlowRelease(val frame: Int, val x: Float, val y: Float, val size: Float, val variant: Int) {
	companion object {
		val all = listOf(
			BlowRelease(6, 104f, 66f, 24f, 0),
			BlowRelease(10, 102f, 68f, 20f, 2),
			BlowRelease(12, 100f, 70f, 16f, 5),
		)
	}
}

/** Which still of [Anim.REACTION] shows which bubble. */
internal object Bubble {
	const val HEART = 0
	const val ALERT = 1
	const val MAIL = 2
	const val MUSIC = 3
}

internal object Sprites {
	val cellW = SpriteData.CELL_W
	val cellH = SpriteData.CELL_H
	private val frames = HashMap<Anim, List<Bitmap>>()

	/** Frames of [anim], cut from its strip on first use and kept. Empty if the strip won't decode. */
	fun frames(anim: Anim): List<Bitmap> = frames.getOrPut(anim) {
		runCatching {
			val (count, chunks) = SpriteData.strips.getValue(anim.strip)
			val bytes = Base64.decode(chunks.joinToString(""), Base64.DEFAULT)
			val strip = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
			List(count) { i -> Bitmap.createBitmap(strip, i * cellW, 0, cellW, cellH) }
		}.getOrDefault(emptyList())
	}

	/** The frame of [anim] to show [seconds] after it started; [still] picks a frame outright. */
	fun frame(anim: Anim, seconds: Float, still: Int = -1): Bitmap? {
		val list = frames(anim)
		if (list.isEmpty()) return null
		if (still >= 0) return list[still.coerceIn(0, list.size - 1)]
		val index = (seconds * anim.fps).toInt()
		return list[if (anim.loop) index.mod(list.size) else index.coerceIn(0, list.size - 1)]
	}

	/** How long a one-shot animation takes to reach its last frame. */
	fun duration(anim: Anim): Float = if (anim.fps <= 0f) 0f else frames(anim).size / anim.fps
}
