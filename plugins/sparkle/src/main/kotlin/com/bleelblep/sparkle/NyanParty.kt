package com.bleelblep.sparkle

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.SystemClock
import android.util.Base64
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import java.io.File
import kotlin.random.Random

/**
 * The Nyan party: Nyan Cat grows from where it is to big in the middle of the screen, the classic
 * dark-blue space fades in behind it with pixel stars streaming past, its rainbow runs all the way
 * back to the edge, and the song plays (intro, then the loop). A tap anywhere ends it: the music
 * fades, the space fades and the cat shrinks back to the pet. It ends by itself after [MAX_SECONDS].
 *
 * The music follows the sound settings (off with Sound effects off, quiet on silent) unless [start]
 * is forced by the settings page's test button. It's written out of MusicData.kt to the cache once.
 *
 * Main thread only.
 */
internal object NyanParty {
	private const val GROW_SECONDS = 0.7f
	private const val SHRINK_SECONDS = 0.5f
	private const val MAX_SECONDS = 30f
	/** The original's background. */
	private const val SPACE = 0xFF003366.toInt()

	private var view: PartyView? = null
	private var player: MediaPlayer? = null
	private var onEnd: (() -> Unit)? = null

	val active get() = view != null

	/**
	 * Starts on [root], growing from [from] (the pet's rect, decor coordinates). [onEnd] runs once it
	 * has shrunk back. [force] plays the music whatever the sound settings say.
	 */
	fun start(root: ViewGroup, from: RectF, force: Boolean, onEnd: () -> Unit) {
		if (view != null) return
		this.onEnd = onEnd
		val v = PartyView(root.context, RectF(from))
		root.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		view = v
		val musicAllowed = force || (Settings.sounds && !(Settings.quietOnSilent && Sounds.silenced()))
		if (musicAllowed) runCatching { play(root.context) }.onFailure { android.util.Log.w("Sparkle", "party music failed", it) }
	}

	/** Ends it (a tap, the time limit, or the plugin stopping): shrink back, fade the music. */
	fun stop() {
		view?.finish()
	}

	/** Gone at once, for the plugin stopping. */
	fun cancel() {
		stopMusic()
		view?.let { (it.parent as? ViewGroup)?.removeView(it) }
		view = null
		onEnd = null
	}

	private fun ended() {
		view?.let { (it.parent as? ViewGroup)?.removeView(it) }
		view = null
		stopMusic()
		val done = onEnd
		onEnd = null
		runCatching { done?.invoke() }
	}

	// ------------------------------------------------------------------------------------------
	// Music
	// ------------------------------------------------------------------------------------------

	private fun file(context: Context, name: String): File {
		val f = File(context.cacheDir, "shimeji_$name")
		if (!f.exists() || f.length() == 0L) {
			val chunks = MusicData.files.getValue(name)
			f.writeBytes(Base64.decode(chunks.joinToString(""), Base64.DEFAULT))
		}
		return f
	}

	private fun volume() = (Settings.volume / 100f).coerceIn(0f, 1f)

	private fun newPlayer(path: String) = MediaPlayer().apply {
		setAudioAttributes(
			AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build(),
		)
		setDataSource(path)
		prepare()
		setVolume(volume(), volume())
	}

	private fun play(context: Context) {
		val intro = newPlayer(file(context, "nyan_intro.ogg").path)
		val loop = newPlayer(file(context, "nyan_loop.ogg").path).apply { isLooping = true }
		// Intro, then the loop with no gap.
		intro.setNextMediaPlayer(loop)
		intro.setOnCompletionListener {
			it.release()
			player = loop
			pending = null
		}
		player = intro
		pending = loop
		intro.start()
	}

	/** The loop while the intro is still playing, so both are released on stop. */
	private var pending: MediaPlayer? = null

	private fun fadeMusic(k: Float) {
		val v = volume() * (1f - k).coerceIn(0f, 1f)
		runCatching { player?.setVolume(v, v) }
		runCatching { pending?.setVolume(v, v) }
	}

	private fun stopMusic() {
		for (p in listOf(player, pending)) runCatching {
			p?.stop()
			p?.release()
		}
		player = null
		pending = null
	}

	// ------------------------------------------------------------------------------------------
	// The view
	// ------------------------------------------------------------------------------------------

	private class Star(var x: Float, val y: Float, val speed: Float, val phase: Int)

