package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64

/** Screensaver Gary parts, posed for every shared animation. See art/gary for sources. */
internal object GaryLook : Look {
	override val hasMotionPoses = true
	override val timedShake = true
	override val cellW = GaryData.W
	override val cellH = GaryData.H
	override val refW = 189f
	override fun directional(anim: Anim) = true
	private val frames = HashMap<String, List<Bitmap>>()
	private fun key(anim: Anim, still: Int = -1): String = anim.name.lowercase() +
		if (anim == Anim.REACTION || anim == Anim.VARIANT) "-${still.coerceIn(0, 3)}" else ""

	override fun duration(anim: Anim) = GaryData.strips.getValue(key(anim)).times.sum() / 1000f

	override fun frame(anim: Anim, seconds: Float, still: Int): Bitmap? {
		val name = key(anim, still)
		val data = GaryData.strips.getValue(name)
		val list = frames.getOrPut(name) {
			val bytes = Base64.decode(data.png.joinToString(""), Base64.DEFAULT)
			val strip = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
			List(data.times.size) { Bitmap.createBitmap(strip, it * cellW, 0, cellW, cellH) }
		}
		val elapsed = (seconds.coerceAtLeast(0f) * 1000).toLong()
		val total = data.times.sum()
		var ms = if (anim.loop || anim == Anim.REACTION || anim == Anim.VARIANT) elapsed % total else elapsed.coerceAtMost(total - 1L)
		for (i in data.times.indices) {
			if (ms < data.times[i]) return list[i]
			ms -= data.times[i]
		}
		return list.last()
	}

	override val blowReleases = listOf(
		BlowRelease(6, 190f, 167f, 24f, 0),
		BlowRelease(10, 190f, 167f, 20f, 2),
		BlowRelease(12, 190f, 167f, 16f, 5),
	)

	/** Filenames from Gary's BFBB voice bank; no pitch-shifted generic cat substitutes. */
	fun voice(event: String): String? {
		val choices = when (event) {
			"appear", "wake", "talk", "tap" -> listOf("singles_a", "singles_b", "singles_c", "singles_d", "meow")
			"heart", "happy", "twinkle", "charge" -> listOf("Happy001_a", "Happy001_b", "Happy001_c")
			"hop", "boing", "gulp" -> listOf("Excited001_a", "Excited001_b", "Excited001_c")
			"pickup", "swoosh", "alert", "grab", "slip" -> listOf("Afraid001_b")
			"dizzy" -> listOf("Confused_a", "Confused_b", "Confused_c")
			"thud_0", "thud_1", "thud_2" -> listOf("Embarassed001_a")
			"sad", "low_battery", "leave" -> listOf("Sad001_b")
			"ding", "chime" -> listOf("doubles_a", "doubles_b", "doubles_d")
			"spit" -> listOf("Hairball001_a")
			else -> return null
		}
		return "gary_${choices.random()}"
	}
}
