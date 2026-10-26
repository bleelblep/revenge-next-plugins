package com.bleelblep.screeneffects

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.icu.text.BreakIterator
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * What a "Custom" particle choice throws: emoji drawn as text, and images (Discord server emoji,
 * or any image link) downloaded once and kept in memory. Taps use [CustomSprites]; power mode has
 * its own list in [PowerSprites].
 *
 * JS resolves the user's input into items first -- `{type: "text", value}` for plain text and
 * `{type: "image", url}` for server emoji and links -- because only JS can look up `:name:` in
 * Discord's emoji store. Text is split into single emoji here, with ICU's grapheme breaker, so
 * flags, skin tones and joined emoji (👨‍👩‍👧) stay whole.
 */
internal sealed class Sprite {
	class Glyph(val text: String) : Sprite()
	class Image(val bitmap: Bitmap) : Sprite()
}

/** One loader thread for every list; downloads are rare and small. */
private val loader = Executors.newSingleThreadExecutor { Thread(it, "ScreenEffects-sprites").apply { isDaemon = true } }

internal val CustomSprites = SpriteSet()
internal val PowerSprites = SpriteSet()

internal class SpriteSet {
	/** Read on the main thread by the particle layer; replaced whole, never mutated. */
	@Volatile var sprites: List<Sprite> = emptyList()
		private set

	/** The items as last set, kept for saving and for the settings page. */
	@Volatile var items: List<Map<String, String>> = emptyList()
		private set

	private val bitmaps = HashMap<String, Bitmap>()

	/** Bumped per [set], so a slow download for an old list can't overwrite a newer one. */
	@Volatile private var generation = 0

	fun set(newItems: List<Map<String, String>>, onError: (String) -> Unit) {
		items = newItems
		val gen = ++generation
		loader.execute {
			val out = ArrayList<Sprite>()
			for (item in newItems) {
				when (item["type"]) {
					"text" -> out += graphemes(item["value"].orEmpty()).map { Sprite.Glyph(it) }
					"image" -> {
						val url = item["url"] ?: continue
						val bitmap = bitmaps[url] ?: runCatching { download(url) }
							.onFailure { onError("could not load $url: ${it.message}") }
							.getOrNull()
							?.also { bitmaps[url] = it }
						if (bitmap != null) out += Sprite.Image(bitmap)
					}
				}
			}
			if (gen == generation) sprites = out
		}
	}

	fun toJson(): JSONArray = JSONArray().apply {
		for (item in items) put(JSONObject(item as Map<*, *>))
	}

	fun fromJson(array: JSONArray?): List<Map<String, String>> {
		if (array == null) return emptyList()
		return (0 until array.length()).mapNotNull { i ->
			val obj = array.optJSONObject(i) ?: return@mapNotNull null
			obj.keys().asSequence().associateWith { obj.optString(it) }
		}
	}

	private fun graphemes(text: String): List<String> {
		val it = BreakIterator.getCharacterInstance()
		it.setText(text)
		val out = ArrayList<String>()
		var start = it.first()
		var end = it.next()
		while (end != BreakIterator.DONE) {
			val g = text.substring(start, end)
			if (g.isNotBlank()) out += g
			start = end
			end = it.next()
		}
		return out
	}

	private fun download(url: String): Bitmap {
		val conn = URL(url).openConnection() as HttpURLConnection
		conn.connectTimeout = 8000
		conn.readTimeout = 8000
		try {
			val bitmap = conn.inputStream.use { BitmapFactory.decodeStream(it) }
			return bitmap ?: error("not an image")
		} finally {
			conn.disconnect()
		}
	}
}
