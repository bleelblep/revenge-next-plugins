@file:JvmName("GhostLogNativeBeta")

package com.bleelblep.ghostlogbeta

import android.util.Base64
import android.util.Log
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import io.github.revenge.xposed.api.registerNativeMethod
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Native-first Ghost Log.
 *
 * Why native exists here at all: Discord's delete events live in the Hermes/JS Flux layer, so the
 * capture itself must happen on the JS side. What the native side buys is everything the JS side is
 * bad at: real AES-GCM encryption via javax.crypto, and persistence that does not depend on the JS
 * jsonStorage document. The log file lives in storageDir, encrypted, and is rewritten on each catch
 * (same overwrite model as stable's backup file).
 */
@Suppress("UNUSED")
val ghostLogNativeBeta = plugin {
    start {
        val mutex = Mutex()
        val entries = mutableListOf<JSONObject>()
		// EVERYTHING lives in one portable base directory — the backup location (default
		// /storage/emulated/0/Download/GhostLog) — so the encrypted log, the rolling embed shards
		// and the encrypted media blobs all survive an app uninstall/data wipe together. baseDir
		// falls back to app-internal storageDir only until the JS pushes the configured backup path
		// on startup (and re-pushes it on every capture, so a late configure is still safe).
		var baseDir: File = storageDir
		var logFile: File = File(baseDir, "deleted-log.json.enc")
		var richIndexFile: File = File(baseDir, "deleted-embeds.index.v1.json")
		fun richShard(file: Int) = File(baseDir, "deleted-embeds-%05d.json".format(file))
		var mediaDir: File = File(baseDir, "media")
        var maxEntries = 100
        var unlimitedEntries = false

		fun ensureMediaDir(): File {
			if (!mediaDir.exists()) mediaDir.mkdirs()
			// Keep the encrypted blobs out of the gallery/media scanner. .nomedia also stops
			// thumbnails/indexing of the folder itself.
			val noMedia = File(mediaDir, ".nomedia")
			if (!noMedia.exists()) runCatching { noMedia.createNewFile() }
			return mediaDir
		}

		// Point the WHOLE base dir (log + shards + media) at the portable backup location. Returns
		// true only when the directory actually changed, so the caller knows to re-load the log.
		fun setBaseDirFromBackup(backupPath: String?): Boolean {
			if (backupPath.isNullOrBlank()) return false
			val f = File(backupPath)
			val parent = if (f.extension.isNotEmpty()) f.parentFile else f
			val dir = parent ?: return false
			if (dir.absolutePath == baseDir.absolutePath) return false
			// One-time migration: if the portable location has no log yet but internal storage does,
			// carry the log, rolling shards, index and media over so nothing already captured is lost.
			val newLog = File(dir, "deleted-log.json.enc")
			if (!newLog.exists() && logFile.exists()) {
				runCatching {
					dir.mkdirs()
					logFile.copyTo(newLog, overwrite = false)
					if (richIndexFile.exists()) richIndexFile.copyTo(File(dir, richIndexFile.name), overwrite = false)
					val idx = runCatching { JSONObject(richIndexFile.readText()) }.getOrElse { JSONObject() }
					for (file in 1..idx.optInt("file", 0).coerceAtLeast(0)) {
						val src = File(baseDir, "deleted-embeds-%05d.json".format(file))
						if (src.exists()) src.copyTo(File(dir, src.name), overwrite = false)
					}
					val oldMedia = File(baseDir, "media")
					if (oldMedia.isDirectory) {
						val newMedia = File(dir, "media").apply { mkdirs() }
						oldMedia.listFiles()?.forEach { m ->
							if (m.isFile) m.copyTo(File(newMedia, m.name), overwrite = false)
						}
					}
				}
			}
			baseDir = dir
			logFile = File(baseDir, "deleted-log.json.enc")
			richIndexFile = File(baseDir, "deleted-embeds.index.v1.json")
			mediaDir = File(baseDir, "media")
			ensureMediaDir()
			return true
		}

        fun trimLocked() {
            if (unlimitedEntries) return
            while (entries.size > maxEntries) entries.removeAt(entries.size - 1)
        }

        fun deriveKey(): SecretKeySpec {
            // Constant material, available at load time before anything else runs. Keying to the
            // lazily-set user id broke persistence: the write used the user-bound key but the next
            // startup read before configure ran, so decrypt failed and the log read back empty.
            val material = "${appInfo.packageName}:${manifest.id}"
            val digest = MessageDigest.getInstance("SHA-256").digest(material.toByteArray(Charsets.UTF_8))
            return SecretKeySpec(digest, "AES")
        }

        fun encrypt(plain: String): String {
            val iv = ByteArray(12).also(SecureRandom()::nextBytes)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, deriveKey(), GCMParameterSpec(128, iv))
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            return JSONObject().apply {
                put("version", 1)
                put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
                put("payload", Base64.encodeToString(ct, Base64.NO_WRAP))
            }.toString()
        }

        fun decrypt(raw: String): String? = runCatching {
            val obj = JSONObject(raw)
            val iv = Base64.decode(obj.getString("iv"), Base64.NO_WRAP)
            val ct = Base64.decode(obj.getString("payload"), Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, deriveKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        }.getOrNull()

		// Image variants: encrypt raw bytes (not a String) and stash the mime alongside so the
		// renderer can rebuild a correct data: URI on load. Written as one JSON envelope per file.
		fun encryptMediaEnvelope(bytes: ByteArray, mime: String): String {
			val iv = ByteArray(12).also(SecureRandom()::nextBytes)
			val cipher = Cipher.getInstance("AES/GCM/NoPadding")
			cipher.init(Cipher.ENCRYPT_MODE, deriveKey(), GCMParameterSpec(128, iv))
			val ct = cipher.doFinal(bytes)
			return JSONObject().apply {
				put("version", 1)
				put("mime", mime)
				put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
				put("payload", Base64.encodeToString(ct, Base64.NO_WRAP))
			}.toString()
		}

		// Decrypt a media envelope file into a ready-to-render data: URI, or null on any failure.
		fun decryptMediaToDataUri(file: File): String? = runCatching {
			val obj = JSONObject(file.readText())
			val iv = Base64.decode(obj.getString("iv"), Base64.NO_WRAP)
			val ct = Base64.decode(obj.getString("payload"), Base64.NO_WRAP)
			val mime = obj.optString("mime", "image/jpeg").ifBlank { "image/jpeg" }
			val cipher = Cipher.getInstance("AES/GCM/NoPadding")
			cipher.init(Cipher.DECRYPT_MODE, deriveKey(), GCMParameterSpec(128, iv))
			val plain = cipher.doFinal(ct)
			"data:$mime;base64," + Base64.encodeToString(plain, Base64.NO_WRAP)
		}.getOrNull()

        fun persistLocked() {
            val arr = JSONArray()
            entries.forEach(arr::put)
            logFile.writeText(encrypt(arr.toString()))
        }

		// Cap a single downloaded file at 512 MB so Nitro-sized uploads still land but a hostile or
		// runaway stream can't fill the device. (Discord free tier uploads cap ~25 MB, Nitro up to 500 MB.)
		val maxMediaBytes = 512L * 1024 * 1024

		fun extensionFor(contentType: String?, url: String): String {
			val ct = contentType?.substringBefore(';')?.trim()?.lowercase()
			when (ct) {
				"image/png" -> return "png"
				"image/jpeg", "image/jpg" -> return "jpg"
				"image/gif" -> return "gif"
				"image/webp" -> return "webp"
				"image/bmp" -> return "bmp"
				"image/heic", "image/heif" -> return "heic"
				"video/mp4" -> return "mp4"
				"video/quicktime" -> return "mov"
				"video/webm" -> return "webm"
				"video/x-matroska" -> return "mkv"
				"audio/mpeg" -> return "mp3"
				"audio/ogg" -> return "ogg"
				"audio/wav", "audio/x-wav" -> return "wav"
				"audio/mp4", "audio/aac" -> return "m4a"
			}
			// Fall back to the URL's own extension (strip any ?query), default to bin.
			val fromUrl = url.substringBefore('?').substringAfterLast('.', "").lowercase()
			return if (fromUrl.length in 2..5 && fromUrl.all { it.isLetterOrDigit() }) fromUrl else "bin"
		}

		/**
		 * Download a remote URL (image/video/audio/file), AES-GCM encrypt the bytes, and write a
		 * content-addressed `deleted-media-<hash>.enc` envelope into mediaDir. Returns the FILE NAME
		 * (not a path) so the stored reference stays valid even if the portable media dir is remounted
		 * at a new absolute path. Returns null (caller keeps only the CDN url) on any failure or a
		 * payload over maxMediaBytes. Idempotent: a URL already downloaded is not fetched again.
		 */
		fun downloadMedia(url: String): String? {
			val tag = "GhostLogNativeBeta"
			if (url.isBlank() || !(url.startsWith("http://") || url.startsWith("https://"))) {
				Log.w(tag, "downloadMedia skipped: non-http url")
				return null
			}
			val dir = ensureMediaDir()
			val hash = MessageDigest.getInstance("SHA-256")
				.digest(url.toByteArray(Charsets.UTF_8))
				.joinToString("") { "%02x".format(it) }
				.take(32)
			val name = "deleted-media-$hash.enc"
			// Reuse an existing download.
			File(dir, name).takeIf { it.exists() }?.let { Log.i(tag, "media cached: $name"); return name }
			try {
				val conn = (URL(url).openConnection() as HttpURLConnection).apply {
					connectTimeout = 15000
					// Large videos need a long read window; otherwise the socket dies mid-transfer.
					readTimeout = 120000
					instanceFollowRedirects = true
					requestMethod = "GET"
					setRequestProperty("User-Agent", "Mozilla/5.0 (Android) GhostLogNativeBeta")
				}
				try {
					val code = conn.responseCode
					Log.i(tag, "downloadMedia GET $code for $url")
					if (code !in 200..299) return null
					val contentType = conn.contentType
					val declaredLen = conn.contentLengthLong
					if (declaredLen in 1..Long.MAX_VALUE && declaredLen > maxMediaBytes) {
						Log.w(tag, "downloadMedia skipped oversize=$declaredLen")
						return null
					}
					val bytes = conn.inputStream.use { input ->
						val out = java.io.ByteArrayOutputStream()
						val buffer = ByteArray(8192)
						var total = 0L
						while (true) {
							val read = input.read(buffer)
							if (read < 0) break
							total += read
							if (total > maxMediaBytes) {
								Log.w(tag, "downloadMedia aborted oversize mid-stream")
								return null
							}
							out.write(buffer, 0, read)
						}
						out.toByteArray()
					}
					if (bytes.isEmpty()) { Log.w(tag, "downloadMedia empty body"); return null }
					val mime = contentType?.substringBefore(';')?.trim()?.ifBlank { null }
						?: "application/" + extensionFor(null, url)
					File(dir, name).writeText(encryptMediaEnvelope(bytes, mime))
					Log.i(tag, "media saved: $name (${bytes.size} bytes)")
					return name
				} finally {
					conn.disconnect()
				}
			} catch (e: Throwable) {
				Log.e(tag, "downloadMedia failed: $url", e)
				return null
			}
		}

		/**
		 * Walk the captured rich content and download + encrypt every media file it references. The
		 * original CDN url is preserved on each object under `remoteUrl`, and the encrypted on-disk
		 * copy is referenced by `localFile` (the .enc file name in mediaDir). Attachments: ALL types
		 * (image/video/audio/other). Embeds: image, thumbnail, video, author icon and footer icon are
		 * pulled (covers bot embeds). Network happens here so it can run before the persistence lock.
		 */
		fun downloadRichMedia(rich: JSONObject) {
			Log.i("GhostLogNativeBeta", "downloadRichMedia: attachments=${rich.optJSONArray("attachments")?.length() ?: 0} embeds=${rich.optJSONArray("embeds")?.length() ?: 0}")
			fun stampImage(obj: JSONObject?) {
				if (obj == null) return
				// image/thumbnail/video use `url`/`proxy_url`; author/footer icons use
				// `icon_url`/`proxy_icon_url`. Accept either shape.
				val url = obj.optString("url").ifBlank {
					obj.optString("proxy_url").ifBlank {
						obj.optString("icon_url").ifBlank { obj.optString("proxy_icon_url") }
					}
				}
				if (url.isBlank()) return
				val localFile = downloadMedia(url) ?: return
				if (!obj.has("remoteUrl")) obj.put("remoteUrl", url)
				// Store the .enc file name only. The bytes are encrypted at rest; the JS side asks the
				// native getMedia() to decrypt into a data: URI at render time. No plain path is kept.
				obj.put("localFile", localFile)
			}

			rich.optJSONArray("attachments")?.let { arr ->
				for (i in 0 until arr.length()) {
					val att = arr.optJSONObject(i) ?: continue
					stampImage(att)
				}
			}
			rich.optJSONArray("embeds")?.let { arr ->
				for (i in 0 until arr.length()) {
					val embed = arr.optJSONObject(i) ?: continue
					stampImage(embed.optJSONObject("image"))
					stampImage(embed.optJSONObject("thumbnail"))
					stampImage(embed.optJSONObject("video"))
					stampImage(embed.optJSONObject("author"))
					stampImage(embed.optJSONObject("footer"))
				}
			}
		}

		fun persistRichLocked(rich: JSONObject, messageId: String, channelId: String, deletedAt: Long, perFile: Int) {
			val index = runCatching { JSONObject(richIndexFile.readText()) }.getOrElse { JSONObject() }
			var file = index.optInt("file", 1).coerceAtLeast(1)
			var target = richShard(file)
			var existing = runCatching { JSONObject(target.readText()) }.getOrElse { JSONObject() }
			var oldEntries = existing.optJSONArray("entries") ?: JSONArray()
			val limit = perFile.coerceIn(50, 100)
			if (oldEntries.length() >= limit) {
				file += 1
				target = richShard(file)
				existing = JSONObject()
				oldEntries = JSONArray()
			}
			val next = JSONObject().apply {
				put("messageId", messageId)
				put("channelId", channelId)
				put("deletedAt", deletedAt)
				if (rich.has("attachments")) put("attachments", rich.optJSONArray("attachments"))
				if (rich.has("embeds")) put("embeds", rich.optJSONArray("embeds"))
			}
			val out = JSONArray().put(next)
			for (i in 0 until oldEntries.length()) {
				if (out.length() >= limit) break
				val old = oldEntries.optJSONObject(i) ?: continue
				if (old.optString("messageId") != messageId) out.put(old)
			}
			existing.put("version", 1).put("entries", out)
			target.writeText(existing.toString())
			if (file != index.optInt("file", 1) || !richIndexFile.exists()) {
				richIndexFile.writeText(JSONObject().put("version", 1).put("file", file).toString())
			}
		}

        fun loadLocked() {
            entries.clear()
            val raw = runCatching { logFile.readText() }.getOrNull() ?: return
            val plain = decrypt(raw) ?: return
            runCatching {
                val arr = JSONArray(plain)
                for (i in 0 until arr.length()) entries.add(arr.getJSONObject(i))
            }
        }

        loadLocked()

        registerNativeAsyncMethod("${manifest.id}.captureDeleted") { args ->
            val map = args.getOrNull(0) as? Map<*, *> ?: return@registerNativeAsyncMethod false
            val entry = JSONObject(map)
			val rich = entry.optJSONObject("richContent")
			val richPerFile = entry.optInt("richContentPerFile", 100)
			// The whole base dir (log + shards + media) lives next to the backup file, whose path is
			// a JS setting. It rides along on the capture payload so a late configure is still safe.
			val backupPath = entry.optString("backupPath").ifBlank { null }
			entry.remove("richContent")
			entry.remove("richContentPerFile")
			entry.remove("backupPath")
			if (backupPath != null) setBaseDirFromBackup(backupPath)
            // React Native delivers all numbers as Double; normalize the timestamps to Long so the
            // stored JSON reads clean and matches stable's number shape.
            for (key in listOf("sentAt", "deletedAt")) {
                (entry.opt(key) as? Number)?.let { entry.put(key, it.toLong()) }
            }
			val id = entry.optString("id")
			// Fetch image bytes to local files BEFORE taking the persistence lock: this is network
			// I/O and must not block other captures serializing through the mutex. registerNativeAsyncMethod
			// already runs this off the JS thread, so the blocking download is safe here.
			if (rich != null) runCatching { downloadRichMedia(rich) }
            mutex.withLock {
                entries.removeAll { it.optString("id") == id }
                entries.add(0, entry)
                trimLocked()
                persistLocked()
				if (rich != null) persistRichLocked(rich, id, entry.optString("channelId"), entry.optLong("deletedAt"), richPerFile)
            }
            log.i("captured deletion id=$id count=${entries.size}")
            true
        }

        registerNativeAsyncMethod("${manifest.id}.getLog") { _ ->
            mutex.withLock {
                val arr = JSONArray()
                entries.forEach(arr::put)
                arr.toString()
            }
        }

		registerNativeAsyncMethod("${manifest.id}.getRichContent") { args ->
			val ids = (args.getOrNull(0) as? List<*>)?.mapNotNull { it as? String }?.toHashSet() ?: emptySet()
			mutex.withLock {
				val out = JSONObject()
				val index = runCatching { JSONObject(richIndexFile.readText()) }.getOrElse { JSONObject() }
				for (file in 1..(index.optInt("file", 0).coerceAtLeast(0))) {
					val entries = runCatching { JSONObject(richShard(file).readText()).optJSONArray("entries") }.getOrNull() ?: continue
					for (i in 0 until entries.length()) {
						val rich = entries.optJSONObject(i) ?: continue
						val id = rich.optString("messageId")
						if (id in ids) out.put(id, rich)
					}
				}
				out.toString()
			}
		}

		// Decrypt one encrypted media blob (by .enc file name) into a data: URI for the RN image
		// loader. Returns null if the file is missing or cannot be decrypted (falls back to CDN url).
		registerNativeAsyncMethod("${manifest.id}.getMedia") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			// Guard against path traversal: only a bare file name inside mediaDir is allowed.
			if (name.contains('/') || name.contains('\\') || !name.endsWith(".enc")) {
				return@registerNativeAsyncMethod null
			}
			val file = File(mediaDir, name)
			if (!file.exists()) return@registerNativeAsyncMethod null
			decryptMediaToDataUri(file)
		}

		// Point the whole base dir at the portable backup location so pages can pre-set it without
		// waiting for a catch. Re-loads the log if the directory actually moved (e.g. first run after
		// migrating out of internal storage).
		registerNativeAsyncMethod("${manifest.id}.setBaseDir") { args ->
			val backupPath = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			val moved = setBaseDirFromBackup(backupPath)
			if (moved) mutex.withLock { loadLocked() }
			true
		}

        registerNativeAsyncMethod("${manifest.id}.getLogCount") { _ ->
            mutex.withLock { entries.size }
        }

        registerNativeAsyncMethod("${manifest.id}.clearLog") { _ ->
            mutex.withLock {
                entries.clear()
                persistLocked()
                // Clearing the log must also drop the rolling embed shards, their index, and every
                // downloaded image, otherwise stale media/shards linger and reattach on next load.
                runCatching {
                    val index = runCatching { JSONObject(richIndexFile.readText()) }.getOrElse { JSONObject() }
                    for (file in 1..index.optInt("file", 0).coerceAtLeast(0)) richShard(file).delete()
                    richIndexFile.delete()
                    // Delete only the encrypted media blobs; keep .nomedia so the folder stays hidden.
                    mediaDir.listFiles()?.forEach { if (it.name.endsWith(".enc")) it.delete() }
                }
            }
            log.i("log cleared")
            true
        }

        registerNativeMethod("${manifest.id}.getLogFilePath") { _ ->
            logFile.absolutePath
        }

        registerNativeAsyncMethod("${manifest.id}.setLimits") { args ->
            val max = (args.getOrNull(0) as? Number)?.toInt() ?: 100
            val unlimited = args.getOrNull(1) as? Boolean ?: false
            mutex.withLock {
                maxEntries = max.coerceAtLeast(1)
                unlimitedEntries = unlimited
                trimLocked()
                persistLocked()
            }
            log.i("setLimits max=$maxEntries unlimited=$unlimitedEntries")
            true
        }

        registerNativeAsyncMethod("${manifest.id}.exportBackup") { args ->
            val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
            mutex.withLock {
                runCatching {
                    val target = File(path)
                    target.parentFile?.mkdirs()
                    val arr = JSONArray()
                    entries.forEach(arr::put)
                    target.writeText(encrypt(arr.toString()))
                    mapOf("path" to target.absolutePath, "count" to entries.size)
                }.getOrNull()
            }
        }

        registerNativeAsyncMethod("${manifest.id}.seedEntries") { args ->
            val list = args.getOrNull(0) as? List<*> ?: return@registerNativeAsyncMethod 0
            mutex.withLock {
                val existing = entries.map { it.optString("id") }.toHashSet()
                var added = 0
                for (item in list) {
                    val map = item as? Map<*, *> ?: continue
                    val o = JSONObject(map)
                    for (key in listOf("sentAt", "deletedAt")) {
                        (o.opt(key) as? Number)?.let { o.put(key, it.toLong()) }
                    }
                    val id = o.optString("id")
                    if (id.isNotEmpty() && !existing.contains(id)) {
                        entries.add(o)
                        added++
                    }
                }
                entries.sortByDescending { it.optLong("deletedAt", 0L) }
                trimLocked()
                persistLocked()
                added
            }
        }

        registerNativeAsyncMethod("${manifest.id}.importBackup") { args ->
            val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod -1
            mutex.withLock {
                val raw = runCatching { File(path).readText() }.getOrNull() ?: return@withLock -1
                val plain = decrypt(raw) ?: return@withLock -1
                val arr = runCatching { JSONArray(plain) }.getOrNull() ?: return@withLock -1
                val existing = entries.map { it.optString("id") }.toHashSet()
                var added = 0
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val id = o.optString("id")
                    if (id.isNotEmpty() && !existing.contains(id)) {
                        entries.add(o)
                        added++
                    }
                }
                entries.sortByDescending { it.optLong("deletedAt", 0L) }
                trimLocked()
                persistLocked()
                added
            }
        }

        log.i("native capture ready (encrypted log at ${logFile.name})")
    }

    stop {
        log.i("Unloaded ${manifest.id}")
    }
}
