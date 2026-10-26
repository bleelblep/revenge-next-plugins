package com.bleelblep.screeneffects

import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.opengl.GLUtils
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.Choreographer
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import java.lang.ref.WeakReference
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * The opt-in legacy distortions: a reduced-resolution software capture of one window, bent by an
 * OpenGL ES 2 fragment shader and shown on a TextureView in that window's overlay. Each effect's
 * shader outputs transparency wherever it leaves the screen alone, so live UI shows there.
 * API 24-safe. One window and one in-flight capture at a time.
 */

/** Tap-driven effects (several taps share one session) and finger-driven ones, by effect id. */
internal val CAPTURE_TAP_EFFECTS = setOf("ripple", "shockwave", "swirl", "glitch", "pixel", "ink", "inkmono", "timejump")
internal val CAPTURE_FINGER_EFFECTS = setOf(STYLE_LENS, STYLE_JELLY, STYLE_BLACKHOLE)
internal val CAPTURE_EFFECTS = CAPTURE_TAP_EFFECTS + CAPTURE_FINGER_EFFECTS

/** What a capture session draws: the GLSL, and its uniforms each frame. */
internal interface CaptureDriver {
	val fragment: String
	/** Sets this frame's uniforms; false once the effect has finished. GL worker thread. */
	fun bind(u: GlUniforms): Boolean
}

internal object LegacyCapture {
	private var session: Session? = null
	@Volatile private var status = "Not tested"
	@Volatile private var frames = 0
	@Volatile private var captureMs = 0.0
	@Volatile private var renderMs = 0.0
	@Volatile private var totalMs = 0.0
	@Volatile private var imageSize = ""
	@Volatile private var captures = 0
	@Volatile private var averageCaptureMs = 0.0
	@Volatile private var peakCaptureMs = 0.0
	@Volatile private var captureIntervalMs = 50L
	fun diagnostics(): Map<String, Any> = mapOf("status" to status, "frames" to frames,
		"captureMs" to captureMs, "renderMs" to renderMs, "totalMs" to totalMs, "imageSize" to imageSize,
		"captures" to captures, "averageCaptureMs" to averageCaptureMs, "peakCaptureMs" to peakCaptureMs,
		"captureIntervalMs" to captureIntervalMs)

	private val enabled get() = Settings.legacyRipple && !SHADERS_SUPPORTED
	/** Effects whose shader failed here; overlay-backed ones then stay on their overlay. */
	private val broken = HashSet<String>()

	/** Plays a tap effect; false if it can't run here (the caller may fall back to an overlay). */
	fun tap(view: View, id: String, x: Float, y: Float, strength: Float): Boolean {
		val fragment = TAP_SHADERS[id] ?: return false
		if (!enabled || id in broken) return false
		val root = view as? ViewGroup ?: return false
		val current = session
		val driver = current?.driver as? TapDriver
		if (current != null && current.root === root && driver?.id == id) {
			driver.add(x, y, strength)
			return true
		}
		val fresh = TapDriver(id, fragment, root.width, root.height).apply { add(x, y, strength) }
		return start(root, fresh)
	}

	/** A finger effect drawn through a capture session while the finger is down. */
	fun finger(view: View, id: String): FingerEffect? {
		if (!enabled || id !in CAPTURE_FINGER_EFFECTS) return null
		val root = view as? ViewGroup ?: return null
		val model = when (id) {
			STYLE_LENS -> LensModel()
			STYLE_JELLY -> JellyModel()
			STYLE_BLACKHOLE -> BlackHoleModel()
			else -> return null
		}
		return LegacyFinger(root, id, model)
	}

	/** Starts [driver] on [root], replacing any other session. False if capture is impossible here. */
	fun start(root: ViewGroup, driver: CaptureDriver): Boolean {
		val current = session
		if (current != null) {
			if (current.root === root && current.driver === driver) return true
			stop()
		}
		if (root.width <= 0 || root.height <= 0 || !root.isAttachedToWindow) return false
		if (separateSurface(root)) {
			status = "Video, camera or TextureView content: capture is unavailable in this window"
			return false
		}
		frames = 0
		captures = 0
		averageCaptureMs = 0.0
		peakCaptureMs = 0.0
		captureIntervalMs = 50L
		captureMs = 0.0
		renderMs = 0.0
		totalMs = 0.0
		status = "Starting OpenGL ES 2 capture"
		return runCatching { Session(root, driver).also { session = it; it.start() } }
			.onFailure { fail(driver, it) }.isSuccess
	}

	fun running(driver: CaptureDriver) = session?.driver === driver

	private fun separateSurface(view: View): Boolean {
		if (!view.isShown) return false
		if (view is SurfaceView || view is TextureView) return true
		if (view is ViewGroup) for (i in 0 until view.childCount) if (separateSurface(view.getChildAt(i))) return true
		return false
	}
	private fun fail(driver: CaptureDriver, error: Throwable) {
		status = "Stopped: ${error.message ?: error.javaClass.simpleName}"
		val id = (driver as? TapDriver)?.id ?: (driver as? FingerDriver)?.id ?: "ripple"
		broken += id
		if (id !in CANVAS_EFFECTS) Rendering.failed("effect", id, error, "legacy")
		else XposedBridge.log("[VFX] legacy capture $id failed, using the overlay: $error")
		stop()
	}
	fun stop() {
		val previous = session
		session = null
		previous?.close()
		if (status == "Capturing" || status.startsWith("Starting")) status = "Stopped"
	}
	private fun finished(s: Session) {
		if (session !== s) return
		status = "Completed"
		stop()
	}

