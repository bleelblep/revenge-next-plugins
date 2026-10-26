@file:JvmName("ScreenEffects")

package com.bleelblep.screeneffects

import android.content.res.Resources
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeMethod
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.util.Collections
import java.util.IdentityHashMap
import java.util.WeakHashMap
import kotlin.math.hypot

/**
 * Touch effects: a screen distortion (Telegram's ripple and friends, see Ripple.kt/Styles.kt, or the
 * finger-following Lens) and/or a particle burst (Particles.kt). Idea from the exteraGram plugin
 * "Animated touches" (animtou) by @jaxbastard and @zwylair.
 *
 * Touches are caught at each window's root view. `ViewGroup.dispatchTouchEvent` (and
 * `View.dispatchTouchEvent`, for a root that is not a group) is hooked and filtered to views whose
 * parent is not a View, i.e. whose parent is the `ViewRootImpl`. That sees every window -- the
 * activity, dialogs, popups -- and both methods are far too large to be inlined away from the hook.
 * `View.dispatchPointerEvent` would be exact but is tiny and final, so ART may inline it into
 * ViewRootImpl and the hook would silently never fire.
 *
 * Distortions need Android 13 (`RuntimeShader`); particles and the charge ring work everywhere.
 */

internal object Settings {
	const val MIN_INTENSITY = 0.1f
	const val MAX_INTENSITY = 3.0f
	/**
	 * The tap strength slider's stops: Subtle, Normal, Strong, Overboard. Its Off stop is [onTap]
	 * false (with Normal kept for sends, mentions and power mode), not a strength.
	 */
	val INTENSITY_LEVELS = floatArrayOf(0.3f, 0.6f, 1.2f, MAX_INTENSITY)
	const val MAX_DOSE = 3.0f

	@Volatile var intensity = 0.6f
	@Volatile var dose = 0f
	@Volatile var allWindows = true
	/** Exercise the Android 12-and-earlier rendering path even on a newer device. */
	@Volatile var forceLegacy = false
	/**
	 * The live-capture distortions on the legacy tier. On by default since 0.24.0 (confirmed on
	 * Android 10); a Debug switch turns them off. Saved as `legacyCapture`, so the old opt-in
	 * `legacyRipple` value (off for nearly everyone) is not carried over.
	 */
	@Volatile var legacyRipple = true
	@Volatile var style = DEFAULT_STYLE
	@Volatile var particles = "none"
	/** Taps (and finger effects) play: the tap slider's Off stop. Off leaves sends, mentions, /fx and power mode. */
	@Volatile var onTap = true
	@Volatile var charge = false
	@Volatile var onSend = false
	@Volatile var onReceive = false
	@Volatile var filter = FILTER_NONE
	// Master switches, for quick toggling: each pauses one kind of effect without forgetting which
	// style, particles or filter is chosen.
	/** Touch distortions: the chosen style or a finger-following one. */
	@Volatile var screenOn = true
	@Volatile var particlesOn = true
	@Volatile var filterOn = true
	@Volatile var powerMode = false
	@Volatile var powerShake = true
	@Volatile var powerCombo = true
	/** What flies as you type: a particle id (not Rainbow puffs). Custom uses [PowerSprites]. */
	@Volatile var powerParticles = "sparks"
	@Volatile var messageEffects = true
	@Volatile var trackHighScore = true
	/** Longest power mode combo ever. Saved when a run that beat it ends. */
	@Volatile var highScore = 0
	@Volatile var comboSounds = false
	/** No combo sounds while the phone is on silent or vibrate. */
	@Volatile var quietOnSilent = true
	/** How a new high score is celebrated: [CELEBRATION_ARCADE] or [CELEBRATION_BANNER]. */
	@Volatile var celebration = CELEBRATION_ARCADE
	/** Power mode's look, sounds and finish: [ComboSkins.ARCADE] or a skin id in ComboSkins.kt. */
	@Volatile var comboSkin = ComboSkins.ARCADE
}

/** The style in effect: the chosen one, or none while the screen switch is off. */
private val activeStyle get() = if (Settings.screenOn || previewing || testPad) Settings.style else STYLE_NONE
/** The particles in effect: the chosen ones, or none while the particles switch is off. */
private val activeParticles get() = if (Settings.particlesOn || previewing || testPad) Settings.particles else "none"
/** The filter in effect: the chosen one, or none while the filter switch is off. */
private val activeFilter get() = if (Settings.filterOn || previewing || testPad) Settings.filter else FILTER_NONE

/**
 * True while a caller previews with `preview: true` (no page does since 0.25.0): it shows the chosen effects even if a master
 * switch (flipped from Quick Toggles) has them off. Cleared by the page's restore on close.
 */
