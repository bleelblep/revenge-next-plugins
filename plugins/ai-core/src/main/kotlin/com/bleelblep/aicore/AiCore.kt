@file:JvmName("AiCore")

package com.bleelblep.aicore

import android.app.Activity
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
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

/**
 * Runs [block] on the UI thread with a live activity. Everything inside is guarded: an exception on
 * the UI thread is fatal to the whole app, and `Dialog.show()` throws `BadTokenException`
 * when the activity is being torn down between the check and the call. [onFailure] lets the caller
 * resolve its pending result instead of waiting out the full timeout.
 */
private fun PluginScope.onActivity(onFailure: () -> Unit, block: (Activity) -> Unit) {
	withAppActivity { activity ->
		activity.runOnUiThread {
			try {
				if (activity.isFinishing || activity.isDestroyed) onFailure() else block(activity)
			} catch (error: Throwable) {
				log.e("AI Core dialog failed", error)
				onFailure()
			}
		}
	}
}

private fun dp(activity: Activity, value: Int): Int =
	(value * activity.resources.displayMetrics.density).toInt()

/**
 * The colours of whichever Discord theme is active (Ash, Dark, Onyx, Light), read from the app's
 * own `ThemeManager` so the dialogs match without guessing. Reflection because the plugin is not
 * compiled against Discord; any miss falls back to the stock dark palette rather than failing.
 */
private class Palette(
	val surface: Int,
	val heading: Int,
	val text: Int,
	val muted: Int,
	val inputBackground: Int,
	val inputBorder: Int,
	val inputBorderActive: Int,
	val primaryBackground: Int,
	val primaryText: Int,
	val criticalBackground: Int,
	val criticalText: Int,
	val secondaryBackground: Int,
	val secondaryText: Int,
)

private fun discordPalette(activity: Activity): Palette {
	val theme = runCatching {
		val manager = Class.forName("com.discord.theme.ThemeManager", true, activity.classLoader)
		manager.getMethod("getEffectiveTheme").invoke(manager.getField("INSTANCE").get(null))
	}.getOrNull()
	fun color(getter: String, fallback: Long): Int =
		runCatching { theme!!.javaClass.getMethod(getter).invoke(theme) as Int }.getOrElse { fallback.toInt() }
	return Palette(
		surface = color("getBackgroundSurfaceHigh", 0xFF2B2D31),
		heading = color("getMobileTextHeadingPrimary", 0xFFF2F3F5),
		text = color("getTextDefault", 0xFFDBDEE1),
		muted = color("getTextMuted", 0xFF949BA4),
		inputBackground = color("getInputBackgroundDefault", 0xFF1E1F22),
		inputBorder = color("getInputBorderDefault", 0x33FFFFFF),
		inputBorderActive = color("getInputBorderActive", 0xFF5865F2),
		primaryBackground = color("getControlPrimaryBackgroundDefault", 0xFF5865F2),
		primaryText = color("getControlPrimaryTextDefault", 0xFFFFFFFF),
		criticalBackground = color("getControlCriticalPrimaryBackgroundDefault", 0xFFDA373C),
		criticalText = color("getControlCriticalPrimaryTextDefault", 0xFFFFFFFF),
		secondaryBackground = color("getControlSecondaryBackgroundDefault", 0xFF4E5058),
		secondaryText = color("getControlSecondaryTextDefault", 0xFFFFFFFF),
	)
}

private val fonts = mutableMapOf<String, Typeface?>()

/** gg sans from Discord's own assets; null (system font) if a build ever drops the file. */
private fun ggSans(activity: Activity, weight: String): Typeface? = fonts.getOrPut(weight) {
	runCatching { Typeface.createFromAsset(activity.assets, "fonts/ggsans-$weight.ttf") }.getOrNull()
}