	private class Session(val root: ViewGroup, val driver: CaptureDriver) :
		TextureView.SurfaceTextureListener, View.OnAttachStateChangeListener {
		private val width = root.width
		private val height = root.height
		private val scale = min(1f, 600f / max(width, height))
		private val bitmap = Bitmap.createBitmap(max(1, ceil(width * scale).toInt()), max(1, ceil(height * scale).toInt()), Bitmap.Config.ARGB_8888)
		private val canvas = Canvas(bitmap)
		private val thread = HandlerThread("VFX-LegacyCapture").apply { start() }
		private val worker = Handler(thread.looper)
		private val gl = CaptureGl(driver.fragment)
		private var capturing = false
		@Volatile private var closed = false
		@Volatile private var ready = false
		private var captureTotalMs = 0.0
		private var rendering = false
		private var ownedSurface: SurfaceTexture? = null
		private var slowFrames = 0
		private val textureView = TextureView(root.context).apply {
			isOpaque = false
			isClickable = false
			isFocusable = false
			importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
			surfaceTextureListener = this@Session
		}
		private val overlay = object : FrameLayout(root.context) {
			// TextureView.draw is final; exclude its container from software capture instead.
			override fun draw(canvas: Canvas) { if (!capturing) super.draw(canvas) }
		}.apply {
			isClickable = false
			isFocusable = false
			importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
			addView(textureView, FrameLayout.LayoutParams(this@Session.width, this@Session.height))
		}
		private val capture = Runnable { captureFrame() }
		// GL animation reuses the last uploaded texture; UI capture has its own slower cadence.
		private val render = object : Runnable {
			override fun run() {
				if (closed) return
				val started = SystemClock.elapsedRealtimeNanos()
				try {
					if (!gl.draw(width, height, driver)) {
						mainHandler.post { finished(this@Session) }
						return
					}
					renderMs = (SystemClock.elapsedRealtimeNanos() - started) / 1e6
					frames++
					worker.postDelayed(this, max(1L, 33L - renderMs.toLong()))
				} catch (error: Throwable) {
					mainHandler.post { if (!closed) fail(driver, error) }
				}
			}
		}
		private val timeout = Runnable {
			if (!closed && !ready) fail(driver, IllegalStateException("Texture surface did not become ready"))
		}
		fun start() {
			imageSize = "${bitmap.width}×${bitmap.height}"
			overlay.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
				View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
			overlay.layout(0, 0, width, height)
			root.overlay.add(overlay)
			root.addOnAttachStateChangeListener(this)
			mainHandler.postDelayed(timeout, 2000L)
		}
		override fun onSurfaceTextureAvailable(surface: SurfaceTexture, w: Int, h: Int) {
			ownedSurface = surface
			worker.post {
				if (closed) return@post
				runCatching { gl.init(surface, width, height) }.fold(
					onSuccess = { mainHandler.post { if (!closed) captureFrame() } },
					onFailure = { error -> mainHandler.post { if (!closed) fail(driver, error) } },
				)
			}
		}
		private fun captureFrame() {
			if (closed) return
			if (!enabled || !root.isAttachedToWindow || !root.isShown ||
				root.width != width || root.height != height) { stop(); return }
			if (separateSurface(root)) { status = "Stopped: separately rendered content appeared"; stop(); return }
			val started = SystemClock.elapsedRealtimeNanos()
			val save = canvas.save()
			try {
				bitmap.eraseColor(android.graphics.Color.TRANSPARENT)
				canvas.scale(bitmap.width.toFloat() / width, bitmap.height.toFloat() / height)
				capturing = true
				root.draw(canvas)
			} catch (error: Throwable) {
				fail(driver, error)
				return
			} finally { capturing = false; canvas.restoreToCount(save) }
			captureMs = (SystemClock.elapsedRealtimeNanos() - started) / 1e6
			captures++
			captureTotalMs += captureMs
			averageCaptureMs = captureTotalMs / captures
			peakCaptureMs = max(peakCaptureMs, captureMs)
			// Aim for at most ~25% UI-thread occupancy; back off only, avoiding cadence oscillation.
			captureIntervalMs = max(captureIntervalMs, (averageCaptureMs * 4).toLong().coerceIn(50L, 100L))
			if (captureMs > 40.0) slowFrames++ else slowFrames = 0
			if (captureMs > 120.0 || slowFrames >= 3) {
				status = "Stopped: view capture too slow (${captureMs.toInt()} ms)"
				stop()
				return
			}
			if (!ready) { ready = true; mainHandler.removeCallbacks(timeout) }
			worker.post {
				if (closed) return@post
				val result = runCatching {
					gl.upload(bitmap)
					if (!rendering) { rendering = true; worker.post(render) }
				}
				mainHandler.post {
					if (closed) return@post
					if (result.isFailure) { fail(driver, result.exceptionOrNull()!!); return@post }
					totalMs = (SystemClock.elapsedRealtimeNanos() - started) / 1e6
					status = "Capturing"
					// Backpressure: never overwrite this bitmap until its upload finishes. Drop late slots.
					mainHandler.postDelayed(capture, max(1L, captureIntervalMs - totalMs.toLong()))
				}
			}
		}
		fun close() {
			if (closed) return
			closed = true
			mainHandler.removeCallbacks(capture)
			mainHandler.removeCallbacks(timeout)
			worker.removeCallbacks(render)
			root.removeOnAttachStateChangeListener(this)
			root.overlay.remove(overlay)
			val surface = ownedSurface
			worker.post {
				try { gl.close() } finally { surface?.release(); bitmap.recycle(); thread.quitSafely() }
			}
		}
		override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
			if (!closed) stop()
			// Release the SurfaceTexture after queued EGL work, not under an in-flight swap.
			return false
		}
		override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, w: Int, h: Int) {}
		override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
		override fun onViewAttachedToWindow(view: View) {}
		override fun onViewDetachedFromWindow(view: View) { stop() }
	}
}

