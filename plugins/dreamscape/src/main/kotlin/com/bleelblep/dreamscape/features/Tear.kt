package com.bleelblep.dreamscape.features

import android.graphics.*
import com.bleelblep.dreamscape.core.*
import kotlin.math.*

internal class Tear : Feature {
	var opening = 0f
	var target = 0f
	private var velocity = 0f
	var centerY = .5f
	private val painter = Dreams()
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	fun step(dt: Float, reduced: Boolean) {
		if (reduced) { opening = target; velocity = 0f; return }
		velocity += ((target - opening) * 180 - velocity * 24) * dt
		opening = (opening + velocity * dt).coerceIn(0f, .9f)
		if (abs(opening - target) < .001f && abs(velocity) < .005f) { opening = target; velocity = 0f }
	}
	override fun draw(canvas: Canvas, frame: Frame) {
		if (opening < .002f) return
		val w = frame.width; val h = frame.height
		val extent = w * opening
		val cy = h * centerY
		val path = Path().apply {
			moveTo(w, cy - h * .32f)
			for (i in 0..12) lineTo(w - extent * sin(i / 12f * PI).toFloat() + (if (i % 2 == 0) 0f else 7 * frame.density), cy - h * .32f + i * h * .64f / 12)
			lineTo(w, cy + h * .32f); close()
		}
		canvas.save(); canvas.clipPath(path)
		painter.draw(canvas, RectF(w - extent, cy - h * .32f, w, cy + h * .32f), frame.config.scene, frame.time, true)
		canvas.restore()
		paint.color = frame.config.scene.color; paint.style = Paint.Style.STROKE; paint.strokeWidth = 3 * frame.density
		canvas.drawPath(path, paint); paint.style = Paint.Style.FILL
	}
	override fun clear() { opening = 0f; target = 0f; velocity = 0f }
}
