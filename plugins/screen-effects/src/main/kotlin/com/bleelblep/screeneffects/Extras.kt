package com.bleelblep.screeneffects

import android.animation.ValueAnimator
import android.content.res.Resources
import android.os.SystemClock
import android.view.View
import android.widget.EditText
import android.widget.TextView
import java.util.WeakHashMap
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

private val density get() = Resources.getSystem().displayMetrics.density

// ---------------------------------------------------------------------------------------------
// Shake
// ---------------------------------------------------------------------------------------------

private val shakes = WeakHashMap<View, ValueAnimator>()

/**
 * Jolts a window root sideways and settles it. Moves the view itself (translation), so it stacks
 * with any RenderEffect. A new shake on the same view replaces the old one. Main thread only.
 */
internal fun shake(view: View, amplitudeDp: Float, durationMs: Long) {
	shakes.remove(view)?.cancel()
	val amp = amplitudeDp * density
	val angle = Random.nextFloat() * 2f * PI.toFloat()
	val dirX = kotlin.math.cos(angle)
	val dirY = sin(angle) * 0.5f
	val animator = ValueAnimator.ofFloat(0f, 1f).apply {
		duration = durationMs
		addUpdateListener {
			val t = it.animatedFraction
			val offset = amp * (1f - t) * (1f - t) * sin(t * 9f * PI.toFloat())
			view.translationX = offset * dirX
			view.translationY = offset * dirY
		}
		addListener(object : android.animation.AnimatorListenerAdapter() {
			override fun onAnimationEnd(animation: android.animation.Animator) {
				view.translationX = 0f
				view.translationY = 0f
				shakes.remove(view)
			}
		})
	}
	shakes[view] = animator
	animator.start()
}

internal fun cancelShakes() {
	for (animator in shakes.values.toList()) animator.cancel()
	shakes.clear()
}

// ---------------------------------------------------------------------------------------------
// Power mode
// ---------------------------------------------------------------------------------------------

/**
 * Sparks from the text cursor on every character typed, a combo counter and a small shake, like
 * the "power mode" editor extensions. Fed from a hook on `TextView.sendOnTextChanged`, which every
 * text change goes through.
 *
 * Only growth in a focused EditText counts. React Native re-sets a controlled input's text after
 * each keystroke, and deletes and programmatic sets fire the same callback; comparing with the last
 * length seen per field filters all of those out.
 */
internal object PowerMode {
	private val lengths = WeakHashMap<TextView, Int>()
	private var combo = 0
	private var lastKeyAt = 0L
	/** A run is under way (keys less than [COMBO_RESET_MS] apart). Rhythm's misses reset [combo] mid-run. */
	private var runActive = false
	/** The run's longest combo: what a record and its celebration count. */
	private var peak = 0

	/** The high score when this run started. */
	private var bestAtStart = 0

	/**
	 * Where this run was last typed, for a celebration once the run is over: the window, the banner's
	 * height (above the text box) and the cursor, all window-local. Weak, so a closed chat is dropped.
	 */
	private var lastRoot: java.lang.ref.WeakReference<View>? = null
	private var lastBannerY = 0f
	private var lastX = 0f
	private var lastY = 0f

	/** How long the keyboard takes to slide away before the arcade finish starts. */
	private const val KEYBOARD_SETTLE_MS = 300L

	/** A pause longer than this ends the combo. */
	private const val COMBO_RESET_MS = 1500L

	/** Beating a record lower than this is not worth a fanfare (the first few runs of a fresh install). */
	private const val MIN_RECORD_TO_CELEBRATE = 5

	/** A run this long ending earns a "combo breaker". */
	private const val BREAKER_AT = 10

	private val endRun = Runnable { onRunEnded() }

	fun onTextChanged(view: TextView, text: CharSequence?) {
		if (view !is EditText) return
		val length = text?.length ?: 0
		val previous = lengths.put(view, length)
		if (previous == null || length <= previous || !view.isFocused) return
		// The layout for the new text is built later in this frame; measure the cursor after it.
		mainHandler.post { runCatching { fire(view) } }
	}

	fun reset() {
		mainHandler.removeCallbacks(endRun)
		lengths.clear()
		combo = 0
		peak = 0
		runActive = false
	}