/**
 * Up to [MAX_TAPS] taps of one effect. Each tap's clock starts on its first drawn frame, so the
 * EGL start-up doesn't eat the beginning of the first one. Main thread adds, worker reads.
 */
private class TapDriver(val id: String, override val fragment: String, private val width: Int, private val height: Int) : CaptureDriver {
	private class Tap(val x: Float, val y: Float, val k: Float, val seconds: Float) { var born = 0L }
	private val taps = ArrayList<Tap>(MAX_TAPS)
	private val density = Resources.getSystem().displayMetrics.density
	private val values = FloatArray(MAX_TAPS * 4)

	fun add(x: Float, y: Float, strength: Float) {
		val far = hypot(max(x, width - x), max(y, height - y))
		val seconds = when (id) {
			"ripple" -> (far / (1000f * density) + 0.55f).coerceIn(0.7f, 1.8f)
			"shockwave" -> far / (1100f * density) + 0.1f
			"swirl" -> 0.8f
			"glitch" -> 0.5f
			"pixel" -> 0.6f
			"timejump" -> 0.9f
			else -> 1.8f
		}
		synchronized(this) {
			if (taps.size == MAX_TAPS) taps.removeAt(0)
			taps += Tap(x, y, strength.coerceIn(0.1f, 3f), seconds)
		}
	}

	override fun bind(u: GlUniforms): Boolean = synchronized(this) {
		val now = SystemClock.uptimeMillis()
		for (tap in taps) if (tap.born == 0L) tap.born = now
		taps.removeAll { (now - it.born) / 1000f >= it.seconds }
		if (taps.isEmpty()) return false
		values.fill(0f)
		taps.forEachIndexed { i, tap ->
			values[i * 4] = tap.x
			values[i * 4 + 1] = tap.y
			values[i * 4 + 2] = tap.k
			values[i * 4 + 3] = (now - tap.born) / 1000f
		}
		u.int("count", taps.size)
		u.vec4s("taps", values, MAX_TAPS)
		u.float("dose", Settings.dose)
		true
	}

	companion object { const val MAX_TAPS = 4 }
}

/** Uniforms published by a [FingerModel] on the main thread, read on the worker. */
private class FingerDriver(val id: String, override val fragment: String) : CaptureDriver {
	@Volatile var uniforms: List<Pair<String, FloatArray>> = emptyList()
	@Volatile var done = false
	override fun bind(u: GlUniforms): Boolean {
		if (done) return false
		for ((name, v) in uniforms) u.floats(name, v)
		u.float("dose", Settings.dose)
		return true
	}
}

/** Steps a [FingerModel] on the main thread and shows it through a capture session. */
private class LegacyFinger(root: ViewGroup, private val id: String, private val model: FingerModel) : FingerEffect {
	private val rootRef = WeakReference(root)
	private var driver: FingerDriver? = null
	private var lastFrame = 0L
	private var looping = false

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (!looping) return
			val d = driver
			if (d == null || !LegacyCapture.running(d) || !Rendering.available("effect", id)) { cancel(); return }
			val dt = if (lastFrame == 0L) 1f / 60f else ((frameTimeNanos - lastFrame) / 1e9f).coerceIn(0.001f, 0.05f)
			lastFrame = frameTimeNanos
			model.step(dt)
			if (!model.held && model.settled()) { cancel(); return }
			d.uniforms = model.uniforms()
			Choreographer.getInstance().postFrameCallback(this)
		}
	}

	override fun press(x: Float, y: Float, intensity: Float) {
		val root = rootRef.get() ?: return
		model.press(x, y, intensity)
		val current = driver
		if (current == null || !LegacyCapture.running(current)) {
			val fresh = FingerDriver(id, FINGER_SHADERS.getValue(id))
			fresh.uniforms = model.uniforms()
			if (!LegacyCapture.start(root, fresh)) { model.reset(); return }
			driver = fresh
		}
		if (!looping) {
			looping = true
			lastFrame = 0L
			Choreographer.getInstance().postFrameCallback(frame)
		}
	}

	override fun move(x: Float, y: Float) = model.move(x, y)
	override fun release() = model.release()

	override fun cancel() {
		looping = false
		Choreographer.getInstance().removeFrameCallback(frame)
		model.reset()
		driver?.let { d ->
			d.done = true
			if (LegacyCapture.running(d)) LegacyCapture.stop()
		}
		driver = null
	}
}

