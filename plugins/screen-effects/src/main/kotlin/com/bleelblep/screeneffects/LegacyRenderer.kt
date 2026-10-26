package com.bleelblep.screeneffects

import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import java.lang.ref.WeakReference
import java.util.WeakHashMap
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/** API 24+ overlays only: never captures content, consumes touches, or changes another plugin's layers. */
internal object LegacyRenderer : EffectRenderer {
	private val layers = WeakHashMap<View, LegacyLayer>()
	private var selectedFilter = FILTER_NONE
	private var scanning = false
	private val scan = object : Runnable {
		override fun run() {
			scanning = false
			if (SHADERS_SUPPORTED || selectedFilter == FILTER_NONE) return
			refresh()
			if (selectedFilter != FILTER_NONE) scheduleScan()
		}
	}
	private fun scheduleScan() {
		if (scanning) return
		scanning = true
		mainHandler.postDelayed(scan, 500L)
	}
	private fun layer(view: View): LegacyLayer = layers.getOrPut(view) {
		LegacyLayer(view)
	}
	private fun refresh() {
		if (!Rendering.available("filter", selectedFilter)) {
			filter(FILTER_NONE)
			return
		}
		val roots = windowRoots(null).filter { it.isHardwareAccelerated }
		for ((view, layer) in layers.entries.toList()) {
			if (!view.isAttachedToWindow || (view !in roots && layer.idle)) {
				layer.dispose()
				layers.remove(view)
			}
		}
		for (view in roots) runCatching {
			layer(view).setFilter(selectedFilter)
		}.onFailure { Rendering.failed("filter", selectedFilter, it, "legacy") }
	}
	override fun filter(id: String) {
		selectedFilter = id.takeIf { it in LEGACY_FILTERS } ?: FILTER_NONE
		if (selectedFilter != FILTER_FROST) LegacyFrost.reset()
		mainHandler.removeCallbacks(scan)
		scanning = false
		for (layer in layers.values.toList()) layer.setFilter(selectedFilter)
		if (selectedFilter != FILTER_NONE) {
			refresh()
			scheduleScan()
		}
	}
	override fun tap(view: View, id: String, x: Float, y: Float, strength: Float) {
		// With experimental distortions on, bend a capture; otherwise (or if capture can't run) an overlay.
		if (LegacyCapture.tap(view, id, x, y, strength)) return
		if (id !in CANVAS_EFFECTS) return
		layer(view).burst(id, x, y, strength)
	}
	override fun finger(view: View, id: String): FingerEffect? = LegacyCapture.finger(view, id)
	override val wiping get() = selectedFilter == FILTER_FROST
	override fun wipe(view: View, x: Float, y: Float, start: Boolean) {
		LegacyFrost.wipe(view, x, y, start)
		for (layer in layers.values) layer.invalidateSelf()
	}
	override fun clear() {
		selectedFilter = FILTER_NONE
		mainHandler.removeCallbacks(scan)
		scanning = false
		layers.values.toList().forEach { it.dispose() }
		layers.clear()
		LegacyFrost.reset()
	}
}

/**
 * The legacy frosted glass: a small bitmap of frost (1/8 of the screen, stretched smoothly over
 * it) that finger strokes erase and that slowly frosts back. Kept in 0..1 view space, so every
 * window shows the same wipes. Main thread only.
 */
internal object LegacyFrost {
	private const val SCALE = 8
	const val REGROW_MS = 100L
	/** Roughly ten seconds from wiped to fully frosted, like the modern mask. */
	private const val REGROW_ALPHA = 6
	private const val FROST = 0xE8EEF4
	/** How opaque full frost is; the bitmap holds 0..255 frost and is drawn at this alpha. */
	private const val FULL_ALPHA = 0xC4

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
	private val regrow = Paint().apply { color = Color.argb(REGROW_ALPHA, 0xE8, 0xEE, 0xF4) }
	private val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply { alpha = FULL_ALPHA }
	private val dest = RectF()

