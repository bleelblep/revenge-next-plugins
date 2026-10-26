package com.bleelblep.sekaistickers

import android.graphics.Typeface
import io.github.revenge.xposed.api.DexFinder
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.util.concurrent.ConcurrentHashMap

/**
 * React Native's font manager: where custom font families are registered, and its typeface cache.
 *
 * Up to 351.x it's `ReactFontManager`, with a public `addCustomFont(family, typeface)`. Discord 352.2+
 * is R8-minified: the class is renamed, `addCustomFont` and the singleton accessors are gone, and
 * nothing writes its custom-font map any more. There a registered family is served by hooking the
 * manager's one method, `getTypeface(family, style, assets)`, which returns the family's face styled
 * by `style`'s Typeface -> Typeface method, just as the custom-font map used to.
 */
internal object RnFonts {
	private val LEGACY = listOf(
		"com.facebook.react.common.assets.ReactFontManager",
		"com.facebook.react.views.text.ReactFontManager",
	)

	/** Set at start; null on hosts older than 1.9.1, which can't find minified classes. */
	@Volatile var finder: DexFinder? = null

	private val families = ConcurrentHashMap<String, Typeface>()
	private val styleMethods = ConcurrentHashMap<Class<*>, Method>()
	@Volatile private var hook: XC_MethodHook.Unhook? = null

	/** The manager class and its singleton, or null when neither its name nor DexKit finds it. */
	fun manager(loader: ClassLoader): Pair<Class<*>, Any>? {
		for (name in LEGACY) {
			val cls = runCatching { Class.forName(name, false, loader) }.getOrNull() ?: continue
			val instance = runCatching { cls.getMethod("getInstance").invoke(null) }.getOrNull()
				?: runCatching {
					val companion = cls.getDeclaredField("Companion").apply { isAccessible = true }.get(null)
					companion.javaClass.getMethod("getInstance").invoke(companion)
				}.getOrNull()
				?: continue
			return cls to instance
		}
		// 352.2: `el.c`, the only class with the style suffixes; the singleton is a static field of its own type.
		val cls = runCatching { finder?.findClass { matcher { usingStrings("_bold_italic") } } }.getOrNull() ?: return null
		val instance = cls.declaredFields
			.firstOrNull { Modifier.isStatic(it.modifiers) && it.type == cls }
			?.apply { isAccessible = true }
			?.get(null)
			?: return null
		return cls to instance
	}

	/** Gives React Native [family], drawing with [face]. Throws when the font manager can't be reached. */
	fun register(loader: ClassLoader, family: String, face: Typeface) {
		val (cls, instance) = manager(loader) ?: error("React Native's font manager not found")
		val add = runCatching { cls.getMethod("addCustomFont", String::class.java, Typeface::class.java) }.getOrNull()
		if (add != null) {
			add.invoke(instance, family, face)
			return
		}
		families[family] = face
		synchronized(this) {
			if (hook != null) return
			val getTypeface = cls.declaredMethods.single {
				it.returnType == Typeface::class.java && it.parameterTypes.size == 3 && it.parameterTypes[0] == String::class.java
			}
			hook = XposedBridge.hookMethod(getTypeface, object : XC_MethodHook() {
				override fun beforeHookedMethod(param: MethodHookParam) {
					val registered = families[param.args[0] as? String ?: return] ?: return
					param.result = runCatching { styled(registered, param.args[1]) }.getOrNull() ?: registered
				}
			})
		}
	}

	/** [face] with the weight and slant [style] asks for (its one Typeface -> Typeface method). */
	private fun styled(face: Typeface, style: Any?): Typeface? {
		if (style == null) return face
		val method = styleMethods.getOrPut(style.javaClass) {
			style.javaClass.declaredMethods.single {
				it.returnType == Typeface::class.java && it.parameterTypes.contentEquals(arrayOf(Typeface::class.java))
			}.apply { isAccessible = true }
		}
		return method.invoke(style, face) as? Typeface
	}

	/**
	 * React Native keeps every typeface it made; emptying its cache lets a JS reload pick up a new
	 * font in the text drawn afterwards. Best effort: the field names aren't public.
	 */
	fun clearCache(loader: ClassLoader) {
		runCatching {
			val (cls, instance) = manager(loader) ?: return
			for (field in cls.declaredFields) {
				if (Modifier.isStatic(field.modifiers) || !Map::class.java.isAssignableFrom(field.type)) continue
				field.isAccessible = true
				(field.get(instance) as? MutableMap<*, *>)?.clear()
			}
		}
	}

	fun uninstall() {
		hook?.let { runCatching { it.unhook() } }
		hook = null
		families.clear()
	}
}