@Volatile private var previewing = false

/**
 * True while a settings page with the test pad is open: taps play the chosen effects there even
 * with On tap or a master switch off, so a choice can be tried where it is made.
 */
@Volatile private var testPad = false

internal const val CELEBRATION_ARCADE = "arcade"
internal const val CELEBRATION_BANNER = "banner"
internal const val CELEBRATION_LEVELUP = "levelup"
private fun validCelebration(id: String?) =
	id?.takeIf { it == CELEBRATION_ARCADE || it == CELEBRATION_BANNER || it == CELEBRATION_LEVELUP }

/** Writes [Settings] to disk. Set in `start`, where the storage folder is known. */
internal var persistSettings: () -> Unit = {}

private const val SETTINGS_FILE = "settings.json"

/** After a tap, windows that appear within this long (a dialog the tap opened) ripple too. */
private const val ECHO_WINDOW_MS = 300L
private const val ECHO_POLL_MS = 80L

/** A send within this long of a touch fires from that touch (the send button); else bottom centre. */
private const val SEND_TOUCH_MS = 2500L
private const val SEND_BOOST = 1.5f
private const val RECEIVE_BOOST = 1.2f

/** Effective renderer capability, shared by every shader entry point. Never overrides the real API floor. */
internal val SHADERS_SUPPORTED get() = Build.VERSION.SDK_INT >= 33 && !Settings.forceLegacy
private val density get() = Resources.getSystem().displayMetrics.density

internal val mainHandler = Handler(Looper.getMainLooper())
private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

// All below: main thread only. Weak keys, so a window that closes drops its effects with it.
/** The finger-following effect on each root, with the style it was made for. */
private val fingers = WeakHashMap<View, Pair<String, FingerEffect>>()
private val layers = WeakHashMap<View, ParticleLayer>()

/** The finger currently down, when it needs following (lens or charge). */
private class Gesture(val root: View, val downX: Float, val downY: Float) {
	var lens: FingerEffect? = null
	/** Wiping the frosted glass filter clear. */
	var wiping = false
	var charging = false
}

private var gesture: Gesture? = null

/** Last event handled, so one event reaching both hooks on the same root is handled once. */
private var lastDownTime = Long.MIN_VALUE
private var lastEventTime = Long.MIN_VALUE
private var lastAction = -1

private var lastTouchX = 0f
private var lastTouchY = 0f
private var lastTouchAt = 0L
private var lastTouchRoot: WeakReference<View>? = null

/** The hidden `WindowManagerGlobal.mViews`: every window root in this process. */
private val mViewsField by lazy {
	runCatching {
		val cls = Class.forName("android.view.WindowManagerGlobal")
		val instance = cls.getMethod("getInstance").invoke(null)
		val field = cls.getDeclaredField("mViews").apply { isAccessible = true }
		instance to field
	}.getOrNull()
}

/** Every visible window root, or just [fallback] if `mViews` is unreachable on this Android version. */
internal fun windowRoots(fallback: View?): List<View> {
	val single = listOfNotNull(fallback)
	val (instance, field) = mViewsField ?: return single
	val views = runCatching { (field.get(instance) as List<*>).toList() }.getOrNull() ?: return single
	return views.filterIsInstance<View>()
		.filter { it.isAttachedToWindow && it.visibility == View.VISIBLE && it.width > 0 }
		.ifEmpty { single }
}

internal fun local(view: View, rawX: Float, rawY: Float): Pair<Float, Float> {
	val loc = IntArray(2)
	view.getLocationOnScreen(loc)
	return (rawX - loc[0]) to (rawY - loc[1])
}

/**
 * The tap-driven distortion to play, or null for none. The lens is not tap-driven, so taps under
 * it distort nothing, but send/receive triggers fall back to the ripple.
 */
private fun tapStyle(forTrigger: Boolean): String? {
	val id = when (val style = activeStyle) {
		STYLE_NONE -> return null
		STYLE_LENS, STYLE_JELLY, STYLE_BLACKHOLE -> if (forTrigger) DEFAULT_STYLE else return null
		else -> style
	}
	return styleOrNull(id)
}

/** A named effect for messages; unavailable effects never silently replace saved preferences. */
internal fun styleOrNull(id: String): String? = id.takeIf { Rendering.available("effect", it) }

private val FINGER_STYLES = setOf(STYLE_LENS, STYLE_JELLY, STYLE_BLACKHOLE)

/** The finger-following style in use (lens, jelly, black hole), or null. */
private fun fingerStyle(): String? =
	activeStyle.takeIf { it in FINGER_STYLES && Rendering.available("effect", it) }