private class DialogInput(
	val label: String? = null,
	val hint: String = "",
	val password: Boolean = false,
	/**
	 * When set, the action stays disabled until exactly this is typed, capitals included. Surrounding
	 * spaces are ignored, since a keyboard can add one after a word.
	 */
	val required: String? = null,
)

/**
 * A native dialog laid out like Discord's own alert: centred heading and body, a filled input,
 * and full-width pill buttons with the action above Cancel. Resolves the typed text (or "" with
 * no input) on the action, null on cancel, dismissal or timeout.
 *
 * Deliberately not a JS modal: the confirmations here are what stop another plugin raising the
 * cap on its own, and anything drawn in JS another plugin could draw, or skip, too.
 */
private suspend fun PluginScope.discordDialog(
	title: String,
	message: String,
	action: String,
	destructive: Boolean = false,
	input: DialogInput? = null,
	timeoutMs: Long = 2 * 60_000L,
): String? {
	val result = CompletableDeferred<String?>()
	onActivity({ result.complete(null) }) { activity ->
		val p = discordPalette(activity)
		fun px(value: Int) = dp(activity, value)
		fun shape(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
			setColor(color)
			cornerRadius = px(radius).toFloat()
			if (stroke != null) setStroke(px(1), stroke)
		}
		fun label(value: String, size: Float, color: Int, weight: String, fallback: Typeface) =
			TextView(activity).apply {
				text = value
				textSize = size
				setTextColor(color)
				typeface = ggSans(activity, weight) ?: fallback
			}
		fun button(value: String, background: Int, foreground: Int) =
			label(value, 16f, foreground, "Semibold", Typeface.DEFAULT_BOLD).apply {
				gravity = Gravity.CENTER
				minHeight = px(48)
				setPadding(px(16), 0, px(16), 0)
				this.background = RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), shape(background, 999), null)
				isClickable = true
				isFocusable = true
			}

		val dialog = Dialog(activity)
		val column = LinearLayout(activity).apply {
			orientation = LinearLayout.VERTICAL
			setPadding(px(24), px(24), px(24), px(20))
			background = shape(p.surface, 16)
		}
		fun add(view: View, top: Int) = column.addView(
			view,
			LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
				.apply { topMargin = px(top) },
		)

		add(label(title, 20f, p.heading, "ExtraBold", Typeface.DEFAULT_BOLD).apply { gravity = Gravity.CENTER }, 0)
		add(
			label(message, 16f, p.muted, "Medium", Typeface.DEFAULT).apply {
				gravity = Gravity.CENTER
				setLineSpacing(px(2).toFloat(), 1f)
			},
			8,
		)

		val field = input?.let { spec ->
			spec.label?.let { add(label(it, 14f, p.text, "Semibold", Typeface.DEFAULT_BOLD), 20) }
			EditText(activity).apply {
				hint = spec.hint
				isSingleLine = true
				inputType = InputType.TYPE_CLASS_TEXT or
					if (spec.password) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
				textSize = 16f
				setTextColor(p.text)
				setHintTextColor(p.muted)
				typeface = ggSans(activity, "Medium") ?: Typeface.DEFAULT
				setPadding(px(14), px(12), px(14), px(12))
				background = shape(p.inputBackground, 12, p.inputBorder)
				setOnFocusChangeListener { _, focused ->
					background = shape(p.inputBackground, 12, if (focused) p.inputBorderActive else p.inputBorder)
				}
				add(this, if (spec.label != null) 8 else 20)
			}
		}

		val confirm = if (destructive) {
			button(action, p.criticalBackground, p.criticalText)
		} else {
			button(action, p.primaryBackground, p.primaryText)
		}
		val cancel = button("Cancel", p.secondaryBackground, p.secondaryText)
		add(confirm, 24)
		add(cancel, 8)

		fun typed() = field?.text?.toString()?.trim().orEmpty()
		fun allowed(): Boolean {
			val required = input?.required ?: return input == null || typed().isNotEmpty()
			return typed() == required
		}
		fun refresh() {
			val ok = allowed()
			confirm.isEnabled = ok
			confirm.alpha = if (ok) 1f else 0.5f
		}
		field?.addTextChangedListener(object : TextWatcher {
			override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
			override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
			override fun afterTextChanged(s: Editable?) = refresh()
		})
		refresh()

		confirm.setOnClickListener {
			if (!allowed()) return@setOnClickListener
			result.complete(typed())
			dialog.dismiss()
		}
		cancel.setOnClickListener {
			result.complete(null)
			dialog.dismiss()
		}
		dialog.setOnCancelListener { result.complete(null) }

		dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
		dialog.setContentView(column)
		dialog.window?.apply {
			setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
			val width = activity.resources.displayMetrics.widthPixels - px(32)
			setLayout(minOf(width, px(420)), WindowManager.LayoutParams.WRAP_CONTENT)
			if (field != null) setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
		}
		dialog.show()
		field?.requestFocus()
	}
	return withTimeoutOrNull(timeoutMs) { result.await() }
}

