package com.bleelblep.screeneffects

import android.content.res.Resources
import android.graphics.Canvas
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin

/**
 * How a combo counter moves, so it never sits frozen in its corner. Three layers, all decaying back to
 * rest: a jolt in a random direction on each hit (harder as the combo climbs), a springy bounce, and
 * a slow float while the combo is alive. Each theme scales them to fit ([ComboSkin.motion]).
 *
 * The counter keeps its corner: following the cursor would cover the text being typed.
 */
internal class Motion(
	/** The per-hit jolt. */
	val shake: Float,
	/** Degrees of wobble per hit. */
	val tilt: Float,
	/** The springy hop and squash per hit. */
	val bounce: Float,
	/** The idle float while the combo lasts. */
	val sway: Float,
	/** Snap to a new random offset every few frames instead of a smooth wobble (glitchy text). */
	val jitter: Boolean = false,
)

internal object CounterMotion {
	private val dp get() = Resources.getSystem().displayMetrics.density

	/** Arcade's counter (Particles.kt). */
	val ARCADE = Motion(shake = 1f, tilt = 2f, bounce = 1f, sway = 0.5f)

	/** A stable pseudo-random number in -1..1 for this hit and channel. */
	private fun noise(seed: Long, channel: Int): Float {
		var x = seed * 6364136223846793005L + channel * 1442695040888963407L
		x = x xor (x ushr 33)
		x *= -0x4b47d5b1b2d9a1d1L
		x = x xor (x ushr 29)
		return ((x ushr 40) and 0xFFFF).toFloat() / 32767.5f - 1f
	}

	/**
	 * Moves [c] for a counter last hit at [hitAt] with [combo] hits, pivoting at ([px], [py]).
	 * The caller saves and restores the canvas around it.
	 */
	fun apply(c: Canvas, m: Motion, hitAt: Long, combo: Int, now: Long, px: Float, py: Float) {
		val t = (now - hitAt).coerceAtLeast(0L).toFloat()
		val heat = min(combo, 40) / 40f
		val d = dp

		var dx = 0f
		var dy = 0f
		var rotate = 0f
		var scale = 1f

		// The jolt: kicked in a random direction, then rings down in ~200 ms.
		val kick = exp(-t / 75f)
		if (kick > 0.01f && m.shake > 0f) {
			val amp = (1.5f + 5.5f * heat) * d * m.shake * kick
			if (m.jitter) {
				// A new offset every ~45 ms, like a glitching terminal.
				val step = (t / 45f).toLong()
				dx += amp * noise(hitAt + step, 1)
				dy += amp * 0.6f * noise(hitAt + step, 2)
			} else {
				val ring = cos(t * 0.09f)
				dx += amp * noise(hitAt, 1) * ring
				dy += amp * noise(hitAt, 2) * ring
			}
		}

		// The wobble: a tilt that swings back and forth as it settles.
		if (m.tilt > 0f) {
			val side = if (noise(hitAt, 3) < 0f) -1f else 1f
			rotate += side * m.tilt * (0.5f + heat) * exp(-t / 110f) * cos(t * 0.06f)
		}

		// The bounce: a hop up with a little squash, springing back.
		if (m.bounce > 0f) {
			val spring = exp(-t / 120f)
			dy -= m.bounce * (2.5f + 4f * heat) * d * spring * cos(t * 0.05f).coerceAtLeast(0f)
			scale += 0.07f * m.bounce * spring * cos(t * 0.08f)
		}

		// The float: slow and constant while the counter shows.
		if (m.sway > 0f) {
			val s = now.toFloat()
			dx += sin(s / 650f) * 1.6f * d * m.sway
			dy += cos(s / 900f) * 1.1f * d * m.sway
			rotate += sin(s / 800f) * 1.2f * m.sway
		}

		if (dx != 0f || dy != 0f) c.translate(dx, dy)
		if (rotate != 0f) c.rotate(rotate, px, py)
		if (scale != 1f) c.scale(scale, scale, px, py)
	}
}