/**
 * The physics of a finger effect, apart from how it's drawn. Same constants as the Android 13
 * versions in Finger.kt and Lens.kt. Main thread.
 */
private abstract class FingerModel {
	protected val density = Resources.getSystem().displayMetrics.density
	var held = false
		protected set
	protected var x = 0f
	protected var y = 0f
	abstract fun press(x: Float, y: Float, intensity: Float)
	fun move(x: Float, y: Float) { this.x = x; this.y = y }
	fun release() { held = false }
	abstract fun step(dt: Float)
	abstract fun settled(): Boolean
	abstract fun reset()
	abstract fun uniforms(): List<Pair<String, FloatArray>>
	protected fun spring(value: Float, velocity: Float, target: Float, stiffness: Float, damping: Float, dt: Float): Pair<Float, Float> {
		val v = velocity + (stiffness * (target - value) - damping * velocity) * dt
		return (value + v * dt) to v
	}
}

private class LensModel : FingerModel() {
	private var radius = 90f * density
	private var strength = 0f

	override fun press(x: Float, y: Float, intensity: Float) {
		radius = (70f + 40f * min(intensity, 2f)) * density
		move(x, y)
		held = true
	}
	// Opens in 160 ms and closes in 200 ms, eased like the modern lens's animator.
	override fun step(dt: Float) {
		strength = if (held) min(1f, strength + dt / 0.16f) else max(0f, strength - dt / 0.2f)
	}
	override fun settled() = strength <= 0.001f
	override fun reset() { strength = 0f }
	override fun uniforms(): List<Pair<String, FloatArray>> {
		val eased = strength * strength * (3f - 2f * strength)
		return listOf("center" to floatArrayOf(x, y), "strength" to floatArrayOf(eased), "radius" to floatArrayOf(radius))
	}
}

private class JellyModel : FingerModel() {
	private var radius = 90f
	private var dent = 0f
	private var dentV = 0f
	private var ax = 0f
	private var ay = 0f
	private var avx = 0f
	private var avy = 0f

	override fun press(x: Float, y: Float, intensity: Float) {
		radius = (55f + 35f * min(intensity, 2f)) * density
		if (!held && settled()) { ax = x; ay = y; avx = 0f; avy = 0f }
		move(x, y)
		held = true
	}
	override fun step(dt: Float) {
		spring(dent, dentV, if (held) 1f else 0f, 220f, 9f, dt).let { (v, vel) -> dent = v; dentV = vel }
		spring(ax, avx, x, 140f, 8f, dt).let { (v, vel) -> ax = v; avx = vel }
		spring(ay, avy, y, 140f, 8f, dt).let { (v, vel) -> ay = v; avy = vel }
	}
	override fun settled() =
		abs(dent) < 0.004f && abs(dentV) < 0.02f && hypot(x - ax, y - ay) < 0.5f && hypot(avx, avy) < 2f
	override fun reset() { dent = 0f; dentV = 0f; avx = 0f; avy = 0f; ax = x; ay = y }
	override fun uniforms(): List<Pair<String, FloatArray>> {
		var px = x - ax
		var py = y - ay
		val len = hypot(px, py)
		val cap = radius * 0.8f
		if (len > cap) { px *= cap / len; py *= cap / len }
		return listOf("center" to floatArrayOf(x, y), "pull" to floatArrayOf(px, py),
			"dent" to floatArrayOf(dent), "radius" to floatArrayOf(radius))
	}
}

private class BlackHoleModel : FingerModel() {
	private var radius = 80f
	private var strength = 0f
	private var strengthV = 0f
	private var time = 0f
	private var cx = 0f
	private var cy = 0f

	override fun press(x: Float, y: Float, intensity: Float) {
		radius = (60f + 30f * min(intensity, 2f)) * density
		if (!held && settled()) { cx = x; cy = y }
		move(x, y)
		held = true
	}
	override fun step(dt: Float) {
		time += dt
		if (held) {
			strength = min(1f, strength + dt / 1.5f)
			strengthV = 0f
		} else {
			spring(strength, strengthV, 0f, 120f, 7f, dt).let { (v, vel) -> strength = v; strengthV = vel }
		}
		val k = 1f - exp(-dt * 10f)
		cx += (x - cx) * k
		cy += (y - cy) * k
	}
	override fun settled() = abs(strength) < 0.004f && abs(strengthV) < 0.02f
	override fun reset() { strength = 0f; strengthV = 0f; time = 0f }
	override fun uniforms(): List<Pair<String, FloatArray>> = listOf("center" to floatArrayOf(cx, cy),
		"strength" to floatArrayOf(strength), "radius" to floatArrayOf(radius), "time" to floatArrayOf(time))
}

