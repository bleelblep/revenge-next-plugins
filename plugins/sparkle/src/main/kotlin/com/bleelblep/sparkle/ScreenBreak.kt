package com.bleelblep.sparkle

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.max

/**
 * The boss pets' tricks on the screen itself. A snapshot of Discord's window is taken (everything of
 * ours hidden for the frame), shown in an overlay just under the pet, and then abused: sliced along the
 * scythe's swing (CUT, or three in a row: FLURRY), burnt through by a thrown jack-o'-lantern (PUMPKIN),
 * twisted into a draining swirl (REAP), torn open by claws (CLAWS), hooked by a chain and stretched
 * toward Krampus (HOOK), or cracked like glass by a head-butt (HORN). The real UI never moves: the
 * overlay sits over it, and whatever happens, it is removed when the timeline ends, on cancel, or if the
 * view is torn down.
 *
 * On Android 13 and up the overlay is [ShaderBreakView] (AGSL, the snapshot as its input). Older
 * phones, and ones whose shaders won't compile or draw, get [LegacyBreakView], the Canvas version.
 *
 * The snapshot is a software draw of the decor (as VFX's LegacyCapture does): SurfaceViews come out
 * blank, which is acceptable for a second. It is taken at half size when a full-size one would be
 * large, and recycled on removal. The overlay takes no touches. Main thread only.
 */
internal object ScreenBreak {
	/** FLURRY, PUMPKIN and REAP are shader-only: [Boss] offers them only when [shadersReady]. */
	enum class Kind { CUT, CLAWS, HOOK, HORN, FLURRY, PUMPKIN, REAP }

	/** What both overlays offer: drop the snapshot. */
	interface Effect {
		fun release()
	}

	private var view: View? = null
	val active get() = view != null

	/** Set when a shader failed to compile or draw: every later effect uses the legacy overlay. */
	var shadersBroken = false
	val shadersReady get() = Build.VERSION.SDK_INT >= 33 && !shadersBroken

	/** The legacy overlay's nearest trick for a shader-only one (a shader that failed mid-session). */
	private fun legacyKind(kind: Kind) = when (kind) {
		Kind.FLURRY -> Kind.CUT
		Kind.PUMPKIN, Kind.REAP -> Kind.HORN
		else -> kind
	}

	/**
	 * Plays [kind] on [root], under [below] (the pet), with [hide] left out of the snapshot. [ox], [oy]:
	 * where the weapon lands, in decor pixels. [hand]: where a chain starts. [facing]: 1 right, -1 left.
	 */
	fun play(root: ViewGroup, below: View?, hide: List<View?>, kind: Kind, ox: Float, oy: Float, facing: Int,
	         hand: FloatArray?, onBite: (() -> Unit)? = null, onDone: () -> Unit): Boolean {
		if (view != null) return false
		val shot = capture(root, hide) ?: return false
		val finish = {
			cancel()
			onDone()
		}
		val v: View = (if (shadersReady) runCatching {
			ShaderBreakView(root.context, shot, kind, ox, oy, facing, hand, onBite, finish)
		}.onFailure {
			shadersBroken = true
			android.util.Log.w("Sparkle", "screen trick shaders unavailable: ${it.message}")
		}.getOrNull() else null) ?: LegacyBreakView(root.context, shot, legacyKind(kind), ox, oy, facing, hand, onBite, finish)
		val index = below?.let { root.indexOfChild(it) }?.takeIf { it >= 0 } ?: root.childCount
		root.addView(v, index, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		view = v
		return true
	}

	fun cancel() {
		val v = view ?: return
		view = null
		(v.parent as? ViewGroup)?.removeView(v)
		(v as? Effect)?.release()
	}

	/** A bitmap of [root] as drawn now, without [hide]; null when it cannot be drawn. */
	fun capture(root: ViewGroup, hide: List<View?>): Bitmap? {
		val w = root.width
		val h = root.height
		if (w <= 0 || h <= 0) return null
		val scale = if (w.toLong() * h * 4 > 24L shl 20) 0.5f else 1f
		val shown = hide.filterNotNull().filter { it.visibility == View.VISIBLE }
		return runCatching {
			val bmp = Bitmap.createBitmap(max(1, (w * scale).toInt()), max(1, (h * scale).toInt()), Bitmap.Config.ARGB_8888)
			val canvas = Canvas(bmp)
			canvas.scale(scale, scale)
			for (v in shown) v.visibility = View.INVISIBLE
			try {
				root.draw(canvas)
			} finally {
				for (v in shown) v.visibility = View.VISIBLE
			}
			bmp
		}.getOrNull()
	}
}
