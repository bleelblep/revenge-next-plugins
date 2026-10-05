package com.bleelblep.dreamscape.core

import android.content.Context
import android.graphics.*
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.*
import android.widget.Toast
import com.bleelblep.dreamscape.features.*

internal object Engine {
	private val handler = Handler(Looper.getMainLooper())
	private var running = false
	var config = Config(); private set
	private var host: Host? = null
	private fun attach(): Host? {
		val root = if (config.enabled) roots().lastOrNull { it.hasWindowFocus() } else null
		if (host?.parent !== root) {
			host?.dispose(); host = null
			if (root != null) host = Host(root.context, root).also { root.addView(it, ViewGroup.LayoutParams(-1, -1)) }
		}
		return host
	}
	private val monitor = object : Runnable {
		override fun run() {
			if (!running) return
			attach()?.resume()
			handler.postDelayed(this, 500)
		}
	}
	fun start() { running = true; handler.removeCallbacks(monitor); handler.post(monitor) }
	fun stop() { running = false; handler.removeCallbacks(monitor); host?.dispose(); host = null }
	fun configure(next: Config) { config = next; if (running) attach()?.configure() }
	fun preview(scene: Scene) { attach()?.preview(scene) }
	fun cast(name: String) { host?.cast(name) }
	fun gesture() { host?.gesture() }
	fun clear() { host?.clearTemporary() }
	fun status(): Map<String, Any> = mapOf(
		"enabled" to config.enabled, "attached" to (host != null), "androidShaders" to (android.os.Build.VERSION.SDK_INT >= 33),
		"tiltAvailable" to (host?.tilt?.supported ?: false), "surfaces" to (host?.surfaceCount ?: 0),
		"capture" to (host?.captureStatus ?: "Waiting for visible Discord window"),
		"shaderError" to (host?.shaderError ?: "none"), "targetFps" to config.fps,
		"measuredFps" to (host?.measuredFps ?: 0), "displayHz" to (host?.display?.refreshRate ?: 0f),
		"scene" to (host?.sceneWorld ?: "Not playing — preview a scene or choose Play everywhere"),
		"renderer" to (host?.renderer ?: "Waiting for visible Discord window"),
	)
}

