package com.bleelblep.sparkle

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.abs
import kotlin.random.Random

/** A bitmap in a view, mirrored when [flip]; taps go to [onTap] only when they land on the art. */
internal class SpriteView(context: Context, val onTap: () -> Unit) : View(context) {
	var frame: Bitmap? = null
	var flip = false
	private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
	private val dest = RectF()
	private var downInside = false

	override fun onDraw(canvas: Canvas) {
		val bmp = frame ?: return
		dest.set(0f, 0f, width.toFloat(), height.toFloat())
		if (flip) {
			canvas.save()
			canvas.scale(-1f, 1f, width / 2f, 0f)
			canvas.drawBitmap(bmp, null, dest, paint)
			canvas.restore()
		} else canvas.drawBitmap(bmp, null, dest, paint)
	}

	private fun hits(x: Float, y: Float): Boolean {
		val bmp = frame ?: return false
		val sx = bmp.width / width.toFloat()
		val sy = bmp.height / height.toFloat()
		val cx = if (flip) width - x else x
		for (dx in intArrayOf(0, -4, 4)) for (dy in intArrayOf(0, -4, 4)) {
			val px = ((cx * sx).toInt() + dx).coerceIn(0, bmp.width - 1)
			val py = ((y * sy).toInt() + dy).coerceIn(0, bmp.height - 1)
			if ((bmp.getPixel(px, py) ushr 24) > 40) return true
		}
		return false
	}

	override fun onTouchEvent(event: MotionEvent): Boolean {
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> { downInside = hits(event.x, event.y); return downInside }
			MotionEvent.ACTION_UP -> if (downInside) { downInside = false; runCatching { onTap() } }
			MotionEvent.ACTION_CANCEL -> downInside = false
		}
		return downInside
	}
}

/**
 * The Horseman's horse, visiting: it walks in along the floor from one edge, stands, grazes, neighs
 * once, and walks out again after a while. Tapped, it is handed to [Boss], which starts the ride when
 * the Horseman is the pet out; otherwise it rears and leaves. Stepped by Boss.tick. Main thread only.
 */
internal object Companion {
	private enum class S { ENTER, IDLE, GRAZE, NEIGH, REAR, LEAVE }

	private val look by lazy { SheetLook(BossData.horse, Looks.Kind.SEASONAL) }
	private var view: SpriteView? = null
	private var state = S.ENTER
	private var stateAt = 0f
	private var stateFor = 0f
	private var x = 0f
	private var y = 0f
	private var facing = 1
	private var targetX = 0f
	private var born = 0f
	private var neighed = false
	private var scale = 1f
	private var onTap: () -> Boolean = { false }

	val active get() = view != null
	/** Where it stands: x, y, width, height in decor pixels, and which way it faces. */
	fun where(): FloatArray = floatArrayOf(x, y, look.cellW * scale, look.cellH * scale, facing.toFloat())

	private const val LIFETIME = 26f
	private const val WALK_SPEED_DP = 70f

	/**
	 * Walks in on [root], under [below] (the pet), at [px] screen pixels per art pixel, feet on [floor].
	 * [onTap] returns true when the tap was taken for a ride (the horse is then handed over), false to
	 * rear and leave.
	 */
	fun visit(root: ViewGroup, below: View?, px: Float, floor: Float, width: Float, t: Float, onTap: () -> Boolean) {
		cancel()
		scale = px
		this.onTap = onTap
		val v = SpriteView(root.context) { tapped() }
		val w = look.cellW * scale
		val h = look.cellH * scale
		facing = if (Random.nextBoolean()) 1 else -1
		x = if (facing > 0) -w else width
		y = floor - h
		targetX = width * (0.2f + Random.nextFloat() * 0.5f) - w / 2f
		born = t
		neighed = false
		enter(S.ENTER, t, 99f)
		val index = below?.let { root.indexOfChild(it) }?.takeIf { it >= 0 } ?: root.childCount
		root.addView(v, index, FrameLayout.LayoutParams(w.toInt(), h.toInt()))
		v.translationX = x
		v.translationY = y
		view = v
		Sounds.appear()
	}

