package com.bleelblep.dreamscape.core

import android.graphics.Color
import android.graphics.RectF
import android.graphics.Canvas

internal data class Scene(val world: String = "space", val color: Int = 0xFFA78BFA.toInt(), val intensity: Float = .35f, val speed: Float = .4f, val particles: Int = 24) {
	companion object {
		fun parse(map: Map<*, *>?): Scene? {
			map ?: return null
			if ((map["version"] as? Number)?.toInt() != 1) return null
			val world = map["world"] as? String ?: return null
			if (world !in setOf("space", "ocean", "storm", "library")) return null
			val hex = map["color"] as? String ?: return null
			if (!Regex("#[0-9a-fA-F]{6}").matches(hex)) return null
			fun number(key: String, lo: Float, hi: Float): Float? = (map[key] as? Number)?.toFloat()?.takeIf { it.isFinite() && it in lo..hi }
			return Scene(world, Color.parseColor(hex), number("intensity", .1f, .7f) ?: return null,
				number("speed", .1f, 1f) ?: return null, (number("particles", 0f, 48f) ?: return null).toInt())
		}
	}
}
internal data class Config(
	val enabled: Boolean = false, val glass: Boolean = true, val hologram: Boolean = false,
	val tear: Boolean = true, val spellbook: Boolean = true, val dreams: Boolean = true,
	val demo: Boolean = false, val tilt: Boolean = true, val reducedMotion: Boolean = false,
	val fps: Int = 60, val glassStyle: String = "clear", val holoStyle: String = "foil",
	val strength: Float = .5f, val scene: Scene = Scene(), val channelScene: Boolean = false,
	val bindings: Map<String, String> = mapOf("circle" to "portal", "zigzag" to "meteor", "v" to "prism"),
	val playEverywhere: Boolean = false,
) {
	companion object {
		fun parse(m: Map<*, *>): Config {
			fun b(k: String, default: Boolean) = m[k] as? Boolean ?: default
			return Config(b("enabled", false), b("glass", true), b("hologram", false), b("tear", true),
				b("spellbook", true), b("dreams", true), b("demo", false), b("tilt", true), b("reducedMotion", false),
				(m["fps"] as? Number)?.toInt()?.takeIf { it in setOf(15, 30, 60, 90) } ?: 60,
				(m["glassStyle"] as? String)?.takeIf { it in setOf("clear", "frosted", "smoked") } ?: "clear",
				(m["holoStyle"] as? String)?.takeIf { it in setOf("foil", "prismatic", "ghost") } ?: "foil",
				(m["strength"] as? Number)?.toFloat()?.takeIf { it.isFinite() }?.coerceIn(.1f, 1f) ?: .5f,
				Scene.parse(m["scene"] as? Map<*, *>) ?: Scene(), b("channelScene", false),
				mapOf("circle" to "portal", "zigzag" to "meteor", "v" to "prism").mapValues { (symbol, fallback) ->
					((m["bindings"] as? Map<*, *>)?.get(symbol) as? String)?.takeIf { it in setOf("portal", "frost", "prism", "meteor") } ?: fallback
				}, b("playEverywhere", false))
		}
	}
}
internal class Frame(val width: Float, val height: Float, val density: Float, val time: Float, val tiltX: Float, val tiltY: Float, val config: Config)
internal interface Feature { fun draw(canvas: Canvas, frame: Frame); fun clear() {} }
internal data class Surface(val bounds: RectF, val composer: Boolean)