	/**
	 * The run is over (no key for [COMBO_RESET_MS]). A record set during it is celebrated now, not the
	 * moment it was passed, so the finish never cuts into typing and shows the final count. A record
	 * run gets its celebration instead of "combo breaker", so the two don't talk over each other.
	 */
	private fun onRunEnded() {
		runActive = false
		val record = Settings.trackHighScore && Settings.highScore > bestAtStart
		if (record) persistSettings()
		val root = lastRoot?.get()?.takeIf { it.isAttachedToWindow }
		val skin = ComboSkins.active()
		if (skin != null) {
			if (root != null) {
				val layer = skinLayerFor(root)
				runCatching { skin.onRunEnded(layer, peak, record) }
				if (record && bestAtStart >= MIN_RECORD_TO_CELEBRATE) {
					val scene = runCatching { skin.finish(peak) }.getOrNull()
					if (scene != null) takeover(root) { SkinFinish.play(root, scene) }
				}
			}
		} else if (record) {
			if (bestAtStart >= MIN_RECORD_TO_CELEBRATE && root != null) {
				runCatching { celebrate(root, peak, lastBannerY, lastX, lastY) }
			}
		} else if (peak >= BREAKER_AT && Settings.comboSounds) {
			ComboSounds.comboBreaker()
		}
		combo = 0
		peak = 0
	}

	/**
	 * Closes the keyboard, so a full-screen finish gets the whole screen, then gives the window a
	 * moment to resize before [play] measures it.
	 */
	private fun takeover(root: View, play: () -> Unit) {
		val closed = runCatching {
			val imm = root.context.getSystemService(android.view.inputmethod.InputMethodManager::class.java)
			imm?.hideSoftInputFromWindow(root.windowToken, 0) == true
		}.getOrDefault(false)
		if (closed) mainHandler.postDelayed({ if (root.isAttachedToWindow) runCatching(play) }, KEYBOARD_SETTLE_MS)
		else runCatching(play)
	}

	private fun fire(view: EditText) {
		val layout = view.layout ?: return
		val root = view.rootView ?: return
		val offset = view.selectionEnd.coerceAtLeast(0).coerceAtMost(view.text.length)
		val line = layout.getLineForOffset(offset)
		val loc = IntArray(2)
		view.getLocationOnScreen(loc)
		val rawX = loc[0] + view.totalPaddingLeft - view.scrollX + layout.getPrimaryHorizontal(offset)
		val rawY = loc[1] + view.totalPaddingTop - view.scrollY + (layout.getLineTop(line) + layout.getLineBottom(line)) / 2f

		val now = SystemClock.uptimeMillis()
		val skin = ComboSkins.active()
		val newRun = !runActive || now - lastKeyAt > COMBO_RESET_MS
		val gap = if (newRun) -1L else now - lastKeyAt
		if (newRun) {
			combo = 0
			peak = 0
			runActive = true
			bestAtStart = Settings.highScore
			skin?.let { runCatching { it.startRun() } }
		}
		combo++
		lastKeyAt = now
		mainHandler.removeCallbacks(endRun)
		mainHandler.postDelayed(endRun, COMBO_RESET_MS)

		val (x, y) = local(root, rawX, rawY)
		val layer = layerFor(root)
		val heat = min(combo, 40) / 40f
		// Power mode's own choice, separate from taps; Custom throws its own list. "Skin" leaves it
		// to the skin's effects (Arcade has none, so it gets sparks).
		val particles = Settings.powerParticles
		if (particles != POWER_PARTICLES_SKIN || skin == null) {
			val kind = ParticleKind.of(particles) ?: ParticleKind.SPARKS
			layer.burst(kind, x, y, Settings.intensity * (0.5f + heat), countMul = 0.25f + 0.25f * heat, sprites = PowerSprites.sprites)
		}

		if (skin == null && Settings.comboSounds) {
			ComboSounds.hit(combo)
			ComboSounds.milestone(combo)
		}

		val (fieldX, fieldY) = local(root, loc[0] + view.width.toFloat(), loc[1].toFloat())
		val (fieldLeft, _) = local(root, loc[0].toFloat(), loc[1].toFloat())
		if (skin != null) {
			val skinLayer = skinLayerFor(root)
			val right = fieldX - 8f * density
			val top = fieldY - 8f * density
			val left = fieldLeft + 8f * density
			val hit = runCatching { skin.onKey(skinLayer, Key(x, y, right, top, left, combo, gap, root)) }.getOrDefault(true)
			// A miss (Rhythm) breaks the combo; the run, and its peak, go on.
			if (!hit) combo = 0
			skinLayer.key(skin, right, top, left, combo)
		}
		peak = max(peak, combo)

		// Passing the record only updates it; the celebration waits for the run to end (onRunEnded).
		if (Settings.trackHighScore && combo > Settings.highScore) Settings.highScore = combo
		lastRoot = java.lang.ref.WeakReference(root)
		lastBannerY = fieldY - 70f * density
		lastX = x
		lastY = y
		if (skin == null && Settings.powerCombo && combo >= 3) {
			val best = if (Settings.trackHighScore) Settings.highScore else null
			layer.showCombo(combo, best, fieldX - 8f * density, fieldY - 8f * density)
		}
		if (Settings.powerShake) shake(root, 1.5f + 3f * heat, 120L)
	}