	/** Puts the horse where the ride ended and walks it off. */
	fun dismissFrom(root: ViewGroup, below: View?, px: Float, atX: Float, floor: Float, face: Int, t: Float) {
		cancel()
		scale = px
		onTap = { false }
		val v = SpriteView(root.context) { }
		val w = look.cellW * scale
		val h = look.cellH * scale
		x = atX
		y = floor - h
		facing = face
		born = t - LIFETIME
		enter(S.LEAVE, t, 99f)
		val index = below?.let { root.indexOfChild(it) }?.takeIf { it >= 0 } ?: root.childCount
		root.addView(v, index, FrameLayout.LayoutParams(w.toInt(), h.toInt()))
		v.translationX = x
		v.translationY = y
		view = v
	}

	fun cancel() {
		val v = view ?: return
		view = null
		(v.parent as? ViewGroup)?.removeView(v)
	}

	fun leave() {
		if (view == null || state == S.LEAVE) return
		enter(S.LEAVE, stateAt + stateFor, 99f)
	}

	private fun enter(s: S, t: Float, seconds: Float) {
		state = s
		stateAt = t
		stateFor = seconds
	}

	private fun tapped() {
		if (view == null || state == S.LEAVE || state == S.ENTER) return
		if (onTap()) return
		Sounds.boing()
		enter(S.REAR, stateAt, 0.9f)
		stateAt = now()
	}

	private fun now() = android.os.SystemClock.uptimeMillis() / 1000f

	/** One step: [floor] is where its feet go (the pet's floor), [width] the room sideways. */
	fun tick(t: Float, dt: Float, floor: Float, width: Float) {
		val v = view ?: return
		val w = look.cellW * scale
		val h = look.cellH * scale
		y = floor - h
		val speed = v.resources.displayMetrics.density * WALK_SPEED_DP
		when (state) {
			S.ENTER -> {
				x += speed * dt * facing
				if ((facing > 0 && x >= targetX) || (facing < 0 && x <= targetX)) { x = targetX; enter(S.IDLE, t, 1.5f + Random.nextFloat() * 2f) }
			}
			S.IDLE, S.GRAZE -> {
				if (t - stateAt >= stateFor) {
					if (!neighed && Random.nextFloat() < 0.5f) { neighed = true; enter(S.NEIGH, t, 0.75f); Sounds.swoosh(0.3f) }
					else enter(if (state == S.IDLE) S.GRAZE else S.IDLE, t, 2f + Random.nextFloat() * 3f)
				}
			}
			S.NEIGH -> if (t - stateAt >= stateFor) enter(S.IDLE, t, 1f + Random.nextFloat() * 2f)
			S.REAR -> if (t - stateAt >= stateFor) { facing = if (x + w / 2f < width / 2f) -1 else 1; enter(S.LEAVE, t, 99f) }
			S.LEAVE -> {
				x += speed * 1.4f * dt * facing
				if (x > width + w || x < -w * 1.5f) { cancel(); return }
			}
		}
		if (state != S.LEAVE && state != S.REAR && t - born > LIFETIME) {
			facing = if (x + w / 2f < width / 2f) -1 else 1
			enter(S.LEAVE, t, 99f)
		}
		val strip = when (state) {
			S.ENTER, S.LEAVE -> "walk"
			S.IDLE -> "idle"
			S.GRAZE -> "graze"
			S.NEIGH -> "neigh"
			S.REAR -> "rear"
		}
		val fps = when (state) { S.IDLE, S.GRAZE -> 4f; S.NEIGH, S.REAR -> 8f; else -> 8f }
		val loop = state != S.NEIGH && state != S.REAR
		v.frame = look.stripFrame(strip, t - stateAt, fps, loop)
		v.flip = facing < 0
		if (v.layoutParams.width != w.toInt()) v.layoutParams = v.layoutParams.apply { this.width = w.toInt(); this.height = h.toInt() }
		v.translationX = x
		v.translationY = y
		v.invalidate()
	}

	/** True when the horse is standing (not walking in or out): the moment a tap can start a ride. */
	val standing get() = view != null && state in setOf(S.IDLE, S.GRAZE, S.NEIGH)
	val facingNow get() = facing
	internal fun pixelScale() = scale
	internal fun horseLook() = look
	internal fun nearEdge(width: Float) = abs(x) < 1f || abs(x + look.cellW * scale - width) < 1f
}