private fun fingerFor(root: View, style: String): FingerEffect? {
	fingers[root]?.let { (made, effect) ->
		if (made == style) return effect
		effect.cancel()
	}
	val effect = Rendering.finger(root, style) ?: return null
	fingers[root] = style to effect
	return effect
}

internal fun distort(view: View, style: String, rawX: Float, rawY: Float, strength: Float) {
	val (x, y) = local(view, rawX, rawY)
	Rendering.tap(view, style, x, y, strength)
}

internal fun layerFor(view: View) = layers.getOrPut(view) { ParticleLayer(view) }

/** Plays the chosen distortion and particles at a screen point. */
private fun fire(root: View, rawX: Float, rawY: Float, strength: Float, forTrigger: Boolean) {
	ParticleKind.of(activeParticles)?.let { kind ->
		val (x, y) = local(root, rawX, rawY)
		// Overboard throws more than strength alone would: the burst's own scaling tops out below it.
		val overboard = Settings.intensity >= Settings.MAX_INTENSITY
		layerFor(root).burst(kind, x, y, strength, countMul = if (overboard) 1.8f else 1f)
	}

	val style = tapStyle(forTrigger) ?: return
	if (!Settings.allWindows || (!SHADERS_SUPPORTED && Settings.legacyRipple && style in CAPTURE_EFFECTS)) {
		distort(root, style, rawX, rawY, strength)
		return
	}

	val known = Collections.newSetFromMap(IdentityHashMap<View, Boolean>())
	for (view in windowRoots(root)) {
		distort(view, style, rawX, rawY, strength)
		known += view
	}
	val until = SystemClock.uptimeMillis() + ECHO_WINDOW_MS
	val poll = object : Runnable {
		override fun run() {
			if (unhooks.isEmpty()) return
			for (view in windowRoots(null)) if (known.add(view)) distort(view, style, rawX, rawY, strength)
			if (SystemClock.uptimeMillis() < until) mainHandler.postDelayed(this, ECHO_POLL_MS)
		}
	}
	mainHandler.postDelayed(poll, ECHO_POLL_MS)
}


private fun onDown(root: View, rawX: Float, rawY: Float) {
	// Tap to continue: a tap that dismisses the high score finish does nothing else.
	if (ArcadeFinish.consumeTap() || SkinFinish.consumeTap()) return
	lastTouchX = rawX
	lastTouchY = rawY
	lastTouchAt = SystemClock.uptimeMillis()
	lastTouchRoot = WeakReference(root)
	gesture = null

	if (Rendering.wiping) {
		Rendering.wipe(root, rawX, rawY, start = true)
		gesture = Gesture(root, rawX, rawY).also { it.wiping = true }
	}
	// Wiping frost is part of the filter, so it works with taps off; nothing else does.
	if (!Settings.onTap && !testPad) return
	fingerStyle()?.let { style ->
		val lens = fingerFor(root, style) ?: return@let
		val (x, y) = local(root, rawX, rawY)
		lens.press(x, y, Settings.intensity)
		gesture = (gesture ?: Gesture(root, rawX, rawY)).also { it.lens = lens }
	}
	if (Settings.charge) {
		val (x, y) = local(root, rawX, rawY)
		layerFor(root).startCharge(x, y)
		(gesture ?: Gesture(root, rawX, rawY).also { gesture = it }).charging = true
		return
	}
	if (gesture?.lens == null || activeParticles != "none") {
		fire(root, rawX, rawY, Settings.intensity, forTrigger = false)
	}
}

private fun onMove(g: Gesture, rawX: Float, rawY: Float) {
	if (g.wiping) Rendering.wipe(g.root, rawX, rawY, start = false)
	g.lens?.let { lens ->
		val (x, y) = local(g.root, rawX, rawY)
		lens.move(x, y)
	}
	// Moving past a scroll's worth cancels the charge: that was a scroll, not a press.
	if (g.charging && hypot(rawX - g.downX, rawY - g.downY) > 16f * density) {
		g.charging = false
		layerFor(g.root).endCharge()
	}
}

private fun onUp(g: Gesture, cancelled: Boolean) {
	g.lens?.release()
	if (!g.charging) return
	g.charging = false
	val held = layerFor(g.root).endCharge()
	if (cancelled) return
	val strength = (Settings.intensity * (0.5f + 2f * held)).coerceAtMost(Settings.MAX_INTENSITY)
	fire(g.root, g.downX, g.downY, strength, forTrigger = false)
}