/** Uniform setters with cached locations. Unused names resolve to -1, which GL ignores. Worker thread. */
internal class GlUniforms(private val program: Int) {
	private val locations = HashMap<String, Int>()
	private fun at(name: String) = locations.getOrPut(name) { GLES20.glGetUniformLocation(program, name) }
	fun float(name: String, v: Float) = GLES20.glUniform1f(at(name), v)
	fun int(name: String, v: Int) = GLES20.glUniform1i(at(name), v)
	fun floats(name: String, v: FloatArray) = when (v.size) {
		1 -> GLES20.glUniform1f(at(name), v[0])
		2 -> GLES20.glUniform2f(at(name), v[0], v[1])
		3 -> GLES20.glUniform3f(at(name), v[0], v[1], v[2])
		else -> GLES20.glUniform4f(at(name), v[0], v[1], v[2], v[3])
	}
	fun vec4s(name: String, v: FloatArray, count: Int) = GLES20.glUniform4fv(at(name), count, v, 0)
}

/** EGL and texture ownership stay entirely on the worker thread. No API 31/33 dependencies. */
private class CaptureGl(private val fragmentSource: String) {
	private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
	private var context: EGLContext = EGL14.EGL_NO_CONTEXT
	private var surface: EGLSurface = EGL14.EGL_NO_SURFACE
	private var program = 0
	private val texture = IntArray(1)
	private var uploaded = false
	private var uniforms: GlUniforms? = null
	private val density = Resources.getSystem().displayMetrics.density
	private val vertices = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
		put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0)
	}
	fun init(target: SurfaceTexture, width: Int, height: Int) {
		display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
		check(EGL14.eglInitialize(display, IntArray(2), 0, IntArray(2), 0)) { "EGL initialization failed" }
		val configs = arrayOfNulls<EGLConfig>(1)
		val count = IntArray(1)
		check(EGL14.eglChooseConfig(display, intArrayOf(EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
			EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT, EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8,
			EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8, EGL14.EGL_NONE), 0, configs, 0, 1, count, 0) && count[0] > 0)
		context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT,
			intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
		surface = EGL14.eglCreateWindowSurface(display, configs[0], target, intArrayOf(EGL14.EGL_NONE), 0)
		check(EGL14.eglMakeCurrent(display, surface, surface, context)) { "EGL surface unavailable" }
		program = GLES20.glCreateProgram()
		val vertex = compile(GLES20.GL_VERTEX_SHADER, VERTEX)
		val fragment = try { compile(GLES20.GL_FRAGMENT_SHADER, fragmentSource) } catch (error: Throwable) {
			GLES20.glDeleteShader(vertex); throw error
		}
		GLES20.glAttachShader(program, vertex)
		GLES20.glAttachShader(program, fragment)
		GLES20.glBindAttribLocation(program, 0, "position")
		GLES20.glLinkProgram(program)
		GLES20.glDeleteShader(vertex)
		GLES20.glDeleteShader(fragment)
		val linked = IntArray(1)
		GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
		check(linked[0] != 0) { GLES20.glGetProgramInfoLog(program) }
		GLES20.glUseProgram(program)
		uniforms = GlUniforms(program)
		GLES20.glGenTextures(1, texture, 0)
		GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture[0])
		GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
		GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
		GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
		GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
		GLES20.glViewport(0, 0, width, height)
	}
	private fun compile(type: Int, source: String): Int {
		val shader = GLES20.glCreateShader(type)
		GLES20.glShaderSource(shader, source)
		GLES20.glCompileShader(shader)
		val compiled = IntArray(1)
		GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
		if (compiled[0] == 0) {
			val reason = GLES20.glGetShaderInfoLog(shader)
			GLES20.glDeleteShader(shader)
			error(reason)
		}
		return shader
	}
	fun upload(bitmap: Bitmap) {
		GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture[0])
		if (uploaded) GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, bitmap)
		else { GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0); uploaded = true }
		check(GLES20.glGetError() == GLES20.GL_NO_ERROR) { "OpenGL upload failed" }
	}
	/** One frame; false once [driver] says the effect is over. */
	fun draw(width: Int, height: Int, driver: CaptureDriver): Boolean {
		val u = uniforms ?: return false
		u.int("image", 0)
		u.floats("size", floatArrayOf(width.toFloat(), height.toFloat()))
		u.float("density", density)
		if (!driver.bind(u)) return false
		GLES20.glEnableVertexAttribArray(0)
		GLES20.glVertexAttribPointer(0, 2, GLES20.GL_FLOAT, false, 0, vertices)
		GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
		check(GLES20.glGetError() == GLES20.GL_NO_ERROR) { "OpenGL draw failed" }
		check(EGL14.eglSwapBuffers(display, surface)) { "OpenGL swap failed" }
		return true
	}
	fun close() {
		if (display == EGL14.EGL_NO_DISPLAY) return
		if (context != EGL14.EGL_NO_CONTEXT && surface != EGL14.EGL_NO_SURFACE) {
			EGL14.eglMakeCurrent(display, surface, surface, context)
			GLES20.glDeleteTextures(1, texture, 0)
			if (program != 0) GLES20.glDeleteProgram(program)
		}
		EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
		if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface)
		if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
		EGL14.eglTerminate(display)
		EGL14.eglReleaseThread()
	}
	companion object {
		private const val VERTEX = """
attribute vec2 position;
varying vec2 uv;
void main() { gl_Position = vec4(position, 0.0, 1.0); uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5); }
"""
	}
}

