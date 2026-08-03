@file:JvmName("GhostLogNativeBeta")

package com.bleelblep.ghostlogbeta

import android.util.Base64
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import io.github.revenge.xposed.api.registerNativeMethod
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
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
        val logFile = File(storageDir, "deleted-log.json.enc")
        var maxEntries = 100
        var unlimitedEntries = false

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

        fun persistLocked() {
            val arr = JSONArray()
            entries.forEach(arr::put)
            logFile.writeText(encrypt(arr.toString()))
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
            // React Native delivers all numbers as Double; normalize the timestamps to Long so the
            // stored JSON reads clean and matches stable's number shape.
            for (key in listOf("sentAt", "deletedAt")) {
                (entry.opt(key) as? Number)?.let { entry.put(key, it.toLong()) }
            }
            val id = entry.optString("id")
            mutex.withLock {
                entries.removeAll { it.optString("id") == id }
                entries.add(0, entry)
                trimLocked()
                persistLocked()
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

        registerNativeAsyncMethod("${manifest.id}.getLogCount") { _ ->
            mutex.withLock { entries.size }
        }

        registerNativeAsyncMethod("${manifest.id}.clearLog") { _ ->
            mutex.withLock {
                entries.clear()
                persistLocked()
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
