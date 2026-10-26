package com.bleelblep.sparkle

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

/**
 * The ride: the Headless Horseman on his horse, galloping edge to edge along the floor for a few
 * minutes, in the Nyan party's mould. A tap on the rider or the horse ends it early; it ends by itself
 * after the set minutes. Discord stays usable: only taps on them are taken. Main thread only.
 *
 * On Android 13 and up it is [ShaderRideView]: Discord itself turns to a moonlit night (a live shader on
 * the content view, so it keeps scrolling and updating), the pumpkin throws a warm pool of light that
 * travels with him, fog drifts along the bottom, and the hooves leave real fire with heat haze. Older
 * phones, and ones whose shaders fail, get [LegacyRideView], the 0.17.1 ride.
 */
internal object Ride {
	/** What both ride views offer [Ride]. */
	interface Scene {
		var finished: Boolean
		fun stopSoon()
	}

	private var view: View? = null
	val active get() = view != null

	/**
	 * Starts on [root] from [startX] (decor pixels) facing [facing], at [px] screen pixels per art pixel,
	 * for [minutes]. [floor] is asked each frame (the keyboard moves it); [onEnd] gets where the ride
	 * stopped (x, facing) once the rider is off.
	 */
	fun start(root: ViewGroup, look: SheetLook, px: Float, startX: Float, facing: Int, minutes: Int, floor: () -> Float,
	          onEnd: (x: Float, facing: Int) -> Unit) {
		cancel()
		val end = { x: Float, f: Int ->
			cancel()
			onEnd(x, f)
		}
		val v: View = (if (ScreenBreak.shadersReady) runCatching {
			ShaderRideView(root, look, Companion.horseLook(), px, startX, facing, minutes * 60f, floor, end)
		}.onFailure {
			ScreenBreak.shadersBroken = true
			android.util.Log.w("Sparkle", "ride shaders unavailable: ${it.message}")
		}.getOrNull() else null) ?: LegacyRideView(root.context, look, Companion.horseLook(), px, startX, facing, minutes * 60f, floor, end)
		root.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		view = v
	}

	/** Ends gently: the scene fades and the rider gets off. */
	fun stop() { (view as? Scene)?.stopSoon() }

	fun cancel() {
		val v = view ?: return
		view = null
		(v as? Scene)?.finished = true
		(v.parent as? ViewGroup)?.removeView(v)
	}
}
