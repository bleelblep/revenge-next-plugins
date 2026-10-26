package com.bleelblep.screeneffects

import android.annotation.TargetApi
import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import kotlin.math.max

/**
 * Where the frosted glass filter has been wiped clear: a small bitmap whose alpha is how frosted
 * each spot is (opaque = fully frosted). Finger strokes erase it and it slowly frosts back. Stored
 * relative to the view (0..1 both ways), so every window shows the same wipes. Main thread only.
 */
@TargetApi(33)
internal object FrostMask {
	/** The mask is this many times smaller than the screen; the filter scales it back up smoothly. */
	private const val SCALE = 8
	private const val REGROW_MS = 100L
	/** Alpha added per regrow step: roughly ten seconds from wiped to fully frosted. */
	private const val REGROW_ALPHA = 6

	private var bitmap: Bitmap? = null
	private var canvas: Canvas? = null
	private var lastX = 0f
	private var lastY = 0f
	private var lastRegrow = 0L

	private val density get() = Resources.getSystem().displayMetrics.density

	private val eraser = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
		color = Color.BLACK
		strokeCap = Paint.Cap.ROUND
		strokeJoin = Paint.Join.ROUND
	}

	val active get() = SHADERS_SUPPORTED && FilterEngine.currentId == FILTER_FROST

	private fun ensure(width: Float, height: Float): Bitmap {
		bitmap?.let { return it }
		val b = Bitmap.createBitmap(max(1, (width / SCALE).toInt()), max(1, (height / SCALE).toInt()), Bitmap.Config.ARGB_8888)
		b.eraseColor(Color.BLACK)
		bitmap = b
		canvas = Canvas(b)
		lastRegrow = SystemClock.uptimeMillis()
		return b
	}

	/** The mask as a shader stretched over a [width] x [height] view, frosting back a little first. */
	fun shader(width: Float, height: Float): Shader {
		val b = ensure(width, height)
		val now = SystemClock.uptimeMillis()
		if (now - lastRegrow >= REGROW_MS) {
			lastRegrow = now
			canvas?.drawColor(Color.argb(REGROW_ALPHA, 0, 0, 0))
		}
		return BitmapShader(b, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
			setLocalMatrix(Matrix().apply { setScale(width / b.width, height / b.height) })
			filterMode = BitmapShader.FILTER_MODE_LINEAR
		}
	}

	/** A finger at a screen point; [start] for the first touch of a stroke. */
	fun wipe(root: View, rawX: Float, rawY: Float, start: Boolean) {
		if (root.width <= 0 || root.height <= 0) return
		val b = ensure(root.width.toFloat(), root.height.toFloat())
		val c = canvas ?: return
		val (x, y) = local(root, rawX, rawY)
		val mx = x / root.width * b.width
		val my = y / root.height * b.height
		val radius = 22f * density * (0.8f + 0.25f * Settings.intensity) / SCALE
		eraser.maskFilter = BlurMaskFilter(max(0.5f, radius * 0.45f), BlurMaskFilter.Blur.NORMAL)
		if (start) {
			eraser.style = Paint.Style.FILL
			c.drawCircle(mx, my, radius, eraser)
		} else {
			eraser.style = Paint.Style.STROKE
			eraser.strokeWidth = radius * 2
			c.drawLine(lastX, lastY, mx, my, eraser)
		}
		lastX = mx
		lastY = my
	}

	/** Frosts everything over again (filter switched off, plugin stopped). */
	fun reset() {
		bitmap = null
		canvas = null
	}
}
