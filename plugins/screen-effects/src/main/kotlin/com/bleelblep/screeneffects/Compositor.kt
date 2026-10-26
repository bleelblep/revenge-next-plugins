package com.bleelblep.screeneffects

import android.annotation.TargetApi
import android.graphics.RenderEffect
import android.view.View

/**
 * Visual Effects' layers in the shared stack ([SharedLayers]): the screen filter innermost
 * ("10-filter"), then ripples and the lens ("20-…", one key per owner). Other bleelblep plugins add
 * their own layers around these, so ending a ripple puts back the filter *and* anyone else's.
 *
 * Main thread only.
 */
@TargetApi(33)
internal object Compositor {
	private const val FILTER = "10-filter"
	private const val TRANSIENT = "20-"

	/** [owner] is whoever drives the effect (a Ripple, a Lens); null removes theirs. */
	fun setTransient(view: View, owner: Any, effect: RenderEffect?) {
		SharedLayers.set(view, TRANSIENT + System.identityHashCode(owner).toString(16), effect)
	}

	fun setFilter(view: View, effect: RenderEffect?) {
		SharedLayers.set(view, FILTER, effect)
	}

	fun clearAll() {
		SharedLayers.clear(FILTER)
		SharedLayers.clear(TRANSIENT)
	}
}
