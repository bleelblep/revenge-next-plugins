package com.bleelblep.sparkle

import android.annotation.TargetApi
import android.graphics.RenderEffect
import android.view.View
import java.util.TreeMap
import java.util.WeakHashMap

/**
 * A window has one RenderEffect slot, and several bleelblep plugins want it at once: Visual
 * Effects' filters and ripples, Tilt Physics' liquid slosh, Night Light. Each plugin is
 * loaded by its own class loader, so they can't share a Kotlin object. They share this registry
 * instead, kept in the process-wide system properties table under one key and built only from
 * Android and JDK types, which every class loader sees the same way.
 *
 * Every plugin files its effect under an ordered key and re-applies the whole stack, innermost
 * (lowest key) first, so nobody overwrites anybody. Copied verbatim into each plugin that uses it;
 * change all copies together.
 *
 * Keys in use: "10-filter" (Visual Effects), "20-…" (Visual Effects' ripples and lens), "30-liquid"
 * (Tilt Physics), "40-night" (Night Light).
 *
 * Main thread only.
 */
@TargetApi(33)
internal object SharedLayers {
	private const val PROPERTY = "bleelblep.renderLayers.v1"

	@Suppress("UNCHECKED_CAST")
	private fun table(): WeakHashMap<View, TreeMap<String, RenderEffect>> {
		val props = System.getProperties()
		synchronized(props) {
			return (props[PROPERTY] as? WeakHashMap<View, TreeMap<String, RenderEffect>>)
				?: WeakHashMap<View, TreeMap<String, RenderEffect>>().also { props[PROPERTY] = it }
		}
	}

	/** Sets (or with null removes) this plugin's layer [key] on [view], then re-applies the stack. */
	fun set(view: View, key: String, effect: RenderEffect?) {
		val table = table()
		val layers = table.getOrPut(view) { TreeMap() }
		if (effect == null) layers.remove(key) else layers[key] = effect
		var result: RenderEffect? = null
		for (layer in layers.values) {
			result = if (result == null) layer else RenderEffect.createChainEffect(layer, result)
		}
		view.setRenderEffect(result)
		if (layers.isEmpty()) table.remove(view)
	}

	/** Removes every layer whose key starts with [prefix], on every view. */
	fun clear(prefix: String) {
		val table = table()
		for (view in table.keys.toList()) {
			val layers = table[view] ?: continue
			val mine = layers.keys.filter { it.startsWith(prefix) }
			if (mine.isEmpty()) continue
			for (key in mine) layers.remove(key)
			set(view, "", null)
		}
	}
}
