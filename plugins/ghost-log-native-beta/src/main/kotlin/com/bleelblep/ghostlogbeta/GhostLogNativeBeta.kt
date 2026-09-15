@file:JvmName("GhostLogNativeBeta")

package com.bleelblep.ghostlogbeta

import android.util.Base64
import android.util.Log
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import io.github.revenge.xposed.api.registerNativeMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val TAG = "GhostLogNativeBeta"

// A burst of deletions used to mean one full re-encrypt + rewrite of the WHOLE log per catch, all
// serialized through the persistence mutex, so a 500-message purge did 500 rewrites of a growing
// array -- quadratic, and long enough for Android to consider the app hung. Writes are coalesced
// into at most one per window instead, and forced to disk before any read, backup or shutdown, so
// nothing observable ever sees a stale log. The exposure is one window's worth of catches if the
// process is hard-killed inside it.
private const val PERSIST_DEBOUNCE_MS = 400L

// `stop {}` is a separate lambda from `start {}` and cannot see its locals, so the final flush is
// published here for it to call.
private var flushOnStop: (() -> Unit)? = null

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
		// Bounds how many media downloads run at once. registerNativeAsyncMethod handlers all run on
		// ONE shared CoroutineScope(SupervisorJob() + Dispatchers.IO) inside the Revenge bridge
		// (RevengeBridgeSupport.dispatchScope), so every native call in the app -- every plugin's,
		// not just ours -- competes for that pool's threads. A mod bulk-deleting dozens of
		// attachment-bearing messages starts one blocking HttpURLConnection per message at once
		// (15s connect, 120s read), and enough of those pin every thread in the pool, so unrelated
		// native calls stop being serviced and the app looks hung. The permit count keeps one burst
		// from claiming the whole pool. No withContext needed -- we are already on Dispatchers.IO.
		val downloadSemaphore = Semaphore(4)
		// Our own scope, not the bridge's: the debounced flush outlives the native call that
		// scheduled it, so it cannot ride on a handler coroutine that is about to complete.
		val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
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
		// Decrypted copies handed to the RN image loader. App-private, hidden from the media
		// scanner, and wiped on start / clear so plaintext never accumulates.
		val mediaCacheDir: File = File(storageDir, "mediacache")
        var maxEntries = 100
        var unlimitedEntries = false

		// Storage health, surfaced to JS by getStorageStatus so the UI can say plainly that the
		// configured location is unusable instead of silently losing every catch. Discord's manifest
		// declares neither MANAGE_EXTERNAL_STORAGE nor requestLegacyExternalStorage, so on Android 11+
		// there is no permission to request and no dialog to raise: a shared path either happens to
		// work on that device or it never will, and the only honest response is to say so and fall
		// back to app-private storage.
		var requestedDir: String? = null
		var storageError: String? = null
		var lastWriteError: String? = null

		var dirty = false
		var persistJob: Job? = null

		fun hideFromMediaScanner(dir: File) {
			if (!dir.exists()) dir.mkdirs()
			// Keep the blobs out of the gallery/media scanner. .nomedia also stops
			// thumbnails/indexing of the folder itself.
			val noMedia = File(dir, ".nomedia")
			if (!noMedia.exists()) runCatching { noMedia.createNewFile() }
		}

		fun ensureMediaDir(): File {
			hideFromMediaScanner(mediaDir)
			return mediaDir
		}

		fun ensureMediaCacheDir(): File {
			hideFromMediaScanner(mediaCacheDir)
			return mediaCacheDir
		}

		fun wipeMediaCache() {
			runCatching { mediaCacheDir.listFiles()?.forEach { if (it.isFile && it.name != ".nomedia") it.delete() } }
		}

		/**
		 * Absolute paths are used as given; a RELATIVE path resolves against app-private storageDir.
		 * That is what makes the new app-private default (and the "App docs"/"App cache" choices,
		 * which were relative strings resolving against the process CWD and therefore never worked)
		 * land somewhere the app can actually write.
		 */
		fun resolveBaseDir(backupPath: String?): File? {
			if (backupPath.isNullOrBlank()) return null
			val raw = File(backupPath)
			val abs = if (raw.isAbsolute) raw else File(storageDir, backupPath)
			// A path ending in a file name means "the directory holding it".
			return if (abs.extension.isNotEmpty()) abs.parentFile else abs
		}

		/** Null when the directory really accepts a write; otherwise the reason it does not. */
		fun probeWritable(dir: File): String? = runCatching {
			dir.mkdirs()
			val probe = File(dir, ".glwrite")
			probe.writeText("ok")
			probe.delete()
			null
		}.getOrElse { error -> "${error.javaClass.simpleName}: ${error.message ?: "write denied"}" }

        // Constant material, available at load time before anything else runs. Keying to the
        // lazily-set user id broke persistence: the write used the user-bound key but the next
        // startup read before configure ran, so decrypt failed and the log read back empty.
        fun keyFrom(material: String): SecretKeySpec {
            val digest = MessageDigest.getInstance("SHA-256").digest(material.toByteArray(Charsets.UTF_8))
            return SecretKeySpec(digest, "AES")
        }

        // Everything is WRITTEN under the primary key, which is derived from the plugin id alone and
        // is therefore identical on every install. That is what makes an exported bundle actually
        // portable: the old key mixed in the host package name, so a bundle from one repackaged
        // Discord would not open on a repack with a different package name -- which the UI called
        // portable regardless.
        //
        // This is not a downgrade in protection. Both keys are fixed constants derived from values
        // printed in the plugin's own source, so neither ever defended against someone reading that
        // source; the encryption is there so the files are not casually readable on disk. Dropping
        // the package name from the material changes who can open a bundle, not how hard it is.
        val primaryKey = keyFrom("ghost-log-native-beta:${manifest.id}")
        // Read-only fallback so logs written by earlier versions still open. Anything read through
        // it is rewritten under the primary key by the next write.
        val legacyKey = keyFrom("${appInfo.packageName}:${manifest.id}")

        fun deriveKey(): SecretKeySpec = primaryKey

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

        fun decryptWith(raw: String, key: SecretKeySpec): String? = runCatching {
            val obj = JSONObject(raw)
            val iv = Base64.decode(obj.getString("iv"), Base64.NO_WRAP)
            val ct = Base64.decode(obj.getString("payload"), Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        }.getOrNull()

        /** Primary key first, then the legacy package-bound one so older logs still open. */
        fun decrypt(raw: String): String? = decryptWith(raw, primaryKey) ?: decryptWith(raw, legacyKey)

        /**
         * Read a JSON sidecar (the rich-content index or a shard) in either format.
         *
         * These used to be written as plain JSON while the plugin described itself as encrypted at
         * rest, and they carry real content: attachment filenames and urls, embed titles,
         * descriptions and fields. They are encrypted now. Existing plaintext files still load --
         * `decrypt` returns null for anything that is not an envelope -- and are rewritten encrypted
         * by the next write that touches them.
         */
        fun readJsonFile(file: File): JSONObject? {
            val raw = runCatching { file.readText() }.getOrNull() ?: return null
            return runCatching { JSONObject(decrypt(raw) ?: raw) }.getOrNull()
        }

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

		// Point the WHOLE base dir (log + shards + media) at the portable backup location. Returns
		// true only when the directory actually changed, so the caller knows to re-load the log.
		fun setBaseDirFromBackup(backupPath: String?): Boolean {
			val requested = resolveBaseDir(backupPath) ?: return false
			requestedDir = requested.absolutePath

			// Probe before committing. A shared-storage path that Android refuses is the difference
			// between "every catch is lost" and "every catch throws out of the handler coroutine",
			// and neither is acceptable, so an unusable location falls back to app-private storage
			// and reports why.
			storageError = probeWritable(requested)
			val dir = if (storageError == null) requested else storageDir
			if (storageError != null) {
				Log.e(TAG, "base dir ${requested.absolutePath} is not writable ($storageError); using ${dir.absolutePath}")
			}
			if (dir.absolutePath == baseDir.absolutePath) return false
			// One-time migration: if the portable location has no log yet but internal storage does,
			// carry the log, rolling shards, index and media over so nothing already captured is lost.
			val newLog = File(dir, "deleted-log.json.enc")
			if (!newLog.exists() && logFile.exists()) {
				runCatching {
					dir.mkdirs()
					logFile.copyTo(newLog, overwrite = false)
					if (richIndexFile.exists()) richIndexFile.copyTo(File(dir, richIndexFile.name), overwrite = false)
					val idx = (readJsonFile(richIndexFile) ?: JSONObject())
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
		 * Decrypt a media envelope into an app-private cache file and return a `file://` URI, or null
		 * on any failure (the caller then keeps the CDN url).
		 *
		 * Deliberately NOT a `data:` URI any more. A data URI carries the whole image as a Base64
		 * string: built in Java (UTF-16, ~2.7x the byte count), copied across the bridge, then held in
		 * the Hermes heap by the JS media cache and again by every memoized MessageRecord built from
		 * it. A log with a few dozen saved images was hundreds of megabytes of resident JS string with
		 * nothing to evict it, which is what made "open a channel with restored media" an out-of-memory
		 * kill. A file:// URI is a short path the RN image loader streams from disk instead.
		 *
		 * The trade-off, stated plainly: the decrypted bytes now exist on disk. They live in
		 * app-private storage that other apps cannot read, under .nomedia so nothing indexes them, and
		 * the whole folder is wiped on plugin start, on clear log, and on plugin stop. The encrypted
		 * copy in the portable base dir remains the only at-rest form.
		 */
		fun decryptMediaToCacheFile(src: File, name: String): String? = runCatching {
			val obj = JSONObject(src.readText())
			val mime = obj.optString("mime", "image/jpeg").ifBlank { "image/jpeg" }
			val out = File(ensureMediaCacheDir(), name.removeSuffix(".enc") + "." + extensionFor(mime, ""))
			// Already decrypted this session -- hand back the same file rather than redoing the work.
			if (out.isFile && out.length() > 0L) return@runCatching "file://" + out.absolutePath
			val iv = Base64.decode(obj.getString("iv"), Base64.NO_WRAP)
			val ct = Base64.decode(obj.getString("payload"), Base64.NO_WRAP)
			// Primary key first, then the legacy package-bound one, so blobs saved by earlier
			// versions (and blobs arriving inside an imported bundle) still open.
			val plain = sequenceOf(primaryKey, legacyKey).firstNotNullOfOrNull { key ->
				runCatching {
					val cipher = Cipher.getInstance("AES/GCM/NoPadding")
					cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
					cipher.doFinal(ct)
				}.getOrNull()
			} ?: return@runCatching null
			out.writeBytes(plain)
			"file://" + out.absolutePath
		}.getOrNull()

		/**
		 * The one place the log is actually written. Never throws: this runs on the per-delete path,
		 * and an exception escaping a bridge handler coroutine is not a recoverable condition for the
		 * host app. A failure is recorded for getStorageStatus and leaves the log dirty so the next
		 * flush retries it.
		 */
		fun writeLogNow(): Boolean = runCatching {
			val arr = JSONArray()
			entries.forEach(arr::put)
			logFile.parentFile?.mkdirs()
			logFile.writeText(encrypt(arr.toString()))
			lastWriteError = null
			true
		}.getOrElse { error ->
			lastWriteError = "${error.javaClass.simpleName}: ${error.message ?: "write failed"}"
			Log.e(TAG, "log write failed to ${logFile.absolutePath}", error)
			false
		}

		/** Caller must hold the mutex. Writes only if there is something to write. */
		fun flushLocked() {
			if (!dirty) return
			if (writeLogNow()) dirty = false
		}

		/** Caller must hold the mutex. Marks dirty and writes immediately. */
		fun persistNowLocked() {
			dirty = true
			flushLocked()
		}

		/** Caller must hold the mutex. Marks dirty and coalesces the write into the current window. */
		fun schedulePersistLocked() {
			dirty = true
			if (persistJob != null) return
			persistJob = scope.launch {
				delay(PERSIST_DEBOUNCE_MS)
				mutex.withLock {
					persistJob = null
					flushLocked()
				}
			}
		}

		// 25 MB, matching Discord's free-tier upload limit, because the whole payload is buffered in
		// memory here and then Base64'd into a Java String (UTF-16, so ~2.7x the byte count) and again
		// into a JSON envelope. At the old 512 MB cap a single large video needed well over a gigabyte
		// of transient heap and simply killed the app. Anything over the cap keeps its CDN url only.
		val maxMediaBytes = 25L * 1024 * 1024

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
			val index = (readJsonFile(richIndexFile) ?: JSONObject())
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
			// Guarded for the same reason writeLogNow is: this runs on the per-delete path, and an
			// unwritable base dir must degrade to "rich content not saved", never to an exception
			// escaping the handler coroutine.
			runCatching {
				target.parentFile?.mkdirs()
				target.writeText(encrypt(existing.toString()))
				if (file != index.optInt("file", 1) || !richIndexFile.exists()) {
					richIndexFile.writeText(encrypt(JSONObject().put("version", 1).put("file", file).toString()))
				}
			}.onFailure { error ->
				lastWriteError = "${error.javaClass.simpleName}: ${error.message ?: "shard write failed"}"
				Log.e(TAG, "rich shard write failed to ${target.absolutePath}", error)
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
			// Under the lock: this reassigns baseDir/logFile/richIndexFile/mediaDir, and a concurrent
			// capture could otherwise be inside the lock writing to the File object it is swapping out.
			if (backupPath != null) mutex.withLock { setBaseDirFromBackup(backupPath) }
            // React Native delivers all numbers as Double; normalize the timestamps to Long so the
            // stored JSON reads clean and matches stable's number shape.
            for (key in listOf("sentAt", "deletedAt")) {
                (entry.opt(key) as? Number)?.let { entry.put(key, it.toLong()) }
            }
			val id = entry.optString("id")
			// Fetch image bytes to local files BEFORE taking the persistence lock: this is network
			// I/O and must not block other captures serializing through the mutex. Capped by
			// downloadSemaphore because a bulk delete starts one of these per attachment-bearing
			// message at once -- see the semaphore's own note for why that matters.
			if (rich != null) downloadSemaphore.withPermit { runCatching { downloadRichMedia(rich) } }
            val count = mutex.withLock {
                entries.removeAll { it.optString("id") == id }
                entries.add(0, entry)
                trimLocked()
                // Coalesced, not written outright: see PERSIST_DEBOUNCE_MS. Every read path flushes
                // first, so nothing can observe the gap.
                schedulePersistLocked()
				if (rich != null) persistRichLocked(rich, id, entry.optString("channelId"), entry.optLong("deletedAt"), richPerFile)
                entries.size
            }
            log.i("captured deletion id=$id count=$count")
            true
        }

        registerNativeAsyncMethod("${manifest.id}.getLog") { _ ->
            mutex.withLock {
                flushLocked()
                val arr = JSONArray()
                entries.forEach(arr::put)
                arr.toString()
            }
        }

		registerNativeAsyncMethod("${manifest.id}.getRichContent") { args ->
			val ids = (args.getOrNull(0) as? List<*>)?.mapNotNull { it as? String }?.toHashSet() ?: emptySet()
			mutex.withLock {
				val out = JSONObject()
				val index = (readJsonFile(richIndexFile) ?: JSONObject())
				for (file in 1..(index.optInt("file", 0).coerceAtLeast(0))) {
					val entries = readJsonFile(richShard(file))?.optJSONArray("entries") ?: continue
					for (i in 0 until entries.length()) {
						val rich = entries.optJSONObject(i) ?: continue
						val id = rich.optString("messageId")
						if (id in ids) out.put(id, rich)
					}
				}
				out.toString()
			}
		}

		// Decrypt one encrypted media blob (by .enc file name) into an app-private file:// URI for the
		// RN image loader. Returns null if the file is missing or cannot be decrypted (falls back to
		// CDN url). See decryptMediaToCacheFile for why this is not a data: URI any more.
		registerNativeAsyncMethod("${manifest.id}.getMedia") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			// Guard against path traversal: only a bare file name inside mediaDir is allowed.
			if (name.contains('/') || name.contains('\\') || !name.endsWith(".enc")) {
				return@registerNativeAsyncMethod null
			}
			val file = File(mediaDir, name)
			if (!file.exists()) return@registerNativeAsyncMethod null
			decryptMediaToCacheFile(file, name)
		}

		// Point the whole base dir at the portable backup location so pages can pre-set it without
		// waiting for a catch. Re-loads the log if the directory actually moved (e.g. first run after
		// migrating out of internal storage).
		registerNativeAsyncMethod("${manifest.id}.setBaseDir") { args ->
			val backupPath = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			mutex.withLock {
				// Flush to the OLD location before the swap, or a debounced catch is written to a file
				// nothing will read again.
				flushLocked()
				if (setBaseDirFromBackup(backupPath)) loadLocked()
			}
			true
		}

		// Where the log actually ended up, and why, so the UI can say so rather than failing silently.
		registerNativeAsyncMethod("${manifest.id}.getStorageStatus") { _ ->
			mutex.withLock {
				JSONObject().apply {
					put("baseDir", baseDir.absolutePath)
					put("requestedDir", requestedDir ?: baseDir.absolutePath)
					put("usingFallback", storageError != null)
					put("error", storageError ?: JSONObject.NULL)
					put("lastWriteError", lastWriteError ?: JSONObject.NULL)
					put("entries", entries.size)
				}.toString()
			}
		}

        registerNativeAsyncMethod("${manifest.id}.getLogCount") { _ ->
            mutex.withLock { entries.size }
        }

        registerNativeAsyncMethod("${manifest.id}.clearLog") { _ ->
            mutex.withLock {
                entries.clear()
                persistNowLocked()
                // Clearing the log must also drop the rolling embed shards, their index, and every
                // downloaded image, otherwise stale media/shards linger and reattach on next load.
                runCatching {
                    val index = (readJsonFile(richIndexFile) ?: JSONObject())
                    for (file in 1..index.optInt("file", 0).coerceAtLeast(0)) richShard(file).delete()
                    richIndexFile.delete()
                    // Delete only the encrypted media blobs; keep .nomedia so the folder stays hidden.
                    mediaDir.listFiles()?.forEach { if (it.name.endsWith(".enc")) it.delete() }
                }
                // And the decrypted working copies, or cleared media stays readable on disk.
                wipeMediaCache()
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
                persistNowLocked()
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
                persistNowLocked()
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
                persistNowLocked()
                added
            }
        }

		/**
		 * Everything that makes up a complete log: the encrypted text log, the rich-content index and
		 * its rolling shards, and every encrypted media blob. Media entries are namespaced under
		 * `media/` inside the archive so the import side can put them back in the right place.
		 */
		fun bundleEntries(): List<Pair<String, File>> {
			val out = mutableListOf<Pair<String, File>>()
			if (logFile.isFile) out.add(logFile.name to logFile)
			if (richIndexFile.isFile) out.add(richIndexFile.name to richIndexFile)
			val index = (readJsonFile(richIndexFile) ?: JSONObject())
			for (file in 1..index.optInt("file", 0).coerceAtLeast(0)) {
				val shard = richShard(file)
				if (shard.isFile) out.add(shard.name to shard)
			}
			mediaDir.listFiles()?.forEach { if (it.isFile && it.name.endsWith(".enc")) out.add("media/${it.name}" to it) }
			return out
		}

		/**
		 * Write the whole log as one portable .zip. The contents are already AES-GCM ciphertext, so the
		 * archive is no less protected than the base dir it came from -- and because the key is derived
		 * from the package and plugin id rather than the user, it restores on any device running this
		 * plugin. That is what makes it a usable answer to app-private storage not surviving uninstall.
		 */
		registerNativeAsyncMethod("${manifest.id}.exportBundle") { args ->
			val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			mutex.withLock {
				flushLocked()
				runCatching {
					val target = File(path)
					target.parentFile?.mkdirs()
					var files = 0
					ZipOutputStream(target.outputStream().buffered()).use { zip ->
						for ((name, file) in bundleEntries()) {
							zip.putNextEntry(ZipEntry(name))
							file.inputStream().use { it.copyTo(zip) }
							zip.closeEntry()
							files++
						}
					}
					log.i("exported bundle: $files files to ${target.absolutePath}")
					mapOf("path" to target.absolutePath, "files" to files, "count" to entries.size)
				}.onFailure { error ->
					lastWriteError = "${error.javaClass.simpleName}: ${error.message ?: "bundle export failed"}"
					Log.e(TAG, "bundle export failed to $path", error)
				}.getOrNull()
			}
		}

		/**
		 * Restore a .zip written by exportBundle. This REPLACES the log, index and shards with the
		 * archive's, and merges its media blobs in; use importBackup for the merge-into-current path.
		 * Returns the number of entries in the restored log, or -1 on failure.
		 */
		registerNativeAsyncMethod("${manifest.id}.importBundle") { args ->
			val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod -1
			mutex.withLock {
				runCatching {
					ZipInputStream(File(path).inputStream().buffered()).use { zip ->
						while (true) {
							val entry = zip.nextEntry ?: break
							val name = entry.name.replace('\\', '/')
							// Zip-slip guard: never let an archive write outside the base dir.
							if (entry.isDirectory || name.contains("..") || name.startsWith("/")) {
								zip.closeEntry()
								continue
							}
							val target = if (name.startsWith("media/")) {
								File(ensureMediaDir(), name.removePrefix("media/"))
							} else {
								File(baseDir, name.substringAfterLast('/'))
							}
							target.parentFile?.mkdirs()
							target.outputStream().buffered().use { zip.copyTo(it) }
							zip.closeEntry()
						}
					}
					// The archive's log is now on disk, so re-read it and drop stale decrypted copies.
					loadLocked()
					dirty = false
					wipeMediaCache()
					log.i("imported bundle from $path (${entries.size} entries)")
					entries.size
				}.getOrElse { error ->
					Log.e(TAG, "bundle import failed from $path", error)
					-1
				}
			}
		}

		// Decrypted working copies never survive a restart: whatever is in there is from a previous
		// session and may not even correspond to the current log.
		wipeMediaCache()

		// Best-effort final write, since stop {} cannot see any of the above. Bounded: stop() can run
		// on the main thread, and blocking it indefinitely on a mutex another coroutine happens to
		// hold would be an ANR of our own making. If the wait expires the debounced write is simply
		// lost, which is the same exposure the debounce already carries.
		flushOnStop = {
			runCatching {
				runBlocking { withTimeoutOrNull(1500L) { mutex.withLock { flushLocked() } } }
				wipeMediaCache()
				scope.cancel()
			}
		}

        log.i("native capture ready (encrypted log at ${logFile.name})")
    }

    stop {
        flushOnStop?.invoke()
        flushOnStop = null
        log.i("Unloaded ${manifest.id}")
    }
}
