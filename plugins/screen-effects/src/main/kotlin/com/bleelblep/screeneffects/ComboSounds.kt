package com.bleelblep.screeneffects

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.util.Base64
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.min
import kotlin.random.Random

/**
 * Power mode's sounds. The Arcade skin's fighting-game set: a punch per keystroke, an announcer at
 * combo milestones, "combo breaker" when a long combo ends, and "new highscore" when you beat your
 * best, all CC0 by Kenney (sounds/LICENSE.txt). The other combo skins (ComboSkins.kt) play their
 * own, synthesised by tools/make_skin_sounds.py, through [sfx].
 *
 * The files ship base64-encoded in [SoundData] (plugin zips carry no other files). They are written
 * to the plugin's storage once, off the main thread, and loaded into a SoundPool, which is made for
 * short, low-latency game sounds. Playback follows the media volume, and stays quiet while the
 * phone is on silent or vibrate when [Settings.quietOnSilent] is on.
 */
internal object ComboSounds {
	private val worker = Executors.newSingleThreadExecutor { Thread(it, "ScreenEffects-sounds").apply { isDaemon = true } }

	@Volatile private var pool: SoundPool? = null
	private val ids = HashMap<String, Int>()

	private val PUNCHES_MEDIUM = listOf("punch_medium_0", "punch_medium_1", "punch_medium_2")
	private val PUNCHES_HEAVY = listOf("punch_heavy_0", "punch_heavy_1")

	/** Announcer line per combo reached. "Flawless victory" is kept for the arcade finish only. */
	private val MILESTONES = mapOf(
		10 to "combo",
		25 to "level_up",
		100 to "winner",
	)

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
				val soundPool = SoundPool.Builder().setMaxStreams(6).setAudioAttributes(attributes).build()
				for ((name, chunks) in SoundData.files) {
					val bytes = Base64.decode(chunks.joinToString(""), Base64.DEFAULT)
					val file = File(dir, name)
					if (!file.exists() || file.length() != bytes.size.toLong()) file.writeBytes(bytes)
					synchronized(ids) { ids[name.removeSuffix(".ogg")] = soundPool.load(file.absolutePath, 1) }
				}
				pool = soundPool
			}.onFailure { onError("combo sounds unavailable: ${it.message}") }
		}
	}

	fun release() {
		val p = pool ?: return
		pool = null
		synchronized(ids) { ids.clear() }
		worker.execute { runCatching { p.release() } }
	}

	/** The app's audio service, for the ringer mode. Looked up once; null means never silenced. */
	private val audio: AudioManager? by lazy {
		runCatching {
			val app = Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as? Context
			app?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
		}.getOrNull()
	}

	/** True while the phone is on silent or vibrate. */
	private fun silenced(): Boolean = runCatching {
		audio?.ringerMode?.let { it != AudioManager.RINGER_MODE_NORMAL } ?: false
	}.getOrDefault(false)

	private fun play(name: String, volume: Float, rate: Float = 1f) {
		val p = pool ?: return
		if (Settings.quietOnSilent && silenced()) return
		val id = synchronized(ids) { ids[name] } ?: return
		p.play(id, volume, volume, 1, 0, rate.coerceIn(0.5f, 2f))
	}

	/** A punch for one keystroke: heavier and higher-pitched as the combo climbs. */
	fun hit(combo: Int) {
		val heavy = combo >= 25
		val names = if (heavy) PUNCHES_HEAVY else PUNCHES_MEDIUM
		val rate = 0.9f + min(combo, 60) * 0.008f + Random.nextFloat() * 0.06f
		play(names[Random.nextInt(names.size)], if (heavy) 0.6f else 0.45f, rate)
	}

	/** The announcer, if [combo] is a milestone. */
	fun milestone(combo: Int) {
		MILESTONES[combo]?.let { play(it, 1f) }
	}

	fun comboBreaker() = play("combo_breaker", 1f)

	fun newHighScore() = play("new_highscore", 1f)

	/** The finish's slam and stamp: the heaviest punch, low and loud. */
	fun impact() = play("punch_heavy_0", 1f, 0.8f)

	/** One tick of the finish's hit counter, climbing in pitch. */
	fun tick(step: Int) = play(PUNCHES_MEDIUM[step % PUNCHES_MEDIUM.size], 0.5f, 1f + min(step, 10) * 0.05f)

	fun flawless() = play("flawless_victory", 1f)

	/** The level-up celebration's chime. */
	fun levelChime() = play("level_chime", 0.9f)

	/**
	 * A combo skin's sound by name (sounds/<name>.ogg, see tools/make_skin_sounds.py). [rate] is
	 * clamped to SoundPool's 0.5..2. Silent while combo sounds are off.
	 */
	fun sfx(name: String, volume: Float = 1f, rate: Float = 1f) {
		if (!Settings.comboSounds) return
		play(name, volume.coerceIn(0f, 1f), rate)
	}

}
