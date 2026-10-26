package com.bleelblep.sparkle

import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.zip.GZIPInputStream

/**
 * The purchased ToffeeCraft pets' art, kept out of the source. tools/split_paid.py writes it to
 * assets/paid-pets.bin (gitignored), the plugin ZIP carries it and Revenge extracts it to
 * dist/<id>/paid-pets.bin. The file is gzipped JSON XORed with a SHA-256 keystream: enough that the
 * art isn't sitting in the repo or the ZIP as plain PNGs, not a lock against anyone reading this file.
 *
 * Without the file (a build from the public source) every lookup is null and SeasonalData keeps the
 * slots with the Dragon's art, so saved pet ids don't move.
 */
internal object PaidPets {
	class Art(val name: String, val w: Int, val h: Int, val strips: Map<String, Pair<Int, Array<String>>>, val mouth: FloatArray?)

	private val KEY = "shimeji/seasonal/v1:6f1c2a9e4b7d".toByteArray()
	private val MAGIC = "SHP1".toByteArray()

	/** The extracted plugin folder; set in start() before any look is built. */
	@Volatile var dir: File? = null

	private val art: Map<String, Art> by lazy { runCatching { load() }.getOrDefault(emptyMap()) }

	operator fun get(id: String): Art? = art[id]

	private fun load(): Map<String, Art> {
		val file = File(dir ?: return emptyMap(), "paid-pets.bin")
		if (!file.isFile) return emptyMap()
		val bytes = file.readBytes()
		if (bytes.size < MAGIC.size || !bytes.copyOfRange(0, MAGIC.size).contentEquals(MAGIC)) return emptyMap()
		val data = unscramble(bytes.copyOfRange(MAGIC.size, bytes.size))
		val json = JSONObject(GZIPInputStream(data.inputStream()).bufferedReader().use { it.readText() })
		val out = HashMap<String, Art>()
		for (id in json.keys()) {
			val pet = json.getJSONObject(id)
			val strips = LinkedHashMap<String, Pair<Int, Array<String>>>()
			val list = pet.getJSONArray("strips")
			for (i in 0 until list.length()) {
				val strip = list.getJSONArray(i)
				val frames = strip.getJSONArray(2)
				strips[strip.getString(0)] = strip.getInt(1) to Array(frames.length()) { frames.getString(it) }
			}
			val mouth = pet.optJSONArray("mouth")?.let { m -> FloatArray(m.length()) { m.getDouble(it).toFloat() } }
			out[id] = Art(pet.getString("name"), pet.getInt("w"), pet.getInt("h"), strips, mouth)
		}
		return out
	}

	private fun unscramble(data: ByteArray): ByteArray {
		val sha = MessageDigest.getInstance("SHA-256")
		var block = ByteArray(0)
		for (i in data.indices) {
			if (i % 32 == 0) {
				val counter = (i / 32).toLong()
				sha.update(KEY)
				sha.update(ByteArray(8) { (counter ushr (56 - it * 8)).toByte() })
				block = sha.digest()
			}
			data[i] = (data[i].toInt() xor block[i % 32].toInt()).toByte()
		}
		return data
	}
}