// ------------------------------------------------------------ shaders
// GLSL ES 2 ports of the AGSL in Styles.kt, Lens.kt and Finger.kt, in view pixels (p = uv * size,
// top-left origin). Each multiplies its output by a mask that is zero wherever it leaves the screen
// alone, so the live UI shows through there instead of the slightly stale, low-res capture.

private const val GL_HEAD = """
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D image;
uniform vec2 size;
uniform float density;
uniform float dose;
vec4 img(vec2 p) { return texture2D(image, clamp(p / size, 0.0, 1.0)); }
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec4 finish(vec2 p, vec2 offset, float add, vec2 split) {
    vec2 q = p + offset;
    vec4 c = img(q);
    vec2 s = split + offset * dose;
    if (s.x != 0.0 || s.y != 0.0) {
        c.r = img(q + s).r;
        c.b = img(q - s).b;
    }
    c.rgb += add * c.a;
    return c;
}
"""

/** Tap effects get up to four taps: x, y, intensity, seconds since the tap. */
private const val GL_TAPS = GL_HEAD + """
uniform int count;
uniform vec4 taps[4];
"""

/** The original legacy travelling wave: only a narrow band is drawn, so live UI stays visible elsewhere. */
private const val GL_RIPPLE = GL_TAPS + """
void main() {
    vec2 p = uv * size;
    vec2 offset = vec2(0.0);
    float mask = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        vec2 d = (p - tp.xy) / density;
        float dist = length(d);
        float duration = clamp(length(max(tp.xy, size - tp.xy)) / density / 1000.0 + 0.55, 0.7, 1.8);
        float lag = tp.w - dist / 1000.0;
        float env = smoothstep(0.0, 0.035, lag) * (1.0 - smoothstep(0.22, 0.55, lag));
        env *= 1.0 - smoothstep(duration - 0.18, duration, tp.w);
        float wave = sin(lag * 26.0) * exp(-max(lag, 0.0) * 5.0) * env;
        offset += d / max(dist, 1.0) * 14.0 * tp.z * wave * density;
        mask = max(mask, env);
    }
    gl_FragColor = finish(p, offset, 0.0, vec2(0.0)) * mask;
}
"""

private const val GL_SHOCKWAVE = GL_TAPS + """
void main() {
    vec2 p = uv * size;
    vec2 offset = vec2(0.0);
    float add = 0.0;
    float mask = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        float k = tp.z;
        float radius = tp.w * 1100.0 * density;
        float width = (26.0 + 14.0 * min(k, 2.0)) * density;
        vec2 d = p - tp.xy;
        float dist = length(d);
        float diff = dist - radius;
        if (dist < 1.0 || abs(diff) >= width) continue;
        float x = diff / width;
        float body = (1.0 - x * x) * (1.0 - x * x);
        float fade = exp(-1.4 * tp.w) * clamp(radius / (40.0 * density), 0.0, 1.0);
        offset -= (d / dist) * x * body * 34.0 * density * k * fade;
        add += 0.16 * body * fade * min(k, 1.5);
        mask = max(mask, clamp(body * fade * 8.0, 0.0, 1.0));
    }
    gl_FragColor = finish(p, offset, add, vec2(0.0)) * mask;
}
"""

private const val GL_SWIRL = GL_TAPS + """
void main() {
    vec2 p = uv * size;
    vec2 q = p;
    float mask = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        float env = sin(3.14159265 * clamp(tp.w / 0.8, 0.0, 1.0));
        float radius = (160.0 + 90.0 * min(tp.z, 2.0)) * density;
        vec2 d = q - tp.xy;
        float dist = length(d);
        if (dist >= radius) continue;
        float f = 1.0 - dist / radius;
        float angle = f * f * 2.6 * tp.z * env;
        float s = sin(angle);
        float c = cos(angle);
        q = tp.xy + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        mask = max(mask, clamp(f * env * 8.0, 0.0, 1.0));
    }
    gl_FragColor = finish(p, q - p, 0.0, vec2(0.0)) * mask;
}
"""

private const val GL_GLITCH = GL_TAPS + """
void main() {
    vec2 p = uv * size;
    vec2 offset = vec2(0.0);
    float add = 0.0;
    float split = 0.0;
    float mask = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        float e = pow(1.0 - clamp(tp.w / 0.5, 0.0, 1.0), 1.5);
        if (e <= 0.0) continue;
        float k = tp.z;
        float frame = floor(tp.w * 24.0) + float(i) * 17.0;
        vec2 d = p - tp.xy;
        float near = exp(-abs(d.y) / (220.0 * density)) * mix(0.6, 1.0, exp(-abs(d.x) / (400.0 * density)));
        float bandHeight = (6.0 + 34.0 * hash(frame * 1.31 + 0.5)) * density;
        float band = floor(p.y / bandHeight);
        if (hash(band * 12.9898 + frame * 78.233) > 0.62) {
            offset.x += (hash(band * 3.7 + frame * 1.9) - 0.5) * 140.0 * density * k * e * near;
        }
        split += 7.0 * density * min(k, 2.0) * e * (0.4 + 0.6 * near);
        add += (hash(frame * 5.3 + 0.25) - 0.5) * 0.12 * e * near;
        mask = max(mask, clamp(e * 4.0, 0.0, 1.0));
    }
    gl_FragColor = finish(p, offset, add, vec2(split, 0.0)) * mask;
}
"""