/** Resolves the typed key, or null on cancel / no activity within the timeout. */
private suspend fun PluginScope.askForKey(endpoint: String): String? = discordDialog(
	title = "API key",
	message = "Only ever sent to ${hostOf(endpoint)}. Stored encrypted by Android's keystore; " +
		"no plugin can read it back, including this one's settings screen.",
	action = "Save",
	input = DialogInput(hint = "sk-...", password = true),
	timeoutMs = 5 * 60_000L,
)?.ifEmpty { null }

private suspend fun PluginScope.confirm(
	title: String,
	message: String,
	action: String,
	destructive: Boolean = false,
): Boolean = discordDialog(title, message, action, destructive) != null

/**
 * A confirmation that has to be earned: [action] stays disabled until [word] is typed. For choices
 * where a reflexive tap would be a real mistake, not just an undo.
 */
private suspend fun PluginScope.confirmTyped(title: String, message: String, word: String, action: String): Boolean =
	discordDialog(
		title,
		message,
		action,
		destructive = true,
		input = DialogInput(label = "Type $word to confirm", required = word),
	) != null

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
		// No daily ceiling at all. Calls are still counted; only the check against `cap` is skipped.
		var unlimited = false
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
						.put("unlimited", unlimited)
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
					unlimited = obj.optBoolean("unlimited", false)
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
				.put("unlimited", unlimited)
				.put("day", day)
				.put("calls", calls)
				// JSON has no Infinity, so an unlimited day reports the cap's remainder and the JS
				// side reads `unlimited` first. Tampering still fails closed either way.
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

		// Turning the ceiling off is the one change here that can cost real money with no upper
		// bound, so it needs the word typed, not a tap. Turning it back on applies at once.
		registerNativeAsyncMethod("$id.setUnlimited") { args ->
			val wanted = args.getOrNull(0) as? Boolean ?: return@registerNativeAsyncMethod mutex.withLock { status() }
			if (wanted && !mutex.withLock { unlimited } &&
				!confirmTyped(
					"Remove the AI Core daily cap?",
					"Every plugin using AI Core will be able to make as many calls as it likes, every day. " +
						"Each one is billed to your key. Nothing here will stop a plugin stuck in a loop; " +
						"only a spending limit set with your provider will.",
					"UNLIMITED",
					"Remove cap",
				)
			) {
				return@registerNativeAsyncMethod mutex.withLock { status() }
			}
			mutex.withLock {
				unlimited = wanted
				persistUsage()
				status()
			}
		}

		registerNativeAsyncMethod("$id.resetUsage") { _ ->
			val ok = confirm(
				"Reset today's AI Core count?",
				"The cap starts again from zero. This does not refund anything already spent with the provider.",
				"Reset",
				destructive = true,
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
					!unlimited && calls >= cap -> return@registerNativeAsyncMethod JSONObject().put("ok", false).put("error", "cap").toString()
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
