package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The bubble screen effects for Android 12 and older (and phones whose shaders won't compile),
 * drawn on the bubble layer instead of as a RenderEffect. Same maths as [Bubbles]' shaders, one
 * bitmap pixel per grid cell, screen-blended over the window like the shader's output:
 * - soap film: the thin-film colours, edge strength and bright rim. No wobble: bending the screen
 *   needs its pixels, which an overlay can't read.
 * - rainbow (Nyan Cat): identical bands, steps and stars; it was always a pixel grid.
 * - pops: a lens-like ring (bright outside edge, darker inside) where the shader bends one.
 *
 * Main thread only.
 */
internal object LegacyBubbleFx {
	private val screen = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN) }
	/** The film is smooth colour, so it is stretched with filtering; the rainbow keeps hard pixels. */
	private val filmPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN) }
	private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
	private val dest = RectF()

	private var filmCells: Bitmap? = null
	private var filmPixels = IntArray(0)
	private var rainbowCells: Bitmap? = null
	private var rainbowPixels = IntArray(0)
	private val rainbowColours = intArrayOf(0xFF0000, 0xFF9900, 0xFFFF00, 0x33FF00, 0x0099FF, 0x6633FF)

	private fun cells(old: Bitmap?, gw: Int, gh: Int, set: (Bitmap) -> Unit): Bitmap =
		if (old != null && old.width == gw && old.height == gh) old
		else Bitmap.createBitmap(gw, gh, Bitmap.Config.ARGB_8888).also(set)

	/** The FILM shader's colours at [amount] (0..1, already eased), [time] in seconds. */
	fun drawFilm(canvas: Canvas, w: Float, h: Float, density: Float, time: Float, amount: Float) {
		if (amount <= 0f || w <= 0f || h <= 0f) return
		val cell = 10f * density
		val gw = max(1, ceil(w / cell).toInt())
		val gh = max(1, ceil(h / cell).toInt())
		val bitmap = cells(filmCells, gw, gh) { filmCells = it; filmPixels = IntArray(gw * gh) }
		for (qy in 0 until gh) {
			val v = (qy + 0.5f) * cell / h
			for (qx in 0 until gw) {
				val u = (qx + 0.5f) * cell / w
				val du = u - 0.5f
				val dv = v - 0.5f
				val swirl = sin(u * 3.1f + time * 0.55f) + sin(v * 4.3f - time * 0.45f) +
					sin((u + v) * 5.7f + time * 0.8f) + sin(sqrt(du * du + dv * dv) * 9f - time * 0.6f)
				val thickness = swirl * 0.18f + time * 0.05f
				val cx = u * 2f - 1f
				val cy = v * 2f - 1f
				val edge = smooth(0.35f, 1.15f, sqrt(cx * cx * 0.81f + cy * cy))
				val rim = smooth(0.93f, 1f, max(kotlin.math.abs(cx), kotlin.math.abs(cy))) * 0.25f * amount
				val strength = amount * (0.16f + 0.44f * edge)
				// Screen-blending colour*strength and then adding the rim is, as one screen layer,
				// 1 - (1 - c*strength) * (1 - rim) per channel.
				val r = 1f - (1f - filmChannel(thickness, 0f) * strength) * (1f - rim)
				val g = 1f - (1f - filmChannel(thickness, 0.33f) * strength) * (1f - rim)
				val b = 1f - (1f - filmChannel(thickness, 0.67f) * strength) * (1f - rim)
				filmPixels[qy * gw + qx] = premultiplied(r, g, b)
			}
		}
		bitmap.setPixels(filmPixels, 0, gw, 0, 0, gw, gh)
		dest.set(0f, 0f, gw * cell, gh * cell)
		canvas.drawBitmap(bitmap, null, dest, filmPaint)
	}

	private fun filmChannel(thickness: Float, offset: Float) =
		0.5f + 0.5f * cos(6.2831853f * (thickness + offset))

	/** The RAINBOW shader, cell for cell. */
	fun drawRainbow(canvas: Canvas, w: Float, h: Float, density: Float, time: Float, amount: Float) {
		if (amount <= 0f || w <= 0f || h <= 0f) return
		val cell = 6f * density
		val gw = max(1, ceil(w / cell).toInt())
		val gh = max(1, ceil(h / cell).toInt())
		val bitmap = cells(rainbowCells, gw, gh) { rainbowCells = it; rainbowPixels = IntArray(gw * gh) }
		val step = floor(time * 6f).toInt()
		val starTick = floor(time * 3f).toLong()
		for (qy in 0 until gh) {
			val cy = ((qy + 0.5f) * cell / h) * 2f - 1f
			for (qx in 0 until gw) {
				val cx = ((qx + 0.5f) * cell / w) * 2f - 1f
				val edge = smooth(0.35f, 1.15f, sqrt(cx * cx * 0.81f + cy * cy))
				val lift = ((qx / 8) + step) and 1
				val band = (qx * 0.6f + qy + lift) / 4f - time * 1.5f
				val index = ((floor(band).toInt() % 6) + 6) % 6
				var alpha = amount * (0.10f + 0.40f * edge)
				var rgb = rainbowColours[index]
				if (edge > 0f && hash(qx * 73856093L xor qy * 19349663L xor starTick * 83492791L) > 0.996f) {
					rgb = 0xFFFFFF
					alpha = max(alpha, 0.8f * edge * amount)
				}
				rainbowPixels[qy * gw + qx] = ((alpha * 255f).toInt().coerceIn(0, 255) shl 24) or rgb
			}
		}
		bitmap.setPixels(rainbowPixels, 0, gw, 0, 0, gw, gh)
		dest.set(0f, 0f, gw * cell, gh * cell)
		canvas.drawBitmap(bitmap, null, dest, screen)
	}

	/**
	 * The POPS shader's ring without the bending: at the same radius (260 dp a second) and over the
	 * same 0.4 s, a bright outer edge and a darker inner one, which reads as a lens ripple.
	 */
	fun drawPop(canvas: Canvas, x: Float, y: Float, age: Float, density: Float) {
		val fade = 1f - (age / 0.4f).coerceIn(0f, 1f)
		if (fade <= 0f) return
		val radius = age * 260f * density
		val width = 14f * density
		ring.strokeWidth = width * 0.35f
		ring.color = 0xFFFFFFFF.toInt()
		ring.alpha = (fade * 110f).toInt()
		canvas.drawCircle(x, y, radius + width * 0.3f, ring)
		ring.color = 0xFF000000.toInt()
		ring.alpha = (fade * 55f).toInt()
		canvas.drawCircle(x, y, (radius - width * 0.3f).coerceAtLeast(0f), ring)
	}

	fun clear() {
		filmCells = null
		rainbowCells = null
		filmPixels = IntArray(0)
		rainbowPixels = IntArray(0)
	}

	/** A colour from premultiplied channels (what SCREEN blends with), as the unpremultiplied int a Bitmap takes. */
	private fun premultiplied(r: Float, g: Float, b: Float): Int {
		val a = max(r, max(g, b)).coerceIn(0f, 1f)
		if (a <= 0f) return 0
		fun c(v: Float) = (v / a * 255f).toInt().coerceIn(0, 255)
		return ((a * 255f).toInt() shl 24) or (c(r) shl 16) or (c(g) shl 8) or c(b)
	}

	private fun smooth(from: Float, to: Float, x: Float): Float {
		val k = ((x - from) / (to - from)).coerceIn(0f, 1f)
		return k * k * (3f - 2f * k)
	}

	private fun hash(seed: Long): Float {
		var x = seed.toInt()
		x = (x xor (x ushr 16)) * 0x45d9f3b
		x = (x xor (x ushr 16)) * 0x45d9f3b
		return ((x xor (x ushr 16)) and 65535) / 65535f
	}
}
