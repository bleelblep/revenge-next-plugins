package com.bleelblep.sparkle

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.SystemClock
import android.util.Base64
import java.io.File
import java.util.concurrent.Executors
import kotlin.random.Random

/**
 * Sparkle's sound effects: 8-bit blips, boings and chimes (sources in sounds/LICENSE.txt).
 *
 * As in VFX, the files ship base64-encoded in [SoundData] (plugin zips carry no other files). They are
 * written to the plugin's storage once, off the main thread, and loaded into a SoundPool, which is made
 * for short, low-latency game sounds. Playback follows the media volume, scaled by [Settings.volume],
 * and stays silent while [Settings.sounds] is off.
 *
 * The media stream ignores the ringer switch, so silent and vibrate would not stop these on their own:
 * [silenced] checks the ringer mode before every sound unless [Settings.quietOnSilent] is off.
 */
internal object Sounds {
	private val worker = Executors.newSingleThreadExecutor { Thread(it, "Sparkle-sounds").apply { isDaemon = true } }

	@Volatile private var pool: SoundPool? = null
	private val ids = HashMap<String, Int>()
	/** When each sound last played, so bursts (pops, hearts) don't pile up into noise. */
	private val lastPlayed = HashMap<String, Long>()
	private var lastVoiceSound = Long.MIN_VALUE / 2
	fun quietNow() { pool?.autoPause() }
	@Volatile private var audio: AudioManager? = null

	/** Hands over a context for the ringer check; Pet calls it once a view is attached. */
	fun attach(context: Context) {
		if (audio == null) audio = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
	}

	/** True while the phone is on silent or vibrate. */
	fun silenced(): Boolean = runCatching {
		audio?.ringerMode?.let { it != AudioManager.RINGER_MODE_NORMAL } ?: false
	}.getOrDefault(false)

	/** Loads everything in the background; plays nothing until a sound has finished loading. */
	fun init(storageDir: File, onError: (String) -> Unit) {
		if (pool != null) return
		worker.execute {
			runCatching {
				val dir = File(storageDir, "sounds").apply { mkdirs() }
				val attributes = AudioAttributes.Builder()
					.setUsage(AudioAttributes.USAGE_GAME)
					.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
					.build()
				val soundPool = SoundPool.Builder().setMaxStreams(5).setAudioAttributes(attributes).build()
				for ((name, chunks) in SoundData.files + GaryData.sounds) {
					val bytes = Base64.decode(chunks.joinToString(""), Base64.DEFAULT)
					val file = File(dir, name)
					if (!file.exists() || file.length() != bytes.size.toLong()) file.writeBytes(bytes)
					synchronized(ids) { ids[name.removeSuffix(".ogg")] = soundPool.load(file.absolutePath, 1) }
				}
				pool = soundPool
			}.onFailure { onError("sounds unavailable: ${it.message}") }
		}
	}

	fun release() {
		val p = pool ?: return
		pool = null
		synchronized(ids) { ids.clear() }
		worker.execute { runCatching { p.release() } }
	}