private const val GL_PIXEL = GL_TAPS + """
void main() {
    vec2 p = uv * size;
    float block = 1.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        float k = min(tp.z, 2.0);
        float pr = clamp(tp.w / 0.6, 0.0, 1.0);
        float radius = (60.0 + 220.0 * k) * density * (0.3 + 0.7 * sqrt(pr));
        float dist = length(p - tp.xy);
        float edge = 1.0 - smoothstep(radius * 0.7, radius, dist);
        block = max(block, 1.0 + (22.0 * density * k - 1.0) * (1.0 - pr) * edge);
    }
    vec2 offset = vec2(0.0);
    if (block > 1.5) offset = (floor(p / block) + 0.5) * block - p;
    gl_FragColor = finish(p, offset, 0.0, vec2(0.0)) * clamp((block - 1.0) * 2.0, 0.0, 1.0);
}
"""

private fun glInk(inkColor: String) = GL_TAPS + inkColor + """
void main() {
    vec2 p = uv * size;
    vec2 offset = vec2(0.0);
    vec3 tint = vec3(0.0);
    float amount = 0.0;
    float rims = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        float pr = clamp(tp.w / 1.8, 0.0, 1.0);
        float k = min(tp.z, 2.0);
        vec2 d = p - tp.xy;
        float dist = length(d);
        float seed = tp.x * 0.013 + tp.y * 0.007;
        float ang = atan(d.y, d.x);
        float wobble = 1.0 + 0.16 * sin(ang * 5.0 + seed * 9.0 + pr * 2.0) + 0.09 * sin(ang * 11.0 - seed * 5.0) + 0.05 * sin(ang * 23.0 + seed);
        float radius = (70.0 + 110.0 * k) * density * (1.0 - exp(-4.0 * pr)) * wobble;
        float edge = 1.0 - smoothstep(radius * 0.85, radius, dist);
        float fade = pow(1.0 - pr, 1.2);
        float swirlInk = 0.8 + 0.2 * sin(dist / (9.0 * density) - pr * 6.0 + ang * 3.0);
        float a = edge * fade * swirlInk * 0.8;
        tint += inkColor(seed, tp.xy) * a;
        amount += a;
        float rim = exp(-abs(dist - radius) / (10.0 * density)) * fade;
        rims += rim;
        if (dist > 0.5) offset += d / dist * rim * 9.0 * density * k;
    }
    vec4 c = finish(p, offset, 0.0, vec2(0.0));
    if (amount > 0.0) {
        float a = min(amount, 0.9);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(c.rgb, (tint / amount) * (0.7 + 0.45 * l) * c.a, a);
    }
    gl_FragColor = c * clamp((amount + rims) * 3.0, 0.0, 1.0);
}
"""

private val GL_INK = glInk("""
vec3 inkColor(float n, vec2 center) {
    float h = hash(n);
    if (h < 0.2) return vec3(1.0, 0.05, 0.55);
    if (h < 0.4) return vec3(0.0, 0.45, 1.0);
    if (h < 0.6) return vec3(0.62, 0.08, 1.0);
    if (h < 0.8) return vec3(0.0, 0.95, 0.55);
    return vec3(1.0, 0.45, 0.0);
}
""")

private val GL_INK_MONO = glInk("""
vec3 inkColor(float n, vec2 center) {
    float l = dot(img(center).rgb, vec3(0.2126, 0.7152, 0.0722));
    return l > 0.5 ? vec3(0.02) : vec3(1.0);
}
""")

private const val GL_LENS = GL_HEAD + """
uniform vec2 center;
uniform float strength;
uniform float radius;
void main() {
    vec2 p = uv * size;
    vec2 d = p - center;
    float dist = length(d);
    if (dist >= radius) { gl_FragColor = vec4(0.0); return; }
    float x = dist / radius;
    float scale = 1.0 - strength * 0.45 * (1.0 - x * x);
    vec2 offset = -d * (1.0 - scale);
    float rimWidth = 3.0 * density / radius;
    float add = strength * (0.12 * smoothstep(1.0 - rimWidth * 2.0, 1.0, x) + 0.04 * (1.0 - x));
    // The modern lens splits by half the offset; finish adds a full one, so take half back.
    gl_FragColor = finish(p, offset, add, -offset * dose * 0.5) * clamp(strength * 20.0, 0.0, 1.0);
}
"""

private const val GL_JELLY = GL_HEAD + """
uniform vec2 center;
uniform vec2 pull;
uniform float dent;
uniform float radius;
void main() {
    vec2 p = uv * size;
    vec2 d = p - center;
    float w = exp(-dot(d, d) / (radius * radius));
    vec2 offset = -pull * w + d * dent * 0.35 * w;
    vec4 c = img(clamp(p + offset, vec2(0.0), size - 1.0));
    float shade = 1.0 - 0.14 * dent * w;
    vec2 n = normalize(d + vec2(0.0001));
    float sheen = max(0.0, dot(n, vec2(-0.7071, -0.7071))) * w * abs(dent) * 0.10;
    c.rgb = c.rgb * shade + sheen * c.a;
    gl_FragColor = c * clamp(w * (abs(dent) + length(pull) / radius) * 30.0, 0.0, 1.0);
}
"""

