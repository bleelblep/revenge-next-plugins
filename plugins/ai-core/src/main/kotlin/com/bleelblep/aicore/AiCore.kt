@file:JvmName("AiCore")

package com.bleelblep.aicore

import android.app.Activity
import android.app.AlertDialog
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.InputType
import android.util.Base64
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import io.github.revenge.plugins.PluginScope
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.KeyStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AI Core's native half: the only place the API key exists in the clear.
 *
 * ## Why this is native at all
 *
 * Every Revenge plugin shares one JS runtime with full access to it. In JS the key could be read
 * from `storage.json` with `fs`, from memory, or from the `Authorization` header by anyone who
 * patched `fetch`. None of that reaches here:
 *
 * - The key is typed into a native Android dialog ([promptForKey]), never a React input, so it
 *   never passes through JS -- not through `callNativeMethod`, not through a TextInput a plugin
 *   could hook.
 * - At rest it is AES-GCM encrypted under an Android Keystore key, which cannot be exported from
 *   the device. `storageDir` is shared with JS, so JS can see the ciphertext; it cannot open it.
 * - The request is made here, with the header added here. JS hands over the messages and gets
 *   back the reply text and token counts. Nothing else crosses.
 *
 * ## The key is bound to the endpoint it was entered for
 *
 * Otherwise any plugin could point the base URL at its own server and have this code post the
 * key there. The endpoint is stored beside the key, shown in the entry dialog, and is the only
 * place the key is ever sent. Redirects are not followed, because a redirect carries the header
 * to wherever it points.
 *
 * ## What this does not stop
 *
 * Any plugin can call these methods, and the caller cannot be verified -- so another plugin can
 * *use* the key, it just cannot *see* it. The daily cap is enforced here for that reason, and
 * raising it or resetting the count needs a native confirmation. A plugin that saved the
 * encrypted usage file and restored it across a restart could roll the count back; the spending
 * limit on the key itself is the backstop for that. Native plugins run in the same process and
 * are outside this model entirely.
 */

private const val KEYSTORE = "AndroidKeyStore"
private const val KEY_ALIAS = "bleelblep.ai-core.vault.v1"
private const val VAULT_FILE = "vault.v1.enc"
private const val USAGE_FILE = "usage.v1.enc"
private const val MAX_CAP = 1000

// --- Keystore-backed AES-GCM -------------------------------------------------

