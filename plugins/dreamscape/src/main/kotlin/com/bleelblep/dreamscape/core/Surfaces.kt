package com.bleelblep.dreamscape.core

import android.graphics.Rect
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import java.util.ArrayDeque

internal object Surfaces {
	fun scan(root: ViewGroup, excluded: View): List<Surface> {
		val queue = ArrayDeque<View>(); queue.add(root)
		val result = ArrayList<Surface>()
		val origin = IntArray(2); root.getLocationOnScreen(origin)
		var visited = 0
		while (queue.isNotEmpty() && visited++ < 2000 && result.size < 32) {
			val view = queue.removeFirst()
			if (view === excluded || !view.isShown) continue
			val composer = view is EditText
			val label = view.contentDescription?.toString()?.lowercase().orEmpty()
			val avatar = view is ImageView && (label.contains("avatar") || label.contains("profile picture"))
			if (composer || avatar) {
				val r = Rect()
				if (view.getGlobalVisibleRect(r) && r.width() > 8 && r.height() > 8) {
					r.offset(-origin[0], -origin[1]); result.add(Surface(RectF(r), composer))
				}
			}
			if (view is ViewGroup) for (i in 0 until view.childCount) queue.add(view.getChildAt(i))
		}
		return result
	}
}
internal fun roots(): List<ViewGroup> = runCatching {
	val c = Class.forName("android.view.WindowManagerGlobal")
	val instance = c.getMethod("getInstance").invoke(null)
	val field = c.getDeclaredField("mViews").apply { isAccessible = true }
	(field.get(instance) as? List<*>)?.filterIsInstance<ViewGroup>()?.filter { it.isAttachedToWindow && it.isShown && it.width > 0 }.orEmpty()
}.getOrDefault(emptyList())
