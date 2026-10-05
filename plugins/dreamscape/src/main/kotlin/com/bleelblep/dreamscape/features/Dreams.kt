package com.bleelblep.dreamscape.features

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.RadialGradient
import android.graphics.Shader
import com.bleelblep.dreamscape.core.Scene
import kotlin.math.sin

/** Shared scene painter; no knowledge of channel routing or gesture owners. */
internal class Dreams {
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	fun draw(c: Canvas, area: RectF, scene: Scene, time: Float, opaque: Boolean = false, density: Float = 1f, atmosphere: Boolean = true) {
		c.save(); c.clipRect(area)
		paint.color = if (opaque) Color.rgb(12, 14, 30) else Color.TRANSPARENT
		if (opaque) c.drawRect(area, paint)
		if (atmosphere) {
			paint.color = scene.color; paint.alpha = (scene.intensity * if (opaque) 200 else 95).toInt()
			c.drawRect(area, paint)
			paint.alpha = 255
			paint.shader = RadialGradient(area.left + area.width() * .8f, area.top + area.height() * .2f,
				area.width().coerceAtLeast(1f), intArrayOf(Color.argb(90, Color.red(scene.color), Color.green(scene.color), Color.blue(scene.color)), Color.TRANSPARENT), null, Shader.TileMode.CLAMP)
			c.drawRect(area, paint); paint.shader = null
		}
		val t = time * scene.speed
		for (i in 0 until scene.particles) {
			val px = ((i * .618034f) % 1f) * area.width()
			val py = ((i * .381966f + t * .025f) % 1f) * area.height()
			val x = area.left + px; val y = area.top + py
			paint.color = scene.color; paint.alpha = if (opaque) 230 else (110 + scene.intensity * 150).toInt()
			paint.strokeWidth = 1.2f * density
			when (scene.world) {
				"ocean" -> { paint.style = Paint.Style.STROKE; c.drawCircle(x + sin(t + i) * 12 * density, area.bottom - py, (3f + i % 7) * density, paint); paint.style = Paint.Style.FILL }
				"storm" -> c.drawLine(x, y, x - 5 * density, y + 22 * density, paint)
				"library" -> c.drawCircle(x + sin(t + i) * 18 * density, y, (1.5f + i % 3) * density, paint)
				else -> { c.drawCircle(x, y, (1f + i % 3) * density, paint); if (i % 7 == 0) { c.drawLine(x - 5 * density, y, x + 5 * density, y, paint); c.drawLine(x, y - 5 * density, x, y + 5 * density, paint) } }
			}
		}
		paint.alpha = 255; c.restore()
	}
}