	/**
	 * Plays [name] at [volume] (before the setting), pitched by [rate] with a little random wobble so
	 * repeats don't sound mechanical. [gapMs] skips it if it played more recently than that.
	 */
	private fun play(name: String, volume: Float = 1f, rate: Float = 1f, gapMs: Long = 0, force: Boolean = false) {
		if (!Settings.sounds) return
		if (Pet.voiceRestricted) return
		if (!force && Settings.quietOnSilent && silenced()) return
		val p = pool ?: return
		// Nyan Cat, the cats and the dogs have their own versions of some sounds (sounds/nyan_*.ogg,
		// cat_*.ogg, dog_*.ogg); the rest are shared.
		val prefix = when (Looks.kind) {
			Looks.Kind.NYAN -> "nyan_"
			Looks.Kind.CAT -> "cat_"
			Looks.Kind.DOG -> "dog_"
			Looks.Kind.UNICORN -> null
			Looks.Kind.GARY -> null
			Looks.Kind.SEASONAL -> null
		}
		val gary = Looks.kind == Looks.Kind.GARY
		val voice = if (gary) GaryLook.voice(name) else null
		// Sleep stays quiet; bubbles keep their physical pop sounds. Gary's vocal
		// events use his original recordings at their original pitch and speed.
		if (gary && name == "sleep") return
		val id = synchronized(ids) { if (voice != null) ids[voice] else prefix?.let { ids[it + name] } ?: ids[name] } ?: return
		val gap = if (voice != null) maxOf(gapMs, 1500L) else gapMs
		val gapKey = if (voice != null) "gary_voice" else name
		if (gap > 0 && !force) {
			val now = SystemClock.uptimeMillis()
			if (now - (lastPlayed[gapKey] ?: 0L) < gap) return
			lastPlayed[gapKey] = now
		}
		val v = (volume * Settings.volume / 100f).coerceIn(0f, 1f)
		if (v <= 0f) return
		if (Pet.voiceConnected && Settings.voiceMode == 1) {
			val now = SystemClock.uptimeMillis()
			if (now - lastVoiceSound < Settings.voiceCooldown * 1000L) return
			lastVoiceSound = now
		}
		val r = if (voice != null) 1f else (rate * (0.96f + Random.nextFloat() * 0.08f)).coerceIn(0.5f, 2f)
		runCatching { p.play(id, v, v, 1, 0, r) }
	}

	private fun oneOf(vararg names: String) = names[Random.nextInt(names.size)]

	/** [force] plays it even on silent: the settings page's test button. */
	fun appear(force: Boolean = false) = play("appear", 0.8f, force = force)
	fun leave() = play("leave", 0.8f)
	fun tap() = play("tap", 0.6f)
	/** A hop; bigger hops go a little lower. */
	fun hop(strength: Float) = play("hop", 0.55f, 1.15f - strength.coerceIn(0f, 1f) * 0.25f)
	fun boing() = play("boing", 0.8f)
	fun pickup() = play("pickup", 0.55f)
	/** Thrown or flung: louder and higher the faster it goes. [power] is 0..1. */
	fun swoosh(power: Float) = play("swoosh", 0.45f + power * 0.4f, 0.9f + power * 0.25f, gapMs = 250)
	/** Hitting a wall or the floor; [power] is 0..1. */
	fun thud(power: Float) = play(oneOf("thud_0", "thud_1", "thud_2"), 0.4f + power * 0.5f, 1.1f - power * 0.2f, gapMs = 90)
	fun grab() = play("grab", 0.6f)
	fun slip() = play("slip", 0.6f)
	fun dizzy() = play("dizzy", 0.6f, gapMs = 1500)
	/** One heart while petting; [step] climbs the pitch as the petting goes on. */
	fun heart(step: Int) = play("heart", 0.35f, 1f + (step % 8) * 0.06f, gapMs = 120)
	fun happy() = play("happy", 0.6f)
	fun sleep() = play("sleep", 0.45f)
	fun wake() = play("wake", 0.6f)
	fun gulp() = play("gulp", 0.6f)
	fun spit() = play("spit", 0.65f)
	fun ding() = play("ding", 0.6f)
	fun alert() = play("alert", 0.7f)
	fun twinkle() = play("twinkle", 0.55f)
	fun chime() = play("chime", 0.55f)
	fun sad() = play("sad", 0.6f)
	fun charge() = play("charge", 0.6f)
	fun lowBattery() = play("low_battery", 0.6f)
	/** A bubble leaving the wand. */
	fun bloop() = play("bloop", 0.5f, 0.9f + Random.nextFloat() * 0.3f, gapMs = 80)
	/** A bubble popping; small ones pop higher. [size] is 0..1. */
	fun pop(size: Float) = play(oneOf("pop_0", "pop_1"), 0.3f, 1.35f - size.coerceIn(0f, 1f) * 0.5f, gapMs = 70)
	/** A speech bubble appearing. */
	fun talk() = play("talk", 0.3f, 1f + Random.nextFloat() * 0.3f)
}