internal class Host(context: Context, private val root: ViewGroup) : View(context) {
	val tilt = Tilt(context)
	val glass = Glass()
	private val hologram = Hologram()
	private val tear = Tear()
	private val spells = Spellbook()
	private val dreams = Dreams()
	private val sceneShader = SceneShader(root)
	private val choreographer = Choreographer.getInstance()
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private val density = resources.displayMetrics.density
	private var capturing = false
	private var backdrop: Bitmap? = null
	private var disposed = false
	private var scheduled = false
	private var last = 0L
	private var nextFrame = 0L
	private var meterAt = 0L
	private var frameCount = 0
	var measuredFps = 0; private set
	val shaderError: String? get() = sceneShader.error ?: glass.error ?: hologram.error
	val sceneWorld: String? get() = currentScene()?.world
	val renderer: String get() = if (sceneShader.active) "AGSL / VFX shared compositor" else "Canvas fallback"
	private fun currentScene(): Scene? = previewScene ?: Engine.config.scene.takeIf { Engine.config.dreams && (Engine.config.channelScene || Engine.config.playEverywhere) }
	private var scanAt = 0L
	private var captureAt = 0L
	private var time = 0f
	private var found: List<Surface> = emptyList()
	var surfaceCount = 0; private set
	var captureStatus = "Not captured"; private set
	private var previewScene: Scene? = null
	private var previewUntil = 0L
	private var spell = ""
	private var spellUntil = 0L
	private var touchOwner = ""
	private var lensX = .5f
	private var lensY = .65f
	private var fingerX = 0f
	private var fingerY = 0f
	private val lens = RectF()
	private val pulse = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			scheduled = false
			if (disposed || !isAttachedToWindow || !root.hasWindowFocus() || !isShown || !Engine.config.enabled) { tilt.active(false); return }
			if (frameTimeNanos < nextFrame) { schedule(); return }
			val interval = 1_000_000_000L / if (Engine.config.reducedMotion) 10 else Engine.config.fps
			nextFrame = if (nextFrame == 0L || frameTimeNanos - nextFrame > interval * 2) frameTimeNanos + interval else nextFrame + interval
			try {
			val now = SystemClock.uptimeMillis()
			val dt = if (last == 0L) 1f / Engine.config.fps else ((frameTimeNanos-last)/1_000_000_000f).coerceIn(0f, .05f)
			last = frameTimeNanos
			frameCount++
			if (meterAt == 0L) meterAt = now
			if (now - meterAt >= 1000) { measuredFps = (frameCount * 1000L / (now - meterAt)).toInt(); frameCount = 0; meterAt = now }
			if (!Engine.config.reducedMotion) time += dt
			tear.step(dt, Engine.config.reducedMotion)
			if (now > spellUntil && touchOwner != "tear") tear.target = 0f
			if (now > previewUntil) previewScene = null
			sceneShader.draw(currentScene(), time, Engine.config.strength, previewScene != null)
			if (now >= scanAt) { found = Surfaces.scan(root, this@Host); surfaceCount = found.size; scanAt = now + 300 }
			updateSurfaces()
			if (Engine.config.glass && glass.surfaces.isNotEmpty() && now >= captureAt) { capture(); captureAt = now + if (Engine.config.fps == 15) 200 else 100 }
			tilt.active(Engine.config.tilt && !Engine.config.reducedMotion && (Engine.config.glass || Engine.config.hologram))
			invalidate(); schedule()
			} catch (e: Exception) {
				captureStatus = "Effect paused: ${e.javaClass.simpleName}"
				tilt.active(false)
				android.util.Log.e("Dreamscape", "Frame update failed", e)
			}
		}
	}
	init { setWillNotDraw(false); importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
	private fun schedule() { if (!scheduled && !disposed) { scheduled = true; choreographer.postFrameCallback(pulse) } }
	private fun pause() { choreographer.removeFrameCallback(pulse); scheduled = false; last = 0; nextFrame = 0; measuredFps = 0; frameCount = 0; meterAt = 0; tilt.active(false); sceneShader.clear() }
	fun resume() { if (root.hasWindowFocus()) schedule() }
	override fun onAttachedToWindow() { super.onAttachedToWindow(); resume() }
	override fun onDetachedFromWindow() { pause(); super.onDetachedFromWindow() }
	override fun onWindowFocusChanged(hasWindowFocus: Boolean) { super.onWindowFocusChanged(hasWindowFocus); if (hasWindowFocus) resume() else pause() }
	fun configure() {
		if (!Engine.config.enabled) clearTemporary()
		if (!Engine.config.spellbook) { spells.cancel(); spellUntil = 0 }
		if (!Engine.config.tear) tear.clear()
		nextFrame = 0
		if (!Engine.config.glass) glass.clear()
		if (!Engine.config.hologram) hologram.clear()
		if (!Engine.config.tilt) tilt.active(false)
		scanAt = 0; captureAt = 0; invalidate(); resume()
	}
	fun clearTemporary() { previewScene = null; previewUntil = 0; spell = ""; spellUntil = 0; spells.cancel(); tear.clear(); touchOwner = ""; invalidate() }
	fun dispose() { disposed = true; pause(); clearTemporary(); glass.clear(); hologram.clear(); (parent as? ViewGroup)?.removeView(this); backdrop?.recycle(); backdrop = null }
	fun preview(scene: Scene) { previewScene = scene; previewUntil = SystemClock.uptimeMillis() + 12000; resume() }
	fun gesture() { if (!Engine.config.spellbook) return; spells.begin(); invalidate() }
	fun cast(name: String) {
		if (!Engine.config.spellbook || name !in setOf("portal", "frost", "prism", "meteor")) return
		spell = name; spellUntil = SystemClock.uptimeMillis() + 3500
		if (name == "portal") { tear.target = .65f; tear.centerY = .5f }
		performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
		resume()
	}
	private fun updateSurfaces() {
		lens.set(width * lensX - 75 * density, height * lensY - 48 * density, width * lensX + 75 * density, height * lensY + 48 * density)
		glass.surfaces = if (Engine.config.glass) found.filter { it.composer } + (if (Engine.config.demo) listOf(Surface(RectF(lens), false)) else emptyList()) else emptyList()
		hologram.surfaces = if (Engine.config.hologram) found.filter { !it.composer }.map { it.bounds } +
			(if (Engine.config.demo) listOf(RectF(width * .2f, height * .2f, width * .8f, height * .35f)) else emptyList()) else emptyList()
	}
	private fun capture() {
		if (width < 1 || height < 1) return
		runCatching {
			val w = (width / 3).coerceAtLeast(1); val h = (height / 3).coerceAtLeast(1)
			if (backdrop?.width != w || backdrop?.height != h) { glass.backdrop = null; backdrop?.recycle(); backdrop = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888) }
			val b = backdrop!!; b.eraseColor(Color.TRANSPARENT)
			capturing = true
			try { val c = Canvas(b); c.scale(w.toFloat()/width, h.toFloat()/height); root.draw(c) } finally { capturing = false }
			glass.backdrop = b; captureStatus = "Backdrop ${w}×${h}"
		}.onFailure { capturing = false; glass.backdrop = null; captureStatus = "Backdrop unavailable: ${it.javaClass.simpleName}" }
	}
	override fun onDraw(c: Canvas) {
		if (capturing || !Engine.config.enabled) return
		val cfg = Engine.config
		val tx = if (cfg.tilt && tilt.supported) tilt.x else fingerX
		val ty = if (cfg.tilt && tilt.supported) tilt.y else fingerY
		val f = Frame(width.toFloat(), height.toFloat(), density, time, tx, ty, cfg)
		val scene = currentScene()
		if (scene != null) dreams.draw(c, RectF(0f, 0f, f.width, f.height), scene, time, density = density, atmosphere = !sceneShader.active)
		if (cfg.glass) glass.draw(c, f)
		if (cfg.hologram) hologram.draw(c, f)
		tear.draw(c, f)
		if (SystemClock.uptimeMillis() < spellUntil) drawSpell(c, f)
		paint.color = 0xCCBDA2F5.toInt()
		if (cfg.tear) c.drawRoundRect(width - 8*density, height*.45f, width.toFloat(), height*.55f, 4*density, 4*density, paint)
		if (cfg.spellbook) {
			c.drawCircle(26*density, height*.55f, 19*density, paint)
			paint.color = Color.WHITE; paint.textSize = 23*density; c.drawText("✦", 15*density, height*.55f + 8*density, paint)
		}
		spells.draw(c, f.width, f.height, density)
	}
	private fun drawSpell(c: Canvas, f: Frame) {
		val remaining = ((spellUntil - SystemClock.uptimeMillis()) / 3500f).coerceIn(0f, 1f)
		when (spell) {
			"prism" -> {
				paint.shader = LinearGradient(0f, 0f, f.width, f.height, intArrayOf(0x337F66FF, 0x3344FFCC, 0x33FF66CC), null, Shader.TileMode.CLAMP)
				paint.alpha = (remaining * 180).toInt(); c.drawRect(0f, 0f, f.width, f.height, paint); paint.shader = null; paint.alpha = 255
			}
			"frost" -> {
				paint.color = Color.argb((remaining * 130).toInt(), 190, 235, 255); paint.strokeWidth = 2*density
				for (i in 0..30) { val x = i*f.width/30; val reach = (20 + i%5*12)*density*remaining; c.drawLine(x, 0f, x+12*density, reach, paint); c.drawLine(x, f.height, x-12*density, f.height-reach, paint) }
			}
			"meteor" -> {
				val p = 1-remaining; val x = f.width*p; val y = f.height*(.2f+p*.5f)
				paint.shader = LinearGradient(x-100*density, y-60*density, x, y, intArrayOf(0x00FFBB77, 0xFFFFE8AA.toInt()), null, Shader.TileMode.CLAMP)
				paint.strokeWidth = 10*density; c.drawLine(x-100*density, y-60*density, x, y, paint); paint.shader = null
				paint.color = Color.WHITE; c.drawCircle(x, y, 5*density, paint)
			}
		}
	}
	override fun onTouchEvent(e: MotionEvent): Boolean {
		val cfg = Engine.config
		if (!cfg.enabled) return false
		if (e.actionMasked == MotionEvent.ACTION_DOWN) {
			touchOwner = when {
				spells.active -> "draw"
				cfg.spellbook && e.x < 52*density && kotlin.math.abs(e.y-height*.55f) < 28*density -> "cast"
				cfg.tear && e.x > width-24*density && e.y in height*.4f..height*.6f -> "tear"
				cfg.glass && cfg.demo && lens.contains(e.x, e.y) -> "lens"
				else -> ""
			}
			if (touchOwner.isEmpty()) return false
			if (touchOwner == "draw") {
				if (e.x > width-56*density && e.y < 64*density) { spells.cancel(); touchOwner = "cancel" } else { spells.points.clear(); spells.add(e.x/density, e.y/density) }
			}
			if (touchOwner == "lens") { glass.touchX = e.x; glass.touchY = e.y; glass.touchTime = time }
			parent?.requestDisallowInterceptTouchEvent(true)
		}
		if (touchOwner.isEmpty()) return false
		if (e.actionMasked == MotionEvent.ACTION_MOVE) {
			fingerX = e.x / width * 2 - 1; fingerY = e.y / height * 2 - 1
			when (touchOwner) {
				"tear" -> { tear.centerY = (e.y/height).coerceIn(.32f,.68f); tear.target = ((width-e.x)/width).coerceIn(0f,.85f) }
				"lens" -> { lensX = (e.x/width).coerceIn(.2f,.8f); lensY = (e.y/height).coerceIn(.15f,.85f); updateSurfaces() }
				"draw" -> spells.add(e.x/density, e.y/density)
			}
		}
		if (e.actionMasked == MotionEvent.ACTION_UP) {
			when (touchOwner) {
				"cast" -> spells.begin()
				"tear" -> tear.target = 0f
				"draw" -> {
					val result = spells.finish()
					val symbol = when (result) { "portal" -> "circle"; "meteor" -> "zigzag"; "prism" -> "v"; else -> null }
					if (symbol != null) cast(cfg.bindings.getValue(symbol)) else Toast.makeText(context, "Symbol not recognized", Toast.LENGTH_SHORT).show()
				}
			}
			performClick(); touchOwner = ""; parent?.requestDisallowInterceptTouchEvent(false)
		} else if (e.actionMasked == MotionEvent.ACTION_CANCEL) { spells.cancel(); tear.target = 0f; touchOwner = ""; parent?.requestDisallowInterceptTouchEvent(false) }
		invalidate(); return true
	}
	override fun performClick(): Boolean { super.performClick(); return true }
}