private fun keystoreKey(): SecretKey {
	val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
	(store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
	val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
	generator.init(
		KeyGenParameterSpec.Builder(
			KEY_ALIAS,
			KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
		)
			.setBlockModes(KeyProperties.BLOCK_MODE_GCM)
			.setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
			.setKeySize(256)
			.build(),
	)
	return generator.generateKey()
}

private fun seal(plain: String): String {
	val cipher = Cipher.getInstance("AES/GCM/NoPadding")
	// Keystore keys require the cipher to choose the IV.
	cipher.init(Cipher.ENCRYPT_MODE, keystoreKey())
	val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
	return JSONObject()
		.put("v", 1)
		.put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
		.put("ct", Base64.encodeToString(ct, Base64.NO_WRAP))
		.toString()
}

/** Null when missing, tampered with, or sealed under a Keystore key that no longer exists. */
private fun open(raw: String): String? = runCatching {
	val obj = JSONObject(raw)
	val cipher = Cipher.getInstance("AES/GCM/NoPadding")
	cipher.init(
		Cipher.DECRYPT_MODE,
		keystoreKey(),
		GCMParameterSpec(128, Base64.decode(obj.getString("iv"), Base64.NO_WRAP)),
	)
	String(cipher.doFinal(Base64.decode(obj.getString("ct"), Base64.NO_WRAP)), Charsets.UTF_8)
}.getOrNull()

// --- endpoint rules ------------------------------------------------------------

/**
 * `https://` anywhere, plain `http://` only to this device or a private network (a local
 * llama.cpp). Returns the normalized base URL, or null if the key must not be sent there.
 */
private fun normalizeEndpoint(raw: String): String? = runCatching {
	val trimmed = raw.trim().trimEnd('/')
	val uri = URI(trimmed)
	val host = uri.host?.lowercase() ?: return null
	if (uri.userInfo != null) return null
	when (uri.scheme?.lowercase()) {
		"https" -> trimmed
		"http" -> if (isPrivateHost(host)) trimmed else null
		else -> null
	}
}.getOrNull()

private fun isPrivateHost(host: String): Boolean {
	if (host == "localhost" || host == "127.0.0.1" || host == "::1") return true
	val parts = host.split('.').mapNotNull { it.toIntOrNull() }
	if (parts.size != 4) return false
	return parts[0] == 10 ||
		(parts[0] == 192 && parts[1] == 168) ||
		(parts[0] == 172 && parts[1] in 16..31)
}

private fun hostOf(endpoint: String): String = runCatching { URI(endpoint).host }.getOrNull() ?: endpoint

// --- native dialogs ------------------------------------------------------------

private fun PluginScope.onActivity(block: (Activity) -> Unit) {
	withAppActivity { activity -> activity.runOnUiThread { block(activity) } }
}

private fun dp(activity: Activity, value: Int): Int =
	(value * activity.resources.displayMetrics.density).toInt()

/** Resolves the typed key, or null on cancel / no activity within the timeout. */
private suspend fun PluginScope.askForKey(endpoint: String): String? {
	val result = CompletableDeferred<String?>()
	onActivity { activity ->
		if (activity.isFinishing) {
			result.complete(null)
			return@onActivity
		}
		val pad = dp(activity, 20)
		val input = EditText(activity).apply {
			hint = "sk-..."
			inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
			isSingleLine = true
		}
		val note = TextView(activity).apply {
			text = "Only ever sent to ${hostOf(endpoint)}. Stored encrypted by Android's " +
				"keystore; no plugin can read it back, including this one's settings screen."
			setPadding(0, 0, 0, dp(activity, 12))
		}
		val layout = LinearLayout(activity).apply {
			orientation = LinearLayout.VERTICAL
			setPadding(pad, dp(activity, 8), pad, 0)
			addView(note)
			addView(input)
		}
		AlertDialog.Builder(activity)
			.setTitle("AI Core: API key")
			.setView(layout)
			.setPositiveButton("Save") { _, _ -> result.complete(input.text.toString().trim().ifEmpty { null }) }
			.setNegativeButton("Cancel") { _, _ -> result.complete(null) }
			.setOnCancelListener { result.complete(null) }
			.show()
	}
	return withTimeoutOrNull(5 * 60_000L) { result.await() }
}

private suspend fun PluginScope.confirm(title: String, message: String, action: String): Boolean {
	val result = CompletableDeferred<Boolean>()
	onActivity { activity ->
		if (activity.isFinishing) {
			result.complete(false)
			return@onActivity
		}
		AlertDialog.Builder(activity)
			.setTitle(title)
			.setMessage(message)
			.setPositiveButton(action) { _, _ -> result.complete(true) }
			.setNegativeButton("Cancel") { _, _ -> result.complete(false) }
			.setOnCancelListener { result.complete(false) }
			.show()
	}
	return withTimeoutOrNull(2 * 60_000L) { result.await() } ?: false
}

// --- the plugin ----------------------------------------------------------------

@Suppress("UNUSED")
val aiCore = plugin {
	start {
		val id = manifest.id
		val mutex = Mutex()
		val vaultFile = File(storageDir, VAULT_FILE)
		val usageFile = File(storageDir, USAGE_FILE)

		var apiKey: String? = null
		var endpoint: String? = null
		var vaultError: String? = null

		// Usage and the cap. Encrypted too -- not because they are secret, but so a plugin with
		// `fs` cannot simply rewrite the count to zero or the cap to a thousand.
		var cap = 40
		var day = ""
		var calls = 0
		var promptTokens = 0L
		var completionTokens = 0L
		val byPlugin = mutableMapOf<String, Int>()
		// Set when the usage file exists but will not open. Fails closed: nothing calls out until
		// the user confirms a reset natively.
		var usageTampered = false

		// Local calendar day, matching the JS side. Not java.time: that needs API 26 and Discord runs on 24.
		fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

		fun rollDay() {
			val now = today()
			if (day != now) {
				day = now
				calls = 0
				promptTokens = 0
				completionTokens = 0
				byPlugin.clear()
			}
		}

		fun persistVault() {
			val key = apiKey
			val ep = endpoint
			if (key == null || ep == null) {
				vaultFile.delete()
				return
			}
			vaultFile.writeText(seal(JSONObject().put("key", key).put("endpoint", ep).toString()))
		}

		fun persistUsage() {
			val counts = JSONObject()
			byPlugin.forEach { (k, v) -> counts.put(k, v) }
			usageFile.writeText(
				seal(
					JSONObject()
						.put("cap", cap)
						.put("day", day)
						.put("calls", calls)
						.put("promptTokens", promptTokens)
						.put("completionTokens", completionTokens)
						.put("byPlugin", counts)
						.toString(),
				),
			)
		}

		fun load() {
			if (vaultFile.exists()) {
				val plain = open(vaultFile.readText())
				if (plain == null) {
					vaultError = "The stored key could not be opened (Android keystore reset, or the file was altered). Enter it again."
				} else {
					val obj = JSONObject(plain)
					apiKey = obj.optString("key").ifEmpty { null }
					endpoint = obj.optString("endpoint").ifEmpty { null }
				}
			}
			if (usageFile.exists()) {
				val plain = open(usageFile.readText())
				if (plain == null) {
					usageTampered = true
				} else {
					val obj = JSONObject(plain)
					cap = obj.optInt("cap", cap).coerceIn(0, MAX_CAP)
					day = obj.optString("day")
					calls = obj.optInt("calls")
					promptTokens = obj.optLong("promptTokens")
					completionTokens = obj.optLong("completionTokens")
					obj.optJSONObject("byPlugin")?.let { counts ->
						counts.keys().forEach { k -> byPlugin[k] = counts.optInt(k) }
					}
				}
			} else if (vaultFile.exists()) {
				// Written together, so a vault without usage means the usage file was deleted.
				usageTampered = true
			}
			rollDay()
		}

		fun status(): String {
			rollDay()
			val counts = JSONObject()
			byPlugin.forEach { (k, v) -> counts.put(k, v) }
			return JSONObject()
				.put("configured", apiKey != null && endpoint != null)
				.put("endpoint", endpoint ?: JSONObject.NULL)
				.put("vaultError", vaultError ?: JSONObject.NULL)
				.put("usageTampered", usageTampered)
				.put("migrated", vaultFile.exists() || usageFile.exists())
				.put("cap", cap)
				.put("day", day)
				.put("calls", calls)
				.put("remaining", if (usageTampered) 0 else (cap - calls).coerceAtLeast(0))
				.put("promptTokens", promptTokens)
				.put("completionTokens", completionTokens)
				.put("byPlugin", counts)
				.toString()
		}

		runCatching { load() }.onFailure { error ->
			vaultError = "Could not read AI Core's vault: ${error.javaClass.simpleName}"
			log.e("vault load failed", error)
		}

		registerNativeAsyncMethod("$id.status") { _ -> mutex.withLock { status() } }

		// The one way a key gets in. Nothing about the key crosses back to JS.
		registerNativeAsyncMethod("$id.promptForKey") { args ->
			val requested = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod status()
			val ep = normalizeEndpoint(requested)
				?: return@registerNativeAsyncMethod JSONObject(mutex.withLock { status() })
					.put("error", "The base URL must be https://, or http:// to this device or your local network.")
					.toString()
			val key = askForKey(ep) ?: return@registerNativeAsyncMethod mutex.withLock { status() }
			mutex.withLock {
				apiKey = key
				endpoint = ep
				vaultError = null
				persistVault()
				persistUsage()
				status()
			}
		}

		registerNativeAsyncMethod("$id.clearKey") { _ ->
			mutex.withLock {
				apiKey = null
				endpoint = null
				vaultError = null
				persistVault()
				status()
			}
		}

		// One-time move of a key from the old plain-text jsonStorage. Refused once the vault or the
		// usage file has ever existed, so it cannot be used later to swap in someone else's key.
		registerNativeAsyncMethod("$id.importLegacy") { args ->
			val key = (args.getOrNull(0) as? String)?.trim().orEmpty()
			val ep = normalizeEndpoint(args.getOrNull(1) as? String ?: "")
			val legacyCap = (args.getOrNull(2) as? Number)?.toInt()
			mutex.withLock {
				if (vaultFile.exists() || usageFile.exists()) return@withLock false
				if (legacyCap != null) cap = legacyCap.coerceIn(0, MAX_CAP)
				if (key.isNotEmpty() && ep != null) {
					apiKey = key
					endpoint = ep
					persistVault()
				}
				persistUsage()
				true
			}
		}

		// Lowering is always allowed. Raising asks natively, so another plugin cannot quietly
		// give itself a bigger budget.
		registerNativeAsyncMethod("$id.setCap") { args ->
			val wanted = ((args.getOrNull(0) as? Number)?.toInt() ?: return@registerNativeAsyncMethod status())
				.coerceIn(0, MAX_CAP)
			val current = mutex.withLock { cap }
			if (wanted > current &&
				!confirm("Raise the AI Core cap?", "Allow up to $wanted calls a day, from $current. Every plugin using AI Core shares this.", "Raise")
			) {
				return@registerNativeAsyncMethod mutex.withLock { status() }
			}
			mutex.withLock {
				cap = wanted
				persistUsage()
				status()
			}
		}

		registerNativeAsyncMethod("$id.resetUsage") { _ ->
			val ok = confirm(
				"Reset today's AI Core count?",
				"The cap starts again from zero. This does not refund anything already spent with the provider.",
				"Reset",
			)
			mutex.withLock {
				if (ok) {
					day = today()
					calls = 0
					promptTokens = 0
					completionTokens = 0
					byPlugin.clear()
					usageTampered = false
					persistUsage()
				}
				status()
			}
		}

		/**
		 * request(pluginId, body, timeoutMs) -> {ok, status?, error?, content?, promptTokens, completionTokens}
		 *
		 * Only whitelisted body fields are forwarded, so a caller cannot smuggle in anything the
		 * provider would act on beyond an ordinary completion.
		 */
		registerNativeAsyncMethod("$id.request") { args ->
			val pluginId = args.getOrNull(0) as? String ?: "unknown"
			val body = JSONObject((args.getOrNull(1) as? Map<*, *>) ?: emptyMap<String, Any?>())
			val timeout = ((args.getOrNull(2) as? Number)?.toInt() ?: 4000).coerceIn(500, 120_000)

			val (key, ep) = mutex.withLock {
				rollDay()
				val k = apiKey
				val e = endpoint
				when {
					k == null || e == null -> return@registerNativeAsyncMethod JSONObject().put("ok", false).put("error", "no-key").toString()
					usageTampered -> return@registerNativeAsyncMethod JSONObject().put("ok", false).put("error", "usage-tampered").toString()
					calls >= cap -> return@registerNativeAsyncMethod JSONObject().put("ok", false).put("error", "cap").toString()
				}
				// Counted up front, so parallel requests cannot all slip in under the last call.
				calls++
				byPlugin[pluginId] = (byPlugin[pluginId] ?: 0) + 1
				persistUsage()
				k to e
			}

			val payload = JSONObject()
			for (field in listOf("model", "temperature", "max_tokens", "response_format", "messages")) {
				if (body.has(field)) payload.put(field, body.get(field))
			}

			runCatching {
				val connection = URL("$ep/chat/completions").openConnection() as HttpURLConnection
				try {
					connection.instanceFollowRedirects = false
					connection.requestMethod = "POST"
					connection.connectTimeout = timeout
					connection.readTimeout = timeout
					connection.doOutput = true
					connection.setRequestProperty("Content-Type", "application/json")
					connection.setRequestProperty("Authorization", "Bearer $key")
					connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }

					val code = connection.responseCode
					if (code !in 200..299) {
						return@runCatching JSONObject().put("ok", false).put("status", code).put("error", "http").toString()
					}
					val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
					val usage = response.optJSONObject("usage")
					val pt = usage?.optLong("prompt_tokens") ?: 0L
					val ct = usage?.optLong("completion_tokens") ?: 0L
					mutex.withLock {
						rollDay()
						promptTokens += pt
						completionTokens += ct
						persistUsage()
					}
					val content = response.optJSONArray("choices")
						?.optJSONObject(0)
						?.optJSONObject("message")
						?.opt("content") as? String
					JSONObject()
						.put("ok", content != null)
						.put("content", content ?: JSONObject.NULL)
						.put("promptTokens", pt)
						.put("completionTokens", ct)
						.toString()
				} finally {
					connection.disconnect()
				}
			}.getOrElse { error ->
				// Never the message: an exception from the HTTP stack can quote the request.
				JSONObject().put("ok", false).put("error", error.javaClass.simpleName).toString()
			}
		}

		log.i("vault ready (${if (apiKey != null) "key set for ${hostOf(endpoint ?: "")}" else "no key"})")
	}

	stop {
		log.i("Unloaded ${manifest.id}")
	}
}