	@SuppressLint("ViewConstructor")
	private class PartyView(context: Context, val from: RectF) : View(context) {
		private val paint = Paint().apply { isAntiAlias = false; isFilterBitmap = false }
		private val dest = RectF()
		private val stars = ArrayList<Star>()
		private val born = now()
		private var finishedAt = -1f

		private fun now() = SystemClock.uptimeMillis() / 1000f

		fun finish() {
			if (finishedAt < 0f) finishedAt = now()
		}

		@SuppressLint("ClickableViewAccessibility")
		override fun onTouchEvent(event: MotionEvent): Boolean {
			if (event.actionMasked == MotionEvent.ACTION_UP) finish()
			return true
		}

		private fun ease(k: Float) = 1f - (1f - k) * (1f - k) * (1f - k)

		override fun onDraw(canvas: Canvas) {
			val t = now()
			if (finishedAt < 0f && t - born > MAX_SECONDS) finish()
			// 0 = the pet as it was, 1 = full party.
			val level = if (finishedAt < 0f) ease(((t - born) / GROW_SECONDS).coerceIn(0f, 1f))
			else 1f - ease(((t - finishedAt) / SHRINK_SECONDS).coerceIn(0f, 1f))
			if (finishedAt >= 0f) fadeMusic(1f - level)
			if (finishedAt >= 0f && level <= 0f) {
				post { ended() }
				return
			}

			val w = width.toFloat()
			val h = height.toFloat()
			val look = NyanLook
			// Big: the cat (not its padding) about 60% of the narrower side, in the middle.
			val bigPx = (minOf(w, h) * 0.6f) / look.refW
			val bigW = look.cellW * bigPx
			val bigH = look.cellH * bigPx
			val bx = (w - bigW) / 2f
			val by = (h - bigH) / 2f
			val cx = from.left + (bx - from.left) * level
			val cy = from.top + (by - from.top) * level
			val cw = from.width() + (bigW - from.width()) * level
			val ch = from.height() + (bigH - from.height()) * level
			val px = cw / look.cellW

			// Space.
			paint.color = SPACE
			paint.alpha = (255 * level).toInt()
			canvas.drawRect(0f, 0f, w, h, paint)

			// Stars streaming right to left, twinkling as they go.
			if (stars.isEmpty()) repeat(14) { stars.add(newStar(w, h, Random.nextFloat() * w)) }
			paint.color = 0xFFFFFFFF.toInt()
			paint.alpha = (255 * level).toInt()
			val starPx = maxOf(2f, minOf(w, h) / 160f)
			for (s in stars) {
				s.x -= s.speed * starPx
				if (s.x < -starPx * 8) s.x = w + starPx * 8
				val reach = ((t * 8f).toInt() + s.phase) % 4
				canvas.drawRect(s.x, s.y, s.x + starPx, s.y + starPx, paint)
				for (r in 1..reach) {
					val o = (r + 1) * starPx
					canvas.drawRect(s.x - o, s.y, s.x - o + starPx, s.y + starPx, paint)
					canvas.drawRect(s.x + o, s.y, s.x + o + starPx, s.y + starPx, paint)
					canvas.drawRect(s.x, s.y - o, s.x + starPx, s.y - o + starPx, paint)
					canvas.drawRect(s.x, s.y + o, s.x + starPx, s.y + o + starPx, paint)
				}
			}

			// The rainbow, from the cat's rear all the way to the left edge.
			paint.alpha = 255
			val stripe = px * 3f
			val step = px * 8f
			val wave = ((t * 6f).toInt() % 2)
			val rearX = cx + 10f * px
			val midY = cy + 16f * px
			var i = 0
			var right = rearX
			while (right > -step) {
				val lift = if ((i + wave) % 2 == 0) 0f else px
				val top = midY - stripe * 3f + lift
				for ((k, colour) in TrailView.COLOURS.withIndex()) {
					paint.color = colour
					paint.alpha = (255 * level).toInt()
					canvas.drawRect(right - step, top + k * stripe, right + 1f, top + (k + 1) * stripe, paint)
				}
				right -= step
				i++
			}

			// The cat, flying.
			paint.alpha = 255
			val frame = look.frame(Anim.WALK, t - born)
			if (frame != null) {
				dest.set(cx, cy, cx + cw, cy + ch)
				canvas.drawBitmap(frame, null, dest, paint)
			}
			postInvalidateOnAnimation()
		}

		private fun newStar(w: Float, h: Float, x: Float) =
			Star(x, Random.nextFloat() * h, 2f + Random.nextFloat() * 3f, Random.nextInt(4))
	}
}
