@file:JvmName("FreeStickersPlugin")

package com.bleelblep.freestickers

import android.content.Context
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The native half of Free Stickers: turning an animated PNG sticker into a GIF file (ApngToGif.kt)
 * that JS can upload. Kept out of JS because decoding and encoding dozens of frames on Hermes
 * would freeze Discord's UI for seconds; here it runs on a background dispatcher.
 *
 * GIFs are cached by sticker id and size, so sending the same sticker again is instant.
 */

private const val MAX_DOWNLOAD = 8 * 1024 * 1024
private const val MAX_CACHED = 60

private fun download(url: String): ByteArray {
	require(url.startsWith("https://media.discordapp.net/") || url.startsWith("https://cdn.discordapp.com/")) {
		"Only Discord's own sticker images are converted"
	}
	val connection = URL(url).openConnection() as HttpURLConnection
	connection.connectTimeout = 15_000
	connection.readTimeout = 30_000
	try {
		if (connection.responseCode != 200) throw Error("Download failed (${connection.responseCode})")
		val bytes = connection.inputStream.use { input ->
			val out = java.io.ByteArrayOutputStream()
			val buffer = ByteArray(16 * 1024)
			while (true) {
				val n = input.read(buffer)
				if (n < 0) break
				out.write(buffer, 0, n)
				if (out.size() > MAX_DOWNLOAD) throw Error("Sticker is too large to convert")
			}
			out.toByteArray()
		}
		return bytes
	} finally {
		connection.disconnect()
	}
}

/** Oldest files go first once the cache holds more than MAX_CACHED. */
private fun trim(dir: File) {
	val files = dir.listFiles()?.filter { it.isFile }?.sortedBy { it.lastModified() } ?: return
	files.dropLast(MAX_CACHED).forEach { it.delete() }
}

val freeStickersPlugin = plugin {
	start {
		var context: Context? = null
		withAppContext { context = it.applicationContext ?: it }

		/**
		 * `toGif(stickerId, url, maxSize)` -> absolute path of a GIF, or throws. A sticker that turns
		 * out not to be animated throws "not an animated PNG", and JS sends the still link.
		 */
		registerNativeAsyncMethod("${manifest.id}.toGif") { args ->
			val id = (args.getOrNull(0) as? String)?.takeIf { Regex("^\\d{5,25}$").matches(it) }
				?: throw Error("Expected a sticker id")
			val url = args.getOrNull(1) as? String ?: throw Error("Expected a URL")
			val size = (args.getOrNull(2) as? Number)?.toInt()?.coerceIn(64, 512) ?: 160
			val ctx = context ?: throw Error("Discord isn't ready yet")

			withContext(Dispatchers.IO) {
				val dir = File(ctx.cacheDir, "free-stickers").apply { mkdirs() }
				val file = File(dir, "$id-$size.gif")
				if (file.isFile && file.length() > 0) {
					file.setLastModified(System.currentTimeMillis())
					return@withContext file.absolutePath
				}
				val gif = withContext(Dispatchers.Default) { ApngToGif.convert(download(url), size) }
				val tmp = File(dir, "$id-$size.gif.tmp")
				tmp.writeBytes(gif)
				if (!tmp.renameTo(file)) { file.writeBytes(gif); tmp.delete() }
				trim(dir)
				file.absolutePath
			}
		}
	}
}
