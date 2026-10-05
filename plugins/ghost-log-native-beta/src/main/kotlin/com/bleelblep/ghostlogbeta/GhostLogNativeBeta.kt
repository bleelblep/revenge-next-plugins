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
import kotlinx.coroutines.CoroutineExceptionHandler
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

/** Undoes LocalVideoHook, for the same reason flushOnStop lives out here. */
private var unhookLocalVideo: (() -> Unit)? = null

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
		// With a handler: an exception escaping a coroutine on a scope without one goes to the thread's
		// default handler, which kills the whole app. Nothing in here throws today (writeLogNow is
		// runCatching), but that should not be the only thing standing between a bug and a crash.
		val scope = CoroutineScope(
			SupervisorJob() + Dispatchers.IO +
				CoroutineExceptionHandler { _, error -> Log.e(TAG, "background task failed", error) },
		)
        val entries = mutableListOf<JSONObject>()
		// Edit history: one record per edited message, newest first, each holding the versions it
		// had before its current text. A separate file from the deleted log so the two can be
		// cleared, counted and trimmed independently, but living in the same base dir, under the
		// same key, flushed by the same debounce and carried by the same bundle.
		val edits = mutableListOf<JSONObject>()
		// EVERYTHING lives in one portable base directory — the backup location (default
		// /storage/emulated/0/Download/GhostLog) — so the encrypted log, the rolling embed shards
		// and the encrypted media blobs all survive an app uninstall/data wipe together. baseDir
		// falls back to app-internal storageDir only until the JS pushes the configured backup path
		// on startup (and re-pushes it on every capture, so a late configure is still safe).
		var baseDir: File = storageDir
		var logFile: File = File(baseDir, "deleted-log.json.enc")
		var editsFile: File = File(baseDir, "edited-log.json.enc")
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
		var editsDirty = false
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

		// Saved videos play from the decrypted cache; Discord's player only speaks HTTP without this.
		unhookLocalVideo?.invoke()
		unhookLocalVideo = runCatching { LocalVideoHook.install(classLoader, ensureMediaCacheDir()) }
			.onFailure { Log.e("GhostLogNativeBeta", "local video hook failed", it) }
			.getOrNull()

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

		/**
		 * The file a backup/bundle path names, resolved the same way as [resolveBaseDir]: absolute as
		 * given, RELATIVE against app-private storageDir.
		 *
		 * exportBackup/importBackup/exportBundle/importBundle used a bare `File(path)`, which resolves
		 * a relative path against the process working directory (`/`). The defaults ARE relative
		 * ("GhostLog/deleted-log.backup.json"), so every auto-backup wrote to `/GhostLog/...` and
		 * failed, and every restore read from there and found nothing -- while the log itself, which
		 * goes through resolveBaseDir, worked. That split is why backups silently never existed.
		 */
		fun resolveFile(path: String): File {
			val raw = File(path)
			return if (raw.isAbsolute) raw else File(storageDir, path)
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
					if (editsFile.exists()) editsFile.copyTo(File(dir, editsFile.name), overwrite = false)
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
			editsFile = File(baseDir, "edited-log.json.enc")
			richIndexFile = File(baseDir, "deleted-embeds.index.v1.json")
			mediaDir = File(baseDir, "media")
			ensureMediaDir()
			return true
		}

        fun trimLocked() {
            if (unlimitedEntries) return
            while (entries.size > maxEntries) entries.removeAt(entries.size - 1)
            while (edits.size > maxEntries) edits.removeAt(edits.size - 1)
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

		/** The edit-history twin of [writeLogNow]; never throws, for the same reason. */
		fun writeEditsNow(): Boolean = runCatching {
			val arr = JSONArray()
			edits.forEach(arr::put)
			editsFile.parentFile?.mkdirs()
			editsFile.writeText(encrypt(arr.toString()))
			true
		}.getOrElse { error ->
			lastWriteError = "${error.javaClass.simpleName}: ${error.message ?: "edit log write failed"}"
			Log.e(TAG, "edit log write failed to ${editsFile.absolutePath}", error)
			false
		}

		/** Caller must hold the mutex. Writes whichever of the two logs has something to write. */
		fun flushLocked() {
			if (dirty && writeLogNow()) dirty = false
			if (editsDirty && writeEditsNow()) editsDirty = false
		}

		/** Caller must hold the mutex. Marks dirty and writes immediately. */
		fun persistNowLocked() {
			dirty = true
			flushLocked()
		}

		/** Caller must hold the mutex. Coalesces a write of whatever is dirty into the current window. */
		fun scheduleFlushLocked() {
			if (persistJob != null) return
			persistJob = scope.launch {
				delay(PERSIST_DEBOUNCE_MS)
				mutex.withLock {
					persistJob = null
					flushLocked()
				}
				}
			}

			/** Caller must hold the mutex. Marks the deleted log dirty and coalesces the write. */
			fun schedulePersistLocked() {
				dirty = true
				scheduleFlushLocked()
			}

			/** Caller must hold the mutex. Marks the edit log dirty and coalesces the write. */
			fun scheduleEditsPersistLocked() {
				editsDirty = true
				scheduleFlushLocked()
			}

		// 25 MB, matching Discord's free-tier upload limit, because the whole payload is buffered in
		// memory here and then Base64'd into a Java String (UTF-16, so ~2.7x the byte count) and again
		// into a JSON envelope. At the old 512 MB cap a single large video needed well over a gigabyte
		// of transient heap and simply killed the app. Anything over the cap keeps its CDN url only.
		val maxMediaBytes = 25L * 1024 * 1024

		/** Per-file locks for downloadMedia, keyed by .enc name. Never shrinks; one tiny Object per file. */
		val mediaLocks = java.util.concurrent.ConcurrentHashMap<String, Any>()

		/**
		 * Download a remote URL (image/video/audio/file), AES-GCM encrypt the bytes, and write a
		 * content-addressed `deleted-media-<hash>.enc` envelope into mediaDir. Returns the FILE NAME
		 * (not a path) so the stored reference stays valid even if the portable media dir is remounted
		 * at a new absolute path. Returns null (caller keeps only the CDN url) on any failure or a
		 * payload over maxMediaBytes. Idempotent: a URL already downloaded is not fetched again.
		 */
		fun mediaNameFor(url: String): String {
			val hash = MessageDigest.getInstance("SHA-256")
				.digest(url.toByteArray(Charsets.UTF_8))
				.joinToString("") { "%02x".format(it) }
				.take(32)
			return "deleted-media-$hash.enc"
		}

		fun downloadMediaLocked(url: String, name: String, tag: String): String? {
			val dir = ensureMediaDir()
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
					// Written beside the target and renamed into place, so a crash or kill mid-write can
					// never leave a truncated .enc that the "reuse an existing download" check trusts.
					val temp = File(dir, "$name.part")
					temp.writeText(encryptMediaEnvelope(bytes, mime))
					if (!temp.renameTo(File(dir, name))) {
						temp.delete()
						Log.w(tag, "downloadMedia could not move $name into place")
						return null
					}
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

		fun downloadMedia(url: String): String? {
			val tag = "GhostLogNativeBeta"
			if (url.isBlank() || !(url.startsWith("http://") || url.startsWith("https://"))) {
				Log.w(tag, "downloadMedia skipped: non-http url")
				return null
			}
			val name = mediaNameFor(url)
			// One download per file at a time. A single deletion can reach captureDeleted twice (the
			// dispatcher hook and the MESSAGE_DELETE fallback), and both used to download the same url
			// and write the same file at once. Small images rarely overlapped; a video took long enough
			// that the two writes interleaved into one file whose payload no longer matched its GCM tag
			// -- saved, and never openable (seen live on 348.5 with a 3.7 MB mp4).
			val lock = mediaLocks.computeIfAbsent(name) { Any() }
			return synchronized(lock) { downloadMediaLocked(url, name, tag) }
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
			// Through readJsonFile, like every other reader: shards are written encrypted, and the
			// envelope is itself valid JSON ({version, iv, payload}), so a plain JSONObject() parse
			// "succeeded" with no `entries` in it. Every capture with media or embeds then rewrote the
			// shard holding only itself, wiping every earlier deletion's attachments and embeds, so
			// restored messages came back without their images.
			var existing = readJsonFile(target) ?: JSONObject()
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

        fun loadEditsLocked() {
            edits.clear()
            val raw = runCatching { editsFile.readText() }.getOrNull() ?: return
            val plain = decrypt(raw) ?: return
            runCatching {
                val arr = JSONArray(plain)
                for (i in 0 until arr.length()) edits.add(arr.getJSONObject(i))
            }
        }

        /** Loads both logs: every caller wants them read from the same base dir at the same moment. */
        fun loadLocked() {
            loadEditsLocked()
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

		// Versions kept per message. An edit war should not grow one record without bound.
		val maxVersions = 20

		/**
		 * Folds edit records from a backup into the edit log. Caller holds the mutex. A message only
		 * in the backup is added; one in both gets the union of its versions (no duplicates, oldest
		 * first, capped) and the newer of the two current texts. Returns how many records changed.
		 */
		fun mergeEditsLocked(incoming: JSONArray): Int {
			var changed = 0
			for (i in 0 until incoming.length()) {
				val record = incoming.optJSONObject(i) ?: continue
				val id = record.optString("id").ifBlank { null } ?: continue
				val index = edits.indexOfFirst { it.optString("id") == id }
				if (index < 0) {
					edits.add(record)
					changed++
					continue
				}
				val mine = edits[index]
				val seen = HashSet<String>()
				val merged = ArrayList<JSONObject>()
				for (list in listOf(mine.optJSONArray("versions"), record.optJSONArray("versions"))) {
					list ?: continue
					for (j in 0 until list.length()) {
						val version = list.optJSONObject(j) ?: continue
						val key = version.optString("content") + "\u0000" + version.optLong("editedAt")
						if (seen.add(key)) merged.add(version)
					}
				}
				merged.sortBy { it.optLong("editedAt") }
				val before = mine.optJSONArray("versions")?.length() ?: 0
				mine.put("versions", JSONArray(merged.takeLast(maxVersions)))
				if (record.optLong("editedAt") > mine.optLong("editedAt")) {
					mine.put("current", record.optString("current"))
					mine.put("editedAt", record.optLong("editedAt"))
				}
				if ((mine.optJSONArray("versions")?.length() ?: 0) != before) changed++
			}
			edits.sortByDescending { it.optLong("editedAt") }
			return changed
		}

		/**
		 * One edit, merged into that message's record. JS sends the text as it was before this edit
		 * (`previous`) and after it (`current`); native owns the record, so the merge happens here and
		 * the merged record is returned for the JS cache to mirror. The first edit also records the
		 * message's metadata (author, channel, guild), which later edits leave alone.
		 */
		registerNativeAsyncMethod("${manifest.id}.captureEdit") { args ->
			val map = args.getOrNull(0) as? Map<*, *> ?: return@registerNativeAsyncMethod null
			val incoming = JSONObject(map)
			val id = incoming.optString("id").ifBlank { return@registerNativeAsyncMethod null }
			val previous = incoming.optString("previous")
			val current = incoming.optString("current")
			val editedAt = (incoming.opt("editedAt") as? Number)?.toLong() ?: System.currentTimeMillis()
			mutex.withLock {
				val index = edits.indexOfFirst { it.optString("id") == id }
				val record = if (index >= 0) edits.removeAt(index) else JSONObject().apply {
					for (key in listOf("id", "channelId", "guildId", "authorId", "authorName", "channelName", "guildName", "authorAvatar", "guildIcon")) {
						incoming.opt(key)?.takeIf { it != JSONObject.NULL }?.let { put(key, it) }
					}
					(incoming.opt("sentAt") as? Number)?.let { put("sentAt", it.toLong()) }
					put("versions", JSONArray())
				}
				val versions = record.optJSONArray("versions") ?: JSONArray().also { record.put("versions", it) }
				val last = if (versions.length() > 0) versions.optJSONObject(versions.length() - 1)?.optString("content") else null
				// The same text arriving twice (a replayed update) adds nothing.
				if (previous != last && previous != current) {
					versions.put(JSONObject().put("content", previous).put("editedAt", editedAt))
				}
				while (versions.length() > maxVersions) versions.remove(0)
				record.put("current", current)
				record.put("editedAt", editedAt)
				edits.add(0, record)
				trimLocked()
				scheduleEditsPersistLocked()
				record.toString()
			}
		}

		registerNativeAsyncMethod("${manifest.id}.getEdits") { _ ->
			mutex.withLock {
				flushLocked()
				val arr = JSONArray()
				edits.forEach(arr::put)
				arr.toString()
			}
		}

		registerNativeAsyncMethod("${manifest.id}.clearEdits") { _ ->
			mutex.withLock {
				edits.clear()
				editsDirty = true
				flushLocked()
			}
			log.i("edit log cleared")
			true
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

		// repairMedia(name, url) -> true when the blob now opens. For a saved copy that exists but
		// fails to decrypt (damaged by the concurrent-write bug fixed in beta19): if Discord's CDN
		// still serves the original, download it again. The name must be the one this url hashes
		// to, so a caller can't point one file's name at someone else's url.
		registerNativeAsyncMethod("${manifest.id}.repairMedia") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			val url = args.getOrNull(1) as? String ?: return@registerNativeAsyncMethod false
			if (name != mediaNameFor(url)) return@registerNativeAsyncMethod false
			val file = File(mediaDir, name)
			if (file.exists() && decryptMediaToCacheFile(file, name) != null) return@registerNativeAsyncMethod true
			synchronized(mediaLocks.computeIfAbsent(name) { Any() }) { file.delete() }
			val saved = downloadMedia(url) ?: return@registerNativeAsyncMethod false
			decryptMediaToCacheFile(File(mediaDir, saved), saved) != null
		}

		// Diagnostics for one saved media blob: getMedia answers only "a URI or null", which hides why
		// a blob won't open. Reports each step, and never returns any of the content.
		registerNativeAsyncMethod("${manifest.id}.mediaCheck") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			if (name.contains('/') || name.contains('\\') || !name.endsWith(".enc")) {
				return@registerNativeAsyncMethod null
			}
			val file = File(mediaDir, name)
			val out = JSONObject().put("path", file.absolutePath).put("exists", file.exists()).put("bytes", file.length())
			runCatching {
				val raw = file.readText()
				out.put("readChars", raw.length)
				val obj = JSONObject(raw)
				out.put("mime", obj.optString("mime")).put("hasIv", obj.has("iv")).put("hasPayload", obj.has("payload"))
				val iv = Base64.decode(obj.getString("iv"), Base64.NO_WRAP)
				val ct = Base64.decode(obj.getString("payload"), Base64.NO_WRAP)
				out.put("cipherBytes", ct.size)
				val results = JSONArray()
				for ((label, key) in listOf("primary" to primaryKey, "legacy" to legacyKey)) {
					val error = runCatching {
						val cipher = Cipher.getInstance("AES/GCM/NoPadding")
						cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
						cipher.doFinal(ct).size
					}.fold({ "ok ($it bytes)" }, { "${it.javaClass.simpleName}: ${it.message}" })
					results.put("$label: $error")
				}
				out.put("decrypt", results)
			}.onFailure { out.put("error", "${it.javaClass.simpleName}: ${it.message}") }
			out.toString()
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
					put("edits", edits.size)
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
                // trimLocked trims the edit log too, so it has to be written as well.
                editsDirty = true
                persistNowLocked()
            }
            log.i("setLimits max=$maxEntries unlimited=$unlimitedEntries")
            true
        }

        registerNativeAsyncMethod("${manifest.id}.exportBackup") { args ->
            val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
            mutex.withLock {
                runCatching {
                    val target = resolveFile(path)
                    target.parentFile?.mkdirs()
                    val deleted = JSONArray()
                    entries.forEach(deleted::put)
                    val edited = JSONArray()
                    edits.forEach(edited::put)
                    // Version 2 carries the edit history too. Version 1 was a bare array of
                    // deleted entries; importBackup still reads both.
                    val body = JSONObject().put("version", 2).put("deleted", deleted).put("edits", edited)
                    target.writeText(encrypt(body.toString()))
                    mapOf("path" to target.absolutePath, "count" to entries.size, "edits" to edits.size)
                }.onFailure { error ->
                    lastWriteError = "${error.javaClass.simpleName}: ${error.message ?: "backup write failed"}"
                    Log.e(TAG, "backup export failed to ${resolveFile(path).absolutePath}", error)
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
                val source = resolveFile(path)
                val raw = runCatching { source.readText() }
                    .onFailure { error -> Log.e(TAG, "backup import could not read ${source.absolutePath}", error) }
                    .getOrNull() ?: return@withLock -1
                val plain = decrypt(raw) ?: return@withLock -1
                // Version 1: a bare array of deleted entries. Version 2: {deleted, edits}.
                val trimmed = plain.trimStart()
                val body = if (trimmed.startsWith("{")) runCatching { JSONObject(plain) }.getOrNull() else null
                val arr = if (body != null) body.optJSONArray("deleted") ?: JSONArray()
                else runCatching { JSONArray(plain) }.getOrNull() ?: return@withLock -1
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
                val editsAdded = body?.optJSONArray("edits")?.let { mergeEditsLocked(it) } ?: 0
                trimLocked()
                editsDirty = editsDirty || editsAdded > 0
                persistNowLocked()
                mapOf("added" to added, "edits" to editsAdded)
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
			if (editsFile.isFile) out.add(editsFile.name to editsFile)
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
					val target = resolveFile(path)
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
					ZipInputStream(resolveFile(path).inputStream().buffered()).use { zip ->
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
					editsDirty = false
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
        unhookLocalVideo?.invoke()
        unhookLocalVideo = null
        log.i("Unloaded ${manifest.id}")
    }
}