private val touchHook = object : XC_MethodHook() {
	override fun beforeHookedMethod(param: MethodHookParam) {
		val event = param.args[0] as? MotionEvent ?: return
		val action = event.actionMasked
		if (action != MotionEvent.ACTION_DOWN && gesture == null) return
		if (action != MotionEvent.ACTION_DOWN && action != MotionEvent.ACTION_MOVE &&
			action != MotionEvent.ACTION_UP && action != MotionEvent.ACTION_CANCEL
		) return
		val view = param.thisObject as? View ?: return
		if (view.parent is View) return
		if (event.downTime == lastDownTime && event.eventTime == lastEventTime && action == lastAction) return
		lastDownTime = event.downTime
		lastEventTime = event.eventTime
		lastAction = action


		runCatching {
			when (action) {
				MotionEvent.ACTION_DOWN -> onDown(view, event.rawX, event.rawY)
				else -> {
					val g = gesture?.takeIf { it.root === view } ?: return@runCatching
					when (action) {
						MotionEvent.ACTION_MOVE -> onMove(g, event.rawX, event.rawY)
						else -> {
							gesture = null
							onUp(g, cancelled = action == MotionEvent.ACTION_CANCEL)
						}
					}
				}
			}
		}.onFailure { XposedBridge.log("[ScreenEffects] touch effect failed: $it") }
	}
}

/** Send / receive effects, called from JS. [force] ignores the switches, for the test page. */
private fun trigger(kind: String, force: Boolean) {
	val roots = windowRoots(null)
	val top = roots.lastOrNull() ?: return
	when (kind) {
		"send" -> {
			if (!Settings.onSend && !force) return
			val recentRoot = lastTouchRoot?.get()
			if (recentRoot != null && recentRoot.isAttachedToWindow &&
				SystemClock.uptimeMillis() - lastTouchAt < SEND_TOUCH_MS
			) {
				fire(recentRoot, lastTouchX, lastTouchY, Settings.intensity * SEND_BOOST, forTrigger = true)
			} else {
				val loc = IntArray(2)
				top.getLocationOnScreen(loc)
				fire(top, loc[0] + top.width / 2f, loc[1] + top.height * 0.85f, Settings.intensity * SEND_BOOST, forTrigger = true)
			}
		}
		"receive" -> {
			if (!Settings.onReceive && !force) return
			val loc = IntArray(2)
			top.getLocationOnScreen(loc)
			fire(top, loc[0] + top.width / 2f, loc[1] + top.height * 0.12f, Settings.intensity * RECEIVE_BOOST, forTrigger = true)
		}
	}
}

/** Bumped whenever the filter changes, so a surprise filter only restores the one it replaced. */
@Volatile private var surpriseToken = 0

/**
 * Sparkle's magic: briefly shows off something VFX can do, whatever its switches say (it was asked
 * for). A filter stays 4-7 s and then the chosen one comes back; effects are a quick run at random
 * spots; a message effect plays once.
 */
/**
 * What a spell may show, from Shimeji's settings: ids like `filter:crt`, `effect:ripple`,
 * `particles:hearts` and `message:slam`. "allow" shows only the listed ones; "block" (and no rules
 * at all) shows everything but them, so things added to VFX later join a block list on their own.
 */
private class SpellRules(private val allowOnly: Boolean, private val ids: Set<String>) {
	fun allows(id: String) = if (allowOnly) id in ids else id !in ids

