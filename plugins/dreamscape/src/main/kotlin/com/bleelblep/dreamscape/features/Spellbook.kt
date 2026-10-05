package com.bleelblep.dreamscape.features

import android.graphics.*
import kotlin.math.*

internal object Gesture {
	fun recognize(points: List<PointF>): String? {
		if (points.size < 8) return null
		val minX = points.minOf { it.x }; val maxX = points.maxOf { it.x }
		val minY = points.minOf { it.y }; val maxY = points.maxOf { it.y }
		val w = maxX - minX; val h = maxY - minY
		val span = max(w, h)
		if (span < 24 || w < 10 || h < 10) return null
		val first = points.first(); val last = points.last()
		val length = points.zipWithNext().sumOf { (a, b) -> hypot(b.x - a.x, b.y - a.y).toDouble() }.toFloat()
		if (hypot(last.x - first.x, last.y - first.y) < span * .28f && length > span * 2.2f && w / h in .5f..2f) return "portal"
		val bottom = points.indices.maxBy { points[it].y }
		if (bottom > points.size / 5 && bottom < points.size * 4 / 5 &&
			points[bottom].y - first.y > h * .65f && points[bottom].y - last.y > h * .65f && abs(last.x - first.x) > w * .6f) return "prism"
		var turns = 0; var direction = 0; var anchor = first.x
		for (p in points) if (abs(p.x - anchor) > w * .18f) {
			val sign = if (p.x > anchor) 1 else -1
			if (direction != 0 && sign != direction) turns++
			direction = sign; anchor = p.x
		}
		return if (turns >= 2 && length > span * 1.6f) "meteor" else null
	}
}
internal class Spellbook {
	var active = false
	val points = ArrayList<PointF>()
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	var message = "Draw a circle, zigzag or V"
	fun begin() { active = true; points.clear(); message = "Draw a circle, zigzag or V" }
	fun add(x: Float, y: Float) { if (points.size < 512) points.add(PointF(x, y)) }
	fun finish(): String? { val spell = Gesture.recognize(points); message = spell?.let { "Cast $it" } ?: "Symbol not recognized"; active = false; points.clear(); return spell }
	fun cancel() { active = false; points.clear() }
	fun draw(canvas: Canvas, width: Float, height: Float, density: Float) {
		if (!active) return
		paint.color = 0xBB181322.toInt(); canvas.drawRect(0f, 0f, width, height, paint)
		paint.color = Color.WHITE; paint.textSize = 16 * density
		canvas.drawText(message, 24 * density, 80 * density, paint)
		canvas.drawText("Tap the top-right × to cancel", 24 * density, 108 * density, paint)
		canvas.drawText("×", width - 38 * density, 44 * density, paint)
		paint.color = 0xFFC4AAFF.toInt(); paint.strokeWidth = 3 * density
		for ((a, b) in points.zipWithNext()) canvas.drawLine(a.x * density, a.y * density, b.x * density, b.y * density, paint)
	}
}