	/**
	 * The new-high-score moment, in the chosen [Settings.celebration] style: the full-screen arcade
	 * finish (Arcade.kt), or the original simple banner with stars, confetti and the announcer.
	 */
	private fun celebrate(root: View, combo: Int, bannerY: Float, x: Float, y: Float) {
		if (Settings.celebration == CELEBRATION_ARCADE) {
			takeover(root) { ArcadeFinish.play(root, combo) }
			return
		}
		val layer = layerFor(root)
		val bannerX = root.width / 2f
		val top = bannerY.coerceAtLeast(60f * density)
		if (Settings.celebration == CELEBRATION_LEVELUP) {
			// Block-game style: LEVEL UP! in the pixel font, and XP orbs from the cursor and the banner.
			layer.showPixelBanner("LEVEL UP!", bannerX, top, LEVEL_UP_COLORS)
			layer.burst(ParticleKind.XP, x, y, 2f)
			layer.burst(ParticleKind.XP, bannerX, top, 1.5f)
			if (Settings.comboSounds) ComboSounds.levelChime()
			return
		}
		layer.showBanner("NEW HIGH SCORE!", bannerX, top)
		layer.burst(ParticleKind.STARS, x, y, 2f)
		layer.burst(ParticleKind.CONFETTI, bannerX, top, 1.2f, countMul = 0.6f)
		if (Settings.comboSounds) ComboSounds.newHighScore()
	}

	/** The test button: the chosen celebration over the topmost window, with your best (or 42). */
	fun previewCelebration() {
		val top = windowRoots(null).lastOrNull() ?: return
		val x = top.width / 2f
		val y = top.height * 0.4f
		val score = Settings.highScore.takeIf { it > 0 } ?: 42
		val skin = ComboSkins.active()
		if (skin != null) takeover(top) { SkinFinish.play(top, skin.finish(score)) }
		else celebrate(top, score, y, x, y + 60f * density)
	}
}

// ---------------------------------------------------------------------------------------------
// Message effects
// ---------------------------------------------------------------------------------------------

/** Wire order matters (see js/lib/messageEffects.ts): new effects go at the end only. */
internal val MESSAGE_EFFECTS = listOf("slam", "shake", "confetti", "love", "glitch", "fireworks", "swirl")

internal fun messageEffectAvailable(name: String): Boolean = name in MESSAGE_EFFECTS &&
	(name != "swirl" || Rendering.available("effect", "swirl"))

private val LEVEL_UP_COLORS = intArrayOf(0xFFEFFF9A.toInt(), 0xFFB6FF3B.toInt(), 0xFF5DBB1E.toInt())

/** Plays a message effect across the whole screen. Main thread only. */
internal fun playMessageEffect(name: String) {
	if (!messageEffectAvailable(name)) return
	val roots = windowRoots(null)
	val top = roots.lastOrNull() ?: return
	val loc = IntArray(2)
	top.getLocationOnScreen(loc)
	val cx = loc[0] + top.width / 2f
	val cy = loc[1] + top.height / 2f
	val strength = Settings.intensity.coerceAtLeast(0.6f)

	fun distortAll(id: String, power: Float) {
		val style = styleOrNull(id) ?: return
		for (view in roots) distort(view, style, cx, cy, power)
	}

	when (name) {
		"slam" -> {
			for (view in roots) shake(view, 16f, 450L)
			distortAll("shockwave", strength * 2.2f)
		}
		"shake" -> for (view in roots) shake(view, 12f, 750L)
		"confetti" -> layerFor(top).rain(ParticleKind.CONFETTI, 70)
		"love" -> layerFor(top).rain(ParticleKind.HEARTS, 28)
		"glitch" -> {
			distortAll("glitch", strength * 2.5f)
			for (view in roots) shake(view, 5f, 300L)
		}
		"swirl" -> distortAll("swirl", strength * 2f)
		"fireworks" -> repeat(4) { i ->
			mainHandler.postDelayed({
				val x = loc[0] + top.width * (0.2f + Random.nextFloat() * 0.6f)
				val y = loc[1] + top.height * (0.15f + Random.nextFloat() * 0.35f)
				val (lx, ly) = local(top, x, y)
				layerFor(top).burst(ParticleKind.STARS, lx, ly, 1.6f)
				layerFor(top).burst(ParticleKind.SPARKS, lx, ly, 1.2f)
			}, i * 280L)
		}
	}
}