private const val GL_BLACKHOLE = GL_HEAD + """
uniform vec2 center;
uniform float strength;
uniform float radius;
uniform float time;
void main() {
    vec2 p = uv * size;
    vec2 d = p - center;
    float r = length(d);
    float s = max(strength, 0.0);
    float reach = radius * (0.7 + 1.6 * s);
    float f = clamp(1.0 - r / reach, 0.0, 1.0);
    f = f * f;
    if (f <= 0.0) { gl_FragColor = vec4(0.0); return; }
    float angle = strength * 5.0 * f + s * f * time * 0.8;
    float ca = cos(angle);
    float sa = sin(angle);
    vec2 rd = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
    rd *= 1.0 + strength * 2.2 * f;
    vec4 c = img(clamp(center + rd, vec2(0.0), size - 1.0));
    vec3 rgb = c.rgb;
    float horizon = radius * 0.22 * s;
    float dark = 1.0 - smoothstep(horizon * 0.85, horizon * 1.15, r);
    float ring = exp(-abs(r - horizon * 1.2) / (5.0 * density)) * s;
    vec3 glow = mix(vec3(1.0, 0.55, 0.15), vec3(0.65, 0.35, 1.0), 0.5 + 0.5 * sin(atan(d.y, d.x) * 3.0 + time * 2.0));
    rgb = rgb * (1.0 - dark) + glow * ring * 0.9;
    rgb *= 1.0 - 0.35 * f * s;
    float a = max(c.a, max(dark, ring));
    gl_FragColor = vec4(rgb, a) * clamp(f * 12.0, 0.0, 1.0) * clamp(abs(strength) * 30.0, 0.0, 1.0);
}
"""

/** Time jump (Styles.kt): the flash, the jagged arcs and the pull-then-pop. */
private const val GL_TIMEJUMP = GL_TAPS + """
void main() {
    vec2 p = uv * size;
    vec2 offset = vec2(0.0);
    float glow = 0.0;
    float white = 0.0;
    float strength = 0.0;
    float mask = 0.0;
    for (int i = 0; i < 4; i++) {
        if (i >= count) break;
        vec4 tp = taps[i];
        float time = tp.w;
        float pr = clamp(time / 0.9, 0.0, 1.0);
        float k = min(tp.z, 2.0);
        vec2 d = p - tp.xy;
        float dist = length(d);
        float r = dist / density;
        float pull = pr < 0.55 ? sin(3.14159265 * pr / 0.55) : 0.0;
        float pop = pr >= 0.55 ? exp(-(pr - 0.55) * 9.0) : 0.0;
        float reach = 120.0 + 80.0 * k;
        float near = exp(-r / reach);
        if (dist > 0.5) offset += d / dist * (pull * 22.0 - pop * 30.0) * density * k * near;
        float w = exp(-r / (26.0 + 14.0 * k)) * (exp(-pr * 10.0) * 1.2 + pop * 0.8);
        white += w;
        float seed = tp.x * 0.013 + tp.y * 0.007 + floor(time * 20.0) * 1.7;
        float ang = atan(d.y, d.x);
        float len = reach * 1.6 * (0.3 + 0.7 * sqrt(pr));
        float n = floor(r / 14.0);
        float f = fract(r / 14.0);
        for (int j = 0; j < 6; j++) {
            float fj = float(j);
            float base = (fj + hash(seed + fj)) * 1.0471976;
            float da = ang - base;
            da -= 6.2831853 * floor((da + 3.14159265) / 6.2831853);
            float lateral = (mix(hash(seed + fj * 7.0 + n), hash(seed + fj * 7.0 + n + 1.0), f) - 0.5) * 24.0;
            float dev = abs(da * r - lateral);
            float flicker = 0.6 + 0.4 * hash(seed + fj * 11.0);
            glow += (exp(-dev / 1.4) + 0.35 * exp(-dev / 7.0)) * (1.0 - smoothstep(len * 0.6, len, r))
                * smoothstep(2.0, 10.0, r) * (1.0 - pr) * flicker;
        }
        strength = max(strength, min(k, 1.5));
        mask = max(mask, clamp((pull + pop) * near * 3.0 + w, 0.0, 1.0));
    }
    vec4 c = finish(p, offset, 0.0, vec2(0.0));
    c.rgb += (vec3(0.45, 0.75, 1.0) * glow + vec3(0.85, 0.93, 1.0) * white) * strength * c.a;
    gl_FragColor = c * clamp(max(mask, glow * 2.0), 0.0, 1.0);
}
"""

private val TAP_SHADERS = mapOf(
	"ripple" to GL_RIPPLE, "shockwave" to GL_SHOCKWAVE, "swirl" to GL_SWIRL, "glitch" to GL_GLITCH,
	"pixel" to GL_PIXEL, "ink" to GL_INK, "inkmono" to GL_INK_MONO, "timejump" to GL_TIMEJUMP,
)
private val FINGER_SHADERS = mapOf(STYLE_LENS to GL_LENS, STYLE_JELLY to GL_JELLY, STYLE_BLACKHOLE to GL_BLACKHOLE)
