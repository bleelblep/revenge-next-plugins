package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64

/** Pre-drawn flat 2D motion; durations and offsets match the reviewed GIFs. */
internal object Motion {
	private val cache = HashMap<String, List<Bitmap>>()
	fun name(anim: Anim, look: Look = Looks.current): String? {
		val prefix = when (look) {
			UnicornLook -> "unicorn"
			NyanLook -> "nyan"
			else -> return null
		}
		return when (anim) {
			Anim.SPIN -> "${prefix}_spin"
			Anim.HANG -> "${prefix}_hang"
			Anim.JUMP -> if (prefix == "nyan") "nyan_jump" else null
			Anim.SHAKE -> if (prefix == "nyan") "nyan_shake" else null
			Anim.LOOK -> if (prefix == "nyan") "nyan_look" else null
			Anim.OUTRO -> if (prefix == "nyan") "nyan_outro" else null
			else -> null
		}
	}
	fun frame(name: String, seconds: Float): Bitmap? = runCatching {
		val data = MotionData.strips.getValue(name)
		val frames = cache.getOrPut(name) {
			val bytes = Base64.decode(data.png, Base64.DEFAULT)
			val sheet = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
			List(data.times.size) { Bitmap.createBitmap(sheet, it * data.w, 0, data.w, data.h) }
		}
		val elapsed = (seconds.coerceAtLeast(0f) * 1000).toInt()
		val loop = name.endsWith("_spin") || name.endsWith("_hang")
		var ms = if (loop) elapsed % data.times.sum() else elapsed.coerceAtMost(data.times.sum() - 1)
		val index = data.times.indexOfFirst { duration ->
			if (ms < duration) true else { ms -= duration; false }
		}.coerceAtLeast(0)
		frames[index]
	}.getOrNull()
}