	companion object {
		val EVERYTHING = SpellRules(false, emptySet())
		fun from(arg: Any?): SpellRules {
			val map = arg as? Map<*, *> ?: return EVERYTHING
			val ids = (map["list"] as? List<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet()
			return SpellRules(map["mode"] == "allow", ids)
		}
	}
}

/** Plays a random spell for Shimeji. False when [rules] leave nothing that can play here. */
private fun surprise(kind: String?, rules: SpellRules = SpellRules.EVERYTHING): Boolean {
	val filters = FILTER_IDS.filter { it != FILTER_NONE && Rendering.available("filter", it) && rules.allows("filter:$it") }
	val styles = EFFECT_IDS.filter {
		it != STYLE_NONE && it !in FINGER_STYLES && Rendering.available("effect", it) && rules.allows("effect:$it")
	}
	val particleKinds = ParticleKind.entries.filter { it.pickable && rules.allows("particles:${it.id}") }
	val messages = MESSAGE_EFFECTS.filter { messageEffectAvailable(it) && rules.allows("message:$it") }
	val options = buildList {
		if (filters.any { it != activeFilter }) add("filter")
		if (styles.isNotEmpty() || particleKinds.isNotEmpty()) add("effect")
		if (messages.isNotEmpty()) add("message")
	}
	when (kind?.takeIf { it in options } ?: options.randomOrNull() ?: return false) {
		"filter" -> {
			val id = filters.filter { it != activeFilter }.randomOrNull() ?: return false
			val token = ++surpriseToken
			Rendering.filter(id)
			mainHandler.postDelayed({
				if (surpriseToken == token) runCatching { Rendering.filter(activeFilter) }
			}, (4000L..7000L).random())
		}
		"effect" -> {
			val top = windowRoots(null).lastOrNull() ?: return false
			val loc = IntArray(2)
			top.getLocationOnScreen(loc)
			val style = styles.randomOrNull()
			val particles = particleKinds.randomOrNull()
			repeat(3) { i ->
				mainHandler.postDelayed({
					runCatching {
						val x = loc[0] + top.width * (0.2f + Math.random().toFloat() * 0.6f)
						val y = loc[1] + top.height * (0.2f + Math.random().toFloat() * 0.6f)
						if (style != null) distort(top, style, x, y, Settings.intensity * 1.4f)
						if (particles != null) {
							val (lx, ly) = local(top, x, y)
							layerFor(top).burst(particles, lx, ly, Settings.intensity * 1.5f)
						}
					}
				}, i * 350L)
			}
		}
		else -> playMessageEffect(messages.random())
	}
	return true
}

/** A custom list from JS: maps of strings ({type, value} or {type, url}). */
private fun spriteItems(list: List<*>): List<Map<String, String>> = list.filterIsInstance<Map<*, *>>().map { item ->
	item.entries.mapNotNull { (k, v) -> (k as? String)?.let { it to v.toString() } }.toMap()
}

/** Snapped to the nearest slider stop, so older free-slider values land on a named level. */
private fun clampIntensity(v: Float) = Settings.INTENSITY_LEVELS.minBy { kotlin.math.abs(it - v) }
private fun clampDose(v: Float) = v.coerceIn(0f, Settings.MAX_DOSE)
private fun validStyle(id: String?) =
	id?.takeIf { it in EFFECT_IDS }
private fun validParticles(id: String?) = id?.takeIf { it == "none" || ParticleKind.of(it)?.pickable == true }
/** Power mode throws a few per key, so the heavy Rainbow puffs stream isn't offered. */
private fun validPowerParticles(id: String?) =
	id?.takeIf { it == POWER_PARTICLES_SKIN || ParticleKind.of(it)?.let { k -> k.pickable && k != ParticleKind.RAINBOW_PUFFS } == true }

/** Power mode particles: only the combo skin's own effects (Arcade, which has none, throws sparks). */
internal const val POWER_PARTICLES_SKIN = "skin"

private fun settingsMap() = mapOf(
	"supported" to SHADERS_SUPPORTED,
	"apiLevel" to Build.VERSION.SDK_INT,
	"rendererTier" to if (SHADERS_SUPPORTED) "modern" else "legacy",
	"hardwareAccelerated" to windowRoots(null).lastOrNull()?.isHardwareAccelerated,
	"effects" to Rendering.capabilities("effect"),
	"filters" to Rendering.capabilities("filter"),
	"messageCapabilities" to MESSAGE_EFFECTS.associateWith { messageEffectAvailable(it) },
	"forceLegacy" to Settings.forceLegacy,
	"legacyRipple" to Settings.legacyRipple,
	"rippleDiagnostics" to LegacyCapture.diagnostics(),
	"hooked" to unhooks.isNotEmpty(),
	"intensity" to Settings.intensity.toDouble(),
	"dose" to Settings.dose.toDouble(),
	"allWindows" to Settings.allWindows,
	"style" to Settings.style,
	"particles" to Settings.particles,
	"onTap" to Settings.onTap,
	"charge" to Settings.charge,
	"onSend" to Settings.onSend,
	"onReceive" to Settings.onReceive,
	"brokenStyles" to (EFFECT_IDS.filter { !Rendering.available("effect", it) } +
		FILTER_IDS.filter { !Rendering.available("filter", it) }.map { "filter:$it" }),
	"custom" to CustomSprites.items,
	"customLoaded" to CustomSprites.sprites.size,
	"filter" to Settings.filter,
	"screenOn" to Settings.screenOn,
	"particlesOn" to Settings.particlesOn,
	"filterOn" to Settings.filterOn,
	"powerMode" to Settings.powerMode,
	"powerParticles" to Settings.powerParticles,
	"powerCustom" to PowerSprites.items,
	"powerCustomLoaded" to PowerSprites.sprites.size,
	"powerShake" to Settings.powerShake,
	"powerCombo" to Settings.powerCombo,
	"messageEffects" to Settings.messageEffects,
	"textHooked" to (textUnhook != null),
	"trackHighScore" to Settings.trackHighScore,
	"highScore" to Settings.highScore,
	"comboSounds" to Settings.comboSounds,
	"quietOnSilent" to Settings.quietOnSilent,
	"celebration" to Settings.celebration,
	"comboSkin" to Settings.comboSkin,
)

private var textUnhook: XC_MethodHook.Unhook? = null

private val textHook = object : XC_MethodHook() {
	override fun afterHookedMethod(param: MethodHookParam) {
		if (!Settings.powerMode) return
		val view = param.thisObject as? android.widget.TextView ?: return
		runCatching { PowerMode.onTextChanged(view, param.args[0] as? CharSequence) }
	}
}

private fun cancelAll() {
	surpriseToken++
	gesture = null
	cancelShakes()
	PowerMode.reset()
	ArcadeFinish.stop()
	SkinFinish.stop()
	clearSkinLayers()
	fingers.values.toList().forEach { runCatching { it.second.cancel() } }
	Rendering.clear()
	layers.values.toList().forEach { runCatching { it.clear() } }
	fingers.clear()
	layers.clear()
}

val screenEffects = plugin {
	start {
		val file = File(storageDir, SETTINGS_FILE)
		if (file.exists()) {
			runCatching {
				val json = JSONObject(file.readText())
				Settings.intensity = clampIntensity(json.optDouble("intensity", 0.6).toFloat())
				Settings.dose = clampDose(json.optDouble("dose", 0.0).toFloat())
				Settings.allWindows = json.optBoolean("allWindows", true)
				Settings.forceLegacy = json.optBoolean("forceLegacy", false)
				Settings.legacyRipple = json.optBoolean("legacyCapture", true)
				Settings.style = validStyle(json.optString("style")) ?: DEFAULT_STYLE
				Settings.particles = validParticles(json.optString("particles")) ?: "none"
				Settings.onTap = json.optBoolean("onTap", true)
				Settings.charge = json.optBoolean("charge", false)
				Settings.onSend = json.optBoolean("onSend", false)
				Settings.onReceive = json.optBoolean("onReceive", false)
				CustomSprites.set(CustomSprites.fromJson(json.optJSONArray("custom"))) { log.w(it) }
				Settings.filter = json.optString("filter").takeIf { isFilter(it) } ?: FILTER_NONE
				Settings.screenOn = json.optBoolean("screenOn", true)
				Settings.particlesOn = json.optBoolean("particlesOn", true)
				Settings.filterOn = json.optBoolean("filterOn", true)
				Settings.powerMode = json.optBoolean("powerMode", false)
				Settings.powerShake = json.optBoolean("powerShake", true)
				Settings.powerCombo = json.optBoolean("powerCombo", true)
				Settings.powerParticles = validPowerParticles(json.optString("powerParticles")) ?: "sparks"
				PowerSprites.set(PowerSprites.fromJson(json.optJSONArray("powerCustom"))) { log.w(it) }
				Settings.messageEffects = json.optBoolean("messageEffects", true)
				Settings.trackHighScore = json.optBoolean("trackHighScore", true)
				Settings.highScore = json.optInt("highScore", 0).coerceAtLeast(0)
				Settings.comboSounds = json.optBoolean("comboSounds", false)
				Settings.quietOnSilent = json.optBoolean("quietOnSilent", true)
				Settings.celebration = validCelebration(json.optString("celebration")) ?: CELEBRATION_ARCADE
				Settings.comboSkin = ComboSkins.valid(json.optString("comboSkin")) ?: ComboSkins.ARCADE
			}.onFailure { log.w("could not read settings: ${it.message}") }
		}

		fun save() = runCatching {
			file.writeText(
				JSONObject()
					.put("intensity", Settings.intensity.toDouble())
					.put("dose", Settings.dose.toDouble())
					.put("allWindows", Settings.allWindows)
					.put("forceLegacy", Settings.forceLegacy)
					.put("legacyCapture", Settings.legacyRipple)
					.put("style", Settings.style)
					.put("particles", Settings.particles)
					.put("onTap", Settings.onTap)
					.put("charge", Settings.charge)
					.put("onSend", Settings.onSend)
					.put("onReceive", Settings.onReceive)
					.put("custom", CustomSprites.toJson())
					.put("filter", Settings.filter)
					.put("screenOn", Settings.screenOn)
					.put("particlesOn", Settings.particlesOn)
					.put("filterOn", Settings.filterOn)
					.put("powerMode", Settings.powerMode)
					.put("powerShake", Settings.powerShake)
					.put("powerCombo", Settings.powerCombo)
					.put("powerParticles", Settings.powerParticles)
					.put("powerCustom", PowerSprites.toJson())
					.put("messageEffects", Settings.messageEffects)
					.put("trackHighScore", Settings.trackHighScore)
					.put("highScore", Settings.highScore)
					.put("comboSounds", Settings.comboSounds)
					.put("quietOnSilent", Settings.quietOnSilent)
					.put("celebration", Settings.celebration)
					.put("comboSkin", Settings.comboSkin)
					.toString(),
			)
		}.onFailure { log.w("could not save settings: ${it.message}") }
		persistSettings = { save() }
		val soundsDir = storageDir
		fun startSounds() = ComboSounds.init(soundsDir) { log.w(it) }
		/** Sounds load when either switch wants them and are released when neither does. */
		fun syncSounds() = if (Settings.comboSounds) startSounds() else ComboSounds.release()
		syncSounds()


		for (cls in listOf(ViewGroup::class.java, View::class.java)) {
			runCatching {
				val method = cls.getDeclaredMethod("dispatchTouchEvent", MotionEvent::class.java)
				unhooks += XposedBridge.hookMethod(method, touchHook)
			}.onFailure { log.w("could not hook ${cls.simpleName}.dispatchTouchEvent: ${it.message}") }
		}
		if (unhooks.isEmpty()) errors.tryEmit(IllegalStateException("Could not hook touch dispatch"))

		// Power mode. Private in TextView, but every text change goes through it on every Android version.
		runCatching {
			val method = android.widget.TextView::class.java.getDeclaredMethod(
				"sendOnTextChanged", CharSequence::class.java,
				Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, Int::class.javaPrimitiveType,
			)
			textUnhook = XposedBridge.hookMethod(method, textHook)
		}.onFailure { log.w("could not hook typing, power mode is off: ${it.message}") }

		if (!SHADERS_SUPPORTED) log.i("Legacy rendering active (API ${Build.VERSION.SDK_INT}, forced ${Settings.forceLegacy})")
		mainHandler.post {
			runCatching { Rendering.validate(); Rendering.filter(activeFilter) }
				.onFailure { log.e("renderer failed: ${it.message}") }
		}
		log.i("hooked ${unhooks.size} touch dispatchers (style ${Settings.style}, particles ${Settings.particles})")

		registerNativeMethod("${manifest.id}.getSettings") { _ -> settingsMap() }
		registerNativeMethod("${manifest.id}.setSettings") { args ->
			val patch = args.firstOrNull() as? Map<*, *> ?: emptyMap<Any, Any>()
			val legacyBefore = Settings.forceLegacy
			val rippleBefore = Settings.legacyRipple
			(patch["forceLegacy"] as? Boolean)?.let { Settings.forceLegacy = it }
			(patch["legacyRipple"] as? Boolean)?.let { Settings.legacyRipple = it }
			val rendererChanged = legacyBefore != Settings.forceLegacy || rippleBefore != Settings.legacyRipple
			(patch["intensity"] as? Number)?.let { Settings.intensity = clampIntensity(it.toFloat()) }
			(patch["dose"] as? Number)?.let { Settings.dose = clampDose(it.toFloat()) }
			(patch["allWindows"] as? Boolean)?.let { Settings.allWindows = it }
			validStyle(patch["style"] as? String)?.let { Settings.style = it }
			validParticles(patch["particles"] as? String)?.let { Settings.particles = it }
			(patch["onTap"] as? Boolean)?.let { Settings.onTap = it }
			(patch["charge"] as? Boolean)?.let { Settings.charge = it }
			(patch["onSend"] as? Boolean)?.let { Settings.onSend = it }
			(patch["onReceive"] as? Boolean)?.let { Settings.onReceive = it }
			(patch["custom"] as? List<*>)?.let { CustomSprites.set(spriteItems(it)) { log.w(it) } }
			(patch["powerCustom"] as? List<*>)?.let { PowerSprites.set(spriteItems(it)) { log.w(it) } }
			val filterBefore = activeFilter
			previewing = patch["preview"] == true
			// Quick Toggles flips the master switches; picking something here takes priority and turns
			// its kind back on. Previews and the page's restore don't count as picking.
			if (!previewing && patch["restore"] != true) {
				if (patch.containsKey("style") && !patch.containsKey("screenOn")) Settings.screenOn = true
				if (patch.containsKey("particles") && !patch.containsKey("particlesOn")) Settings.particlesOn = true
				if (patch.containsKey("filter") && !patch.containsKey("filterOn")) Settings.filterOn = true
			}
			(patch["filter"] as? String)?.takeIf { isFilter(it) }?.let { Settings.filter = it }
			(patch["screenOn"] as? Boolean)?.let { Settings.screenOn = it }
			(patch["particlesOn"] as? Boolean)?.let { Settings.particlesOn = it }
			(patch["filterOn"] as? Boolean)?.let { Settings.filterOn = it }
			val filterNow = activeFilter
			if (rendererChanged || filterNow != filterBefore) {
				surpriseToken++
				mainHandler.post {
					runCatching {
						if (rendererChanged) {
							cancelAll()
							Rendering.validate()
						}
						Rendering.filter(activeFilter)
					}.onFailure { log.e("renderer update failed: ${it.message}") }
				}
			}
			(patch["powerMode"] as? Boolean)?.let { Settings.powerMode = it }
			(patch["powerShake"] as? Boolean)?.let { Settings.powerShake = it }
			(patch["powerCombo"] as? Boolean)?.let { Settings.powerCombo = it }
			validPowerParticles(patch["powerParticles"] as? String)?.let { Settings.powerParticles = it }
			(patch["messageEffects"] as? Boolean)?.let { Settings.messageEffects = it }
			(patch["trackHighScore"] as? Boolean)?.let { Settings.trackHighScore = it }
			if (patch["resetHighScore"] == true) Settings.highScore = 0
			validCelebration(patch["celebration"] as? String)?.let { Settings.celebration = it }
			ComboSkins.valid(patch["comboSkin"] as? String)?.let { Settings.comboSkin = it }
			(patch["comboSounds"] as? Boolean)?.let {
				Settings.comboSounds = it
				syncSounds()
			}
			(patch["quietOnSilent"] as? Boolean)?.let { Settings.quietOnSilent = it }
			// A `preview: true` patch is applied without keeping it: applied here, never written to
			// settings.json, and put back by the page when it closes. A restart reloads the saved file.
			if (patch["preview"] != true) save()
			settingsMap()
		}
		// A settings page with the test pad opened (true) or closed (false). Refreshes the filter, which
		// the pad shows even when the filter switch is off.
		registerNativeMethod("${manifest.id}.setTestPad") { args ->
			val on = args.firstOrNull() as? Boolean ?: false
			if (on != testPad) {
				testPad = on
				mainHandler.post { runCatching { Rendering.filter(activeFilter) } }
			}
			true
		}
		// The new-high-score celebration, for the test button. Plays the voice too when sounds are on.
		registerNativeMethod("${manifest.id}.previewHighScore") { _ ->
			mainHandler.post {
				runCatching { PowerMode.previewCelebration() }.onFailure { log.w("high score preview failed: ${it.message}") }
			}
			true
		}
		// A message effect by name. [force] plays it even with message effects off, for previews.
		registerNativeMethod("${manifest.id}.messageEffect") { args ->
			val name = args.firstOrNull() as? String ?: return@registerNativeMethod false
			val force = args.getOrNull(1) as? Boolean ?: false
			if (name !in MESSAGE_EFFECTS || !messageEffectAvailable(name) || (!Settings.messageEffects && !force)) return@registerNativeMethod false
			mainHandler.post {
				runCatching { playMessageEffect(name) }.onFailure { log.w("$name message effect failed: ${it.message}") }
			}
			true
		}
		// A burst of magic for Sparkle: a random filter for a few seconds, a run of screen effects, or a
		// message effect. [kind] "filter" / "effect" / "message" picks one; anything else is random.
		// [rules] (optional): Shimeji's allow or block list, see [SpellRules].
		registerNativeMethod("${manifest.id}.surprise") { args ->
			val kind = args.firstOrNull() as? String
			val rules = SpellRules.from(args.getOrNull(1))
			mainHandler.post { runCatching { surprise(kind, rules) }.onFailure { log.w("surprise failed: ${it.message}") } }
			true
		}
		registerNativeMethod("${manifest.id}.trigger") { args ->
			val kind = args.firstOrNull() as? String ?: return@registerNativeMethod false
			val force = args.getOrNull(1) as? Boolean ?: false
			if (unhooks.isEmpty()) return@registerNativeMethod false
			mainHandler.post {
				runCatching { trigger(kind, force) }.onFailure { log.w("$kind effect failed: ${it.message}") }
			}
			true
		}
	}

	stop {
		unhooks.forEach { it.unhook() }
		unhooks.clear()
		textUnhook?.unhook()
		textUnhook = null
		ComboSounds.release()
		mainHandler.post(::cancelAll)
		lastDownTime = Long.MIN_VALUE
	}
}