	private fun ensure(width: Float, height: Float): Bitmap {
		bitmap?.let { return it }
		val b = Bitmap.createBitmap(max(1, (width / SCALE).toInt()), max(1, (height / SCALE).toInt()), Bitmap.Config.ARGB_8888)
		b.eraseColor((0xFF shl 24) or FROST)
		bitmap = b
		canvas = Canvas(b)
		lastRegrow = SystemClock.uptimeMillis()
		return b
	}

	/** Draws the frost over a [width] x [height] view, frosting back a little first. */
	fun draw(target: Canvas, width: Int, height: Int) {
		val b = ensure(width.toFloat(), height.toFloat())
		val now = SystemClock.uptimeMillis()
		if (now - lastRegrow >= REGROW_MS) {
			lastRegrow = now
			canvas?.drawPaint(regrow)
		}
		dest.set(0f, 0f, width.toFloat(), height.toFloat())
		target.drawBitmap(b, null, dest, paint)
	}

	fun wipe(root: View, rawX: Float, rawY: Float, start: Boolean) {
		if (root.width <= 0 || root.height <= 0) return
		val b = ensure(root.width.toFloat(), root.height.toFloat())
		val c = canvas ?: return
		val (x, y) = local(root, rawX, rawY)
		val mx = x / root.width * b.width
		val my = y / root.height * b.height
		val radius = 22f * density * (0.8f + 0.25f * Settings.intensity) / SCALE
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

	fun reset() {
		bitmap = null
		canvas = null
	}
}

/** A single drawable per root: filter below touch bursts. No full-screen bitmap allocations. */
private class LegacyLayer(view: View) : Drawable(), Choreographer.FrameCallback {
	private val root = WeakReference(view)
	private val density = Resources.getSystem().displayMetrics.density
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private val path = Path()
	private val corners = Path()
	private val bursts = ArrayList<Burst>(7)
	private var filter = FILTER_NONE
	private var queued = false
	private var attached = false
	private var frameAt = SystemClock.uptimeMillis()
	private var width = 0
	private var height = 0
	private var noise: Bitmap? = null
	private var noiseShader: BitmapShader? = null
	private val vignette = RadialGradient(0f, 0f, 1f,
		intArrayOf(Color.TRANSPARENT, 0x12000000, 0xB8000000.toInt()), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
	private val crtVignette = RadialGradient(0f, 0f, 1f,
		intArrayOf(Color.TRANSPARENT, 0x18000000, 0xCC000000.toInt()), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
	private val eyepiece = RadialGradient(0f, 0f, 1f,
		intArrayOf(Color.TRANSPARENT, 0x16001000, 0xE8000800.toInt()), floatArrayOf(0f, 0.68f, 1f), Shader.TileMode.CLAMP)
	private val inkGradient = RadialGradient(0f, 0f, 1.25f,
		intArrayOf(Color.WHITE, 0xAAFFFFFF.toInt(), 0x00FFFFFF), floatArrayOf(0f, 0.65f, 1f), Shader.TileMode.CLAMP)
	// Normalized gradients are created once and scaled with Canvas, including after rotation.
	private val vaporWash = LinearGradient(0f, 0f, 1f, 1f,
		intArrayOf(0x584B147D, 0x42FF59BF, 0x4873FFFF), floatArrayOf(0f, 0.52f, 1f), Shader.TileMode.CLAMP)
	private val dreamyWash = LinearGradient(0f, 0f, 1f, 1f,
		intArrayOf(0x24E3B2FF, 0x18FFCBE5, 0x249EEDEB), null, Shader.TileMode.CLAMP)
	private val cloudPink = RadialGradient(0f, 0f, 1f,
		intArrayOf(0x48FFD6EF, 0x26EDD2FF, 0x00EDD2FF), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
	private val cloudBlue = RadialGradient(0f, 0f, 1f,
		intArrayOf(0x409EEDEB, 0x20CFEAFF, 0x00CFEAFF), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
	private val tapeBand = LinearGradient(0f, -1f, 0f, 1f,
		intArrayOf(0x00FFFFFF, 0x38FFFFFF, 0x00FFFFFF), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
	private val startedAt = SystemClock.uptimeMillis()
	private val filterFrameDelay get() = when (filter) {
		"oldfilm", "vhs" -> 41L
		"dreamy", "rainbowpuffs", "flux" -> 50L
		FILTER_FROST -> LegacyFrost.REGROW_MS
		else -> 0L
	}
	val idle get() = bursts.isEmpty()
	private class Burst(val id: String, val x: Float, val y: Float, val strength: Float,
		val born: Long, val duration: Float, val colour: Int) {
		val seed = x * 0.013f + y * 0.007f
	}
	private val palette = intArrayOf(0xFFFF0D8C.toInt(), 0xFF0073FF.toInt(), 0xFF9E14FF.toInt(), 0xFF00F28C.toInt(), 0xFFFF7300.toInt())

	private fun resize() {
		val view = root.get() ?: return
		if (width == view.width && height == view.height) return
		width = view.width
		height = view.height
		setBounds(0, 0, width, height)
		corners.rewind()
		corners.fillType = Path.FillType.EVEN_ODD
		corners.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
		val radius = min(22f * density, min(width, height) * 0.12f)
		corners.addRoundRect(0f, 0f, width.toFloat(), height.toFloat(), radius, radius, Path.Direction.CW)
		invalidateSelf()
	}
	fun setFilter(id: String) {
		resize()
		if (filter == id) { schedule(); return }
		filter = id
		if (id != FILTER_NONE) attach()
		if (id == "nightvision" || id == "oldfilm" || id == "vhs") ensureNoise()
		if (id == FILTER_NONE && idle) { dispose(); return }
		invalidateSelf()
		schedule()
	}
	private fun ensureNoise() {
		if (noise != null) return
		val random = Random(0x564658)
		val pixels = IntArray(64 * 64) {
			val light = random.nextBoolean()
			Color.argb(random.nextInt(8, 38), if (light) 255 else 0, if (light) 255 else 0, if (light) 255 else 0)
		}
		noise = Bitmap.createBitmap(pixels, 64, 64, Bitmap.Config.ARGB_8888)
		noiseShader = BitmapShader(noise!!, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
	}
	fun burst(id: String, x: Float, y: Float, strength: Float) {
		resize()
		attach()
		if (bursts.size == 7) bursts.removeAt(0)
		val distance = hypot(max(x, width - x), max(y, height - y))
		val duration = if (id == "shockwave") distance / (1100f * density) + 0.1f else 1.8f
		val colour = if (id == "inkmono") monoInk() else palette[Random.nextInt(palette.size)]
		bursts += Burst(id, x, y, strength.coerceIn(0.1f, 3f), SystemClock.uptimeMillis(), duration, colour)
		schedule()
	}
	private fun schedule() {
		if (queued || (bursts.isEmpty() && filterFrameDelay == 0L)) return
		queued = true
		Choreographer.getInstance().postFrameCallbackDelayed(this, if (bursts.isEmpty()) filterFrameDelay else 0L)
	}
	override fun doFrame(frameTimeNanos: Long) {
		queued = false
		val view = root.get()
		if (SHADERS_SUPPORTED || view == null || !view.isAttachedToWindow) { dispose(); return }
		frameAt = SystemClock.uptimeMillis()
		bursts.removeAll { (frameAt - it.born) / 1000f >= it.duration }
		if (bursts.isEmpty() && filter == FILTER_NONE) { dispose(); return }
		resize()
		// Hidden windows keep no animation loop; the filter scan resumes them when visible again.
		if (!view.isShown) return
		invalidateSelf()
		schedule()
	}
	override fun draw(canvas: Canvas) {
		if (width <= 0 || height <= 0) return
		frameAt = SystemClock.uptimeMillis()
		val checkpoint = canvas.save()
		try {
			canvas.clipRect(bounds)
			val filterCheckpoint = canvas.save()
			if (filter != FILTER_NONE) runCatching { drawFilter(canvas) }.onFailure {
				Rendering.failed("filter", filter, it, "legacy")
				filter = FILTER_NONE
			}
			canvas.restoreToCount(filterCheckpoint)
			var i = 0
			while (i < bursts.size) {
				val burst = bursts[i]
				val saved = canvas.save()
				val result = runCatching { drawBurst(canvas, burst) }
				canvas.restoreToCount(saved)
				if (result.isFailure) {
					Rendering.failed("effect", burst.id, result.exceptionOrNull()!!, "legacy")
					bursts.removeAt(i)
				} else i++
			}
		} finally { canvas.restoreToCount(checkpoint) }
	}
	private fun resetPaint(colour: Int) {
		paint.shader = null
		paint.colorFilter = null
		paint.style = Paint.Style.FILL
		paint.color = colour
	}
	private fun shade(canvas: Canvas, shader: Shader, circular: Boolean) {
		val saved = canvas.save()
		canvas.translate(width / 2f, height / 2f)
		canvas.scale(if (circular) height * 0.64f else width * 0.68f, height * 0.64f)
		resetPaint(Color.WHITE)
		paint.shader = shader
		canvas.drawRect(-3f, -3f, 3f, 3f, paint)
		canvas.restoreToCount(saved)
		paint.shader = null
	}
	private fun grain(canvas: Canvas, animated: Boolean) {
		val saved = canvas.save()
		val step = (frameAt / 41L).toInt()
		val dx = if (animated) ((step * 17) and 63).toFloat() else 0f
		val dy = if (animated) ((step * 29) and 63).toFloat() else 0f
		canvas.scale(density, density)
		canvas.translate(-dx, -dy)
		resetPaint(Color.WHITE)
		paint.shader = noiseShader
		canvas.drawRect(dx, dy, dx + width / density, dy + height / density, paint)
		canvas.restoreToCount(saved)
		paint.shader = null
	}
	private fun drawFilter(canvas: Canvas) {
		when (filter) {
			"vaporwave" -> {
				wash(canvas, vaporWash)
				scanlines(canvas, 3f * density, 0x200F092B)
			}
			"dreamy" -> drawDreamy(canvas)
			FILTER_FROST -> LegacyFrost.draw(canvas, width, height)
			"rainbowpuffs" -> drawRainbow(canvas)
			"vhs" -> drawVhs(canvas)
			"flux" -> drawFlux(canvas)
			"crt" -> {
				resetPaint(0x3A000000)
				var y = 0f
				while (y < height) {
					canvas.drawRect(0f, y, width.toFloat(), y + density * 0.65f, paint)
					y += 2f * density
				}
				shade(canvas, crtVignette, false)
				resetPaint(Color.BLACK)
				canvas.drawPath(corners, paint)
			}
			"nightvision" -> {
				canvas.drawColor(0x3820EF45)
				grain(canvas, false)
				shade(canvas, eyepiece, true)
			}
			"oldfilm" -> {
				val t = frameAt / 1000f
				canvas.drawColor(Color.argb((23f + 7f * sin(t * 37f)).toInt(), 213, 173, 109))
				grain(canvas, true)
				shade(canvas, vignette, false)
				val tick = frameAt / 83L
				resetPaint(0x45E8DCC4)
				paint.strokeWidth = density * 0.55f
				repeat(4) { i ->
					val n = hash(tick / (3 + i) + i * 97L)
					if (n > 0.3f) {
						val x = width * n
						canvas.drawLine(x, 0f, x + density * sin(t + i), height.toFloat(), paint)
					}
				}
				resetPaint(0x650C0803)
				repeat(18) { i ->
					val seed = tick * 31 + i * 101
					canvas.drawCircle(hash(seed) * width, hash(seed + 17) * height,
						density * (0.5f + hash(seed + 7) * 1.6f), paint)
				}
			}
		}
	}
	private fun wash(canvas: Canvas, shader: Shader) {
		val saved = canvas.save()
		canvas.scale(width.toFloat(), height.toFloat())
		resetPaint(Color.WHITE)
		paint.shader = shader
		canvas.drawRect(0f, 0f, 1f, 1f, paint)
		canvas.restoreToCount(saved)
		paint.shader = null
	}
	private fun scanlines(canvas: Canvas, spacing: Float, colour: Int) {
		resetPaint(colour)
		var y = 0f
		while (y < height) {
			canvas.drawRect(0f, y, width.toFloat(), y + density * 0.6f, paint)
			y += spacing
		}
	}
	private fun drawDreamy(canvas: Canvas) {
		val t = (frameAt - startedAt) / 1000f
		wash(canvas, dreamyWash)
		// A bounded set of soft, overlapping clouds; no blur pass or offscreen bitmap.
		repeat(6) { i ->
			val phase = i * 1.73f
			val x = width * (0.5f + 0.46f * sin(t * 0.07f + phase))
			val y = height * (0.5f + 0.48f * cos(t * 0.045f + phase * 1.4f))
			val saved = canvas.save()
			canvas.translate(x, y)
			canvas.scale(width * (0.36f + 0.06f * sin(t * 0.12f + phase)), height * 0.23f)
			resetPaint(Color.WHITE)
			paint.shader = if (i % 2 == 0) cloudPink else cloudBlue
			canvas.drawCircle(0f, 0f, 1f, paint)
			canvas.restoreToCount(saved)
		}
		// Stable seeds keep each mote on its path while it rises and gently twinkles.
		repeat(28) { i ->
			val seed = i * 101L + 37L
			val speed = 6f + hash(seed + 5) * 8f
			val travel = height + 24f * density
			val y = travel - ((hash(seed + 17) * travel + t * speed * density) % travel) - 12f * density
			val x = hash(seed) * width + sin(t * 0.35f + i) * 7f * density
			val pulse = max(0f, sin(t * (1.1f + hash(seed + 7)) + i * 2.1f)).pow(4)
			val size = (0.8f + hash(seed + 11) * 1.1f) * density
			resetPaint(0xFFFFF2FF.toInt())
			paint.alpha = (pulse * 175f).toInt()
			canvas.drawCircle(x, y, size, paint)
			if (pulse > 0.55f) {
				paint.strokeWidth = 0.65f * density
				paint.alpha = (pulse * 100f).toInt()
				canvas.drawLine(x - size * 2.6f, y, x + size * 2.6f, y, paint)
				canvas.drawLine(x, y - size * 2.6f, x, y + size * 2.6f, paint)
			}
		}
	}
	private fun drawVhs(canvas: Canvas) {
		val elapsed = frameAt - startedAt
		val t = elapsed / 1000f
		val tick = elapsed / 41L
		canvas.drawColor(Color.argb(5 + (hash(tick) * 7f).toInt(), 190, 204, 225))
		grain(canvas, true)
		scanlines(canvas, 3f * density, 0x14000000)
		// Match the shader's 0.12 cycles/s tracking roll, with textured lines at the crest.
		val bandY = ((t * 0.12f) % 1f) * (height + 120f * density) - 60f * density
		val saved = canvas.save()
		canvas.translate(0f, bandY)
		canvas.scale(1f, 24f * density)
		resetPaint(Color.WHITE)
		paint.shader = tapeBand
		canvas.drawRect(0f, -1f, width.toFloat(), 1f, paint)
		canvas.restoreToCount(saved)
		repeat(16) { i ->
			val seed = tick * 31 + i * 97
			val x = hash(seed) * width
			val y = bandY + (hash(seed + 13) - 0.5f) * 36f * density
			val length = (8f + hash(seed + 23) * 75f) * density
			resetPaint(if (i % 3 == 0) 0x458EDBFF else 0x50FFFFFF)
			canvas.drawRect(x, y, min(width.toFloat(), x + length), y + density * 0.65f, paint)
		}
		// Bottom-edge head-switching noise, rather than pretending to displace UI pixels.
		repeat(10) { i ->
			val seed = tick * 17 + i * 43
			val x = hash(seed + 3) * width
			val y = height - (2f + hash(seed + 9) * 9f) * density
			resetPaint(0x22D1DFFF)
			canvas.drawRect(x, y, min(width.toFloat(), x + width * hash(seed + 19) * 0.3f), y + density, paint)
		}
	}
	/**
	 * Black ink on light screens, white on dark. The overlay can't sample what's under the tap, so
	 * this goes by the window's background colour, or the system's night mode without one.
	 */
	private fun monoInk(): Int {
		val view = root.get()
		val background = (view?.background as? ColorDrawable)?.color
		val dark = if (background != null && Color.alpha(background) > 0) {
			Color.red(background) * 0.2126f + Color.green(background) * 0.7152f + Color.blue(background) * 0.0722f < 128f
		} else ((view?.resources?.configuration?.uiMode ?: 0) and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
		return if (dark) Color.WHITE else 0xFF050505.toInt()
	}

	private var rainbowCells: Bitmap? = null
	private var rainbowPixels = IntArray(0)
	private val rainbowPaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN) }
	private val rainbowDest = RectF()
	private val rainbowColours = intArrayOf(0xFF0000, 0xFF9900, 0xFFFF00, 0x33FF00, 0x0099FF, 0x6633FF)

	/**
	 * The modern Rainbow puffs filter, one bitmap pixel per 6 dp cell, recomputed each frame and
	 * stretched without smoothing: stepped diagonal rainbow bands that lift and drop like Nyan Cat's
	 * trail, strongest toward the edges, with twinkling pixel stars. Screen-blended like the shader.
	 */
	/** Flux (Filters.kt) on a canvas: tint, edge glow, one jagged arc per beat, the double flash. */
	private fun drawFlux(canvas: Canvas) {
		val t = frameAt / 1000f
		val w = width.toFloat()
		val h = height.toFloat()
		canvas.drawColor(0x140A3A8C)
		resetPaint(Color.argb((40 * (0.7f + 0.3f * sin(t * 3f))).toInt(), 60, 130, 255))
		paint.style = Paint.Style.STROKE
		paint.strokeWidth = 12f * density
		canvas.drawRect(0f, 0f, w, h, paint)
		val slot = frameAt / 750L
		val phase = (frameAt % 750L) / 750f
		if (hash(slot * 13 + 5) > 0.35f) {
			// Along one edge, from a random point, 110-270 dp long, re-jagged 24 times a second.
			val side = (hash(slot * 7 + 1) * 4).toInt()
			val span = (110f + 160f * hash(slot * 3 + 2)) * density
			val horizontal = side % 2 == 0
			val edgeLength = if (horizontal) w else h
			val start = hash(slot * 5 + 3) * (edgeLength - span).coerceAtLeast(0f)
			val frame = frameAt / 41L
			path.rewind()
			val steps = (span / (12f * density)).toInt().coerceAtLeast(2)
			for (i in 0..steps) {
				val s = start + span * i / steps
				val depth = (6f + 26f * hash(frame * 31 + i + slot * 17)) * density
				val x = when (side) { 0 -> s; 1 -> w - depth; 2 -> w - s; else -> depth }
				val y = when (side) { 0 -> depth; 1 -> s; 2 -> h - depth; else -> h - s }
				if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
			}
			val life = (1f - phase).let { it * sqrt(it) }
			resetPaint(Color.argb((90 * life).toInt(), 90, 165, 255))
			paint.style = Paint.Style.STROKE
			paint.strokeWidth = 6f * density
			canvas.drawPath(path, paint)
			resetPaint(Color.argb((235 * life).toInt(), 225, 242, 255))
			paint.style = Paint.Style.STROKE
			paint.strokeWidth = 1.6f * density
			canvas.drawPath(path, paint)
		}
		val strike = (frameAt % 7000L) / 1000f
		val flash = exp(-strike * 18f) + if (strike >= 0.16f) 0.7f * exp(-(strike - 0.16f) * 14f) else 0f
		if (flash > 0.02f) canvas.drawColor(Color.argb((115 * flash.coerceAtMost(1f)).toInt(), 235, 245, 255))
	}

	private fun drawRainbow(canvas: Canvas) {
		val cell = 6f * density
		val gw = max(1, ceil(width / cell).toInt())
		val gh = max(1, ceil(height / cell).toInt())
		var cells = rainbowCells
		if (cells == null || cells.width != gw || cells.height != gh) {
			cells = Bitmap.createBitmap(gw, gh, Bitmap.Config.ARGB_8888)
			rainbowCells = cells
			rainbowPixels = IntArray(gw * gh)
		}
		val t = (frameAt - startedAt) / 1000f
		val step = floor(t * 6f).toInt()
		val starTick = floor(t * 3f).toLong()
		for (qy in 0 until gh) {
			val cy = ((qy + 0.5f) * cell / height) * 2f - 1f
			for (qx in 0 until gw) {
				val cx = ((qx + 0.5f) * cell / width) * 2f - 1f
				val edge = smooth(0.35f, 1.15f, sqrt(cx * cx * 0.81f + cy * cy))
				val lift = ((qx / 8) + step) and 1
				val band = (qx * 0.6f + qy + lift) / 4f - t * 1.5f
				val index = ((floor(band).toInt() % 6) + 6) % 6
				var alpha = 0.10f + 0.40f * edge
				var rgb = rainbowColours[index]
				if (edge > 0f && hash(qx * 73856093L xor qy * 19349663L xor starTick * 83492791L) > 0.996f) {
					rgb = 0xFFFFFF
					alpha = max(alpha, 0.8f * edge)
				}
				rainbowPixels[qy * gw + qx] = ((alpha * 255f).toInt().coerceIn(0, 255) shl 24) or rgb
			}
		}
		cells.setPixels(rainbowPixels, 0, gw, 0, 0, gw, gh)
		rainbowDest.set(0f, 0f, gw * cell, gh * cell)
		canvas.drawBitmap(cells, null, rainbowDest, rainbowPaint)
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
	private fun drawBurst(canvas: Canvas, burst: Burst) {
		val seconds = ((frameAt - burst.born) / 1000f).coerceAtLeast(0f)
		val p = (seconds / burst.duration).coerceIn(0f, 1f)
		val k = min(burst.strength, 2f)
		if (burst.id == "shockwave") {
			val radius = seconds * 1100f * density
			val fade = exp(-1.4f * seconds) * min(radius / (40f * density), 1f) * (1f - p.pow(8))
			resetPaint(Color.WHITE)
			paint.style = Paint.Style.STROKE
			repeat(5) { i ->
				paint.strokeWidth = (26f + 14f * k) * density * (1f - i * 0.19f)
				paint.alpha = (fade * min(k, 1.5f) * (8 + i * 6)).toInt().coerceIn(0, 255)
				canvas.drawCircle(burst.x, burst.y, radius, paint)
			}
			return
		}
		// Same 1.8 s envelope, growth and angular wobble as the AGSL ink, without refraction.
		val radius = (70f + 110f * k) * density * (1f - exp(-4f * p))
		if (radius <= 0f) return
		canvas.translate(burst.x, burst.y)
		canvas.scale(radius, radius)
		path.rewind()
		repeat(129) { i ->
			val a = (i * 2.0 * PI / 128.0).toFloat()
			val r = 1f + 0.16f * sin(a * 5f + burst.seed * 9f + p * 2f) +
				0.09f * sin(a * 11f - burst.seed * 5f) + 0.05f * sin(a * 23f + burst.seed)
			val x = cos(a) * r
			val y = sin(a) * r
			if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
		}
		path.close()
		resetPaint(burst.colour)
		paint.alpha = (190f * (1f - p).pow(1.2f)).toInt()
		canvas.drawPath(path, paint)
		// Soft inner pooling using a reusable normalized gradient and the same organic outline.
		canvas.clipPath(path)
		paint.shader = inkGradient
		paint.alpha = (28f * (1f - p).pow(1.2f)).toInt()
		canvas.drawCircle(-0.15f, -0.15f, 1.25f, paint)
	}
	private fun attach() {
		if (attached) return
		root.get()?.overlay?.add(this)
		attached = true
	}
	fun dispose() {
		Choreographer.getInstance().removeFrameCallback(this)
		queued = false
		bursts.clear()
		filter = FILTER_NONE
		root.get()?.overlay?.remove(this)
		attached = false
		// Let RenderThread finish any display-list references before the bitmap is collected.
		noiseShader = null
		noise = null
		rainbowCells = null
	}
	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Suppress("OVERRIDE_DEPRECATION") override fun getOpacity() = PixelFormat.TRANSLUCENT
}
