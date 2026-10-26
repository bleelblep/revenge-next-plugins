@file:JvmName("SekaiStickersPlugin")

package com.bleelblep.sekaistickers

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily
import android.os.Build
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Draws a Project Sekai sticker: the character picture with your text over it, the same way
 * TheOriginalAyaka's sticker maker (and Equicord's SekaiStickers) draw it on an HTML canvas --
 * 296x256, picture fitted and centred, text with a 9px white outline in the character's colour,
 * rotated around its anchor, optionally curved one letter at a time. Unlike the maker, the anchor
 * is the middle of the text rather than its first baseline, and curves are centred on it.
 *
 * JS has no canvas, so the PNG is drawn here when you add or save a sticker; its path goes back to
 * JS, which hands that file to Discord's upload queue. The editor's live preview is laid out in
 * React Native with the same font and the same maths, so it can follow your finger.
 *
 * Fonts ship in the plugin ZIP (`assets/fonts`, converted from the maker's WOFF2) and Revenge
 * extracts them to `files/revenge/plugins/dist/<id>/fonts/`. Character pictures are downloaded from
 * st.ayaka.one on first use and kept in `storage/<id>/img/`.
 */

private const val WIDTH = 296
private const val HEIGHT = 256
private const val IMAGE_HOST = "https://st.ayaka.one/img/"
private val IMAGE_PATH = Regex("^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\\.png$")
private const val KEEP_RENDERS = 6
private const val REACT_FONT = "SekaiStickersYuruka"

private fun num(map: Map<*, *>, key: String, fallback: Double): Double =
	(map[key] as? Number)?.toDouble() ?: fallback

private fun parseColour(value: Any?): Int =
	runCatching { Color.parseColor(value as String) }.getOrDefault(Color.parseColor("#FB8AAC"))

/** Yuruka for Latin and kana, falling back to ShangShou FangTang for Chinese, as the web maker does. */
private fun loadTypeface(fonts: File): Typeface {
	val main = File(fonts, "YurukaStd.otf")
	val cjk = File(fonts, "ShangShouFangTangTi.ttf")
	if (!main.isFile) return Typeface.DEFAULT_BOLD
	if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && cjk.isFile) {
		runCatching {
			return Typeface.CustomFallbackBuilder(FontFamily.Builder(Font.Builder(main).build()).build())
				.addCustomFallback(FontFamily.Builder(Font.Builder(cjk).build()).build())
				.build()
		}
	}
	return runCatching { Typeface.createFromFile(main) }.getOrDefault(Typeface.DEFAULT_BOLD)
}

val sekaiStickersPlugin = plugin {
	start {
		// The extracted ZIP (fonts/). RevengeXposed 1.7.1 (API 1.1.0) names it `pluginDir`; read by
		// reflection so older hosts, where it sits at the same place, still work. Not storageDir's
		// grandparent: since 1.7 that's storage/<slot>/<id>, one level deeper.
		val installDir: File = runCatching { javaClass.getMethod("getPluginDir").invoke(this) as File }
			.getOrElse { File(appInfo.dataDir, "files/revenge/plugins/dist/${manifest.id}") }
		val imageCache = File(storageDir, "img")
		val renders = File(storageDir, "out")
		val typeface by lazy { loadTypeface(File(installDir, "fonts")) }
		// One render at a time: the picture cache is a plain map, and a fast typist queues renders.
		val lock = Mutex()
		val bitmaps = object : LinkedHashMap<String, Bitmap>(16, 0.75f, true) {
			override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap>) = size > 8
		}

		fun picture(path: String): Bitmap {
			require(IMAGE_PATH.matches(path)) { "Bad image path: $path" }
			bitmaps[path]?.let { return it }
			val file = File(imageCache, path)
			if (!file.isFile || file.length() == 0L) {
				file.parentFile?.mkdirs()
				val connection = URL(IMAGE_HOST + path).openConnection() as HttpURLConnection
				connection.connectTimeout = 15_000
				connection.readTimeout = 20_000
				try {
					check(connection.responseCode == 200) { "Image download failed (${connection.responseCode})" }
					val partial = File(file.path + ".part")
					connection.inputStream.use { input -> partial.outputStream().use(input::copyTo) }
					check(partial.renameTo(file)) { "Could not save $path" }
				} finally {
					connection.disconnect()
				}
			}
			val bitmap = BitmapFactory.decodeFile(file.path) ?: run {
				file.delete()
				error("Could not read $path")
			}
			bitmaps[path] = bitmap
			return bitmap
		}

		fun textPaint(size: Float) = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG).apply {
			this.typeface = typeface
			textSize = size
			textAlign = Paint.Align.CENTER
		}

		/**
		 * Draws [text] so the middle of its text box (between the font's ascent and descent) sits
		 * on (x, y), the point the editor's dot marks. Lines stack around that point, [lineSpacing]
		 * percent of the font size apart. A non-zero [bend] (-100..100) curves each line along its
		 * own arc, centred on the line: positive arches up, negative dips down. The editor's preview
		 * (js/lib/design.ts `layout`) does the same maths, so what you see is what gets drawn.
		 */
		fun render(options: Map<*, *>): Map<String, Any> {
			val path = options["img"] as? String ?: error("No picture chosen")
			val text = (options["text"] as? String).orEmpty()
			val size = num(options, "size", 40.0).toFloat().coerceIn(8f, 160f)
			val lineGap = size * num(options, "lineSpacing", 105.0).toFloat().coerceIn(40f, 250f) / 100f
			val bend = num(options, "bend", 0.0).toFloat().coerceIn(-100f, 100f)
			val x = num(options, "x", WIDTH / 2.0).toFloat()
			val y = num(options, "y", 40.0).toFloat()
			val rotate = num(options, "rotate", 0.0) / 10.0
			val colour = parseColour(options["color"])

			val bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
			val canvas = Canvas(bitmap)

			// Fitted and centred as the maker does, then scaled around the centre and moved by
			// imageScale (percent) and imageX / imageY (sticker pixels).
			val image = picture(path)
			val zoom = num(options, "imageScale", 100.0).toFloat().coerceIn(20f, 400f) / 100f
			val ratio = minOf(WIDTH.toFloat() / image.width, HEIGHT.toFloat() / image.height) * zoom
			val drawW = image.width * ratio
			val drawH = image.height * ratio
			val left = (WIDTH - drawW) / 2 + num(options, "imageX", 0.0).toFloat()
			val top = (HEIGHT - drawH) / 2 + num(options, "imageY", 0.0).toFloat()
			canvas.drawBitmap(
				image,
				Rect(0, 0, image.width, image.height),
				RectF(left, top, left + drawW, top + drawH),
				Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG),
			)

			val stroke = textPaint(size).apply {
				style = Paint.Style.STROKE
				strokeWidth = 9f
				strokeJoin = Paint.Join.ROUND
				color = Color.WHITE
			}
			val fill = Paint(stroke).apply {
				style = Paint.Style.FILL
				color = colour
			}
			fun draw(value: String, dx: Float, dy: Float) {
				canvas.drawText(value, dx, dy, stroke)
				canvas.drawText(value, dx, dy, fill)
			}

			// Baseline offset that puts the middle of the text box on the line's centre.
			val metrics = fill.fontMetrics
			val baseline = (-metrics.ascent - metrics.descent) / 2f

			canvas.save()
			canvas.translate(x, y)
			canvas.rotate(Math.toDegrees(rotate).toFloat())
			val lines = text.split("\n")
			lines.forEachIndexed { index, line ->
				val centreY = (index - (lines.size - 1) / 2f) * lineGap
				if (bend == 0f) {
					draw(line, 0f, centreY + baseline)
					return@forEachIndexed
				}
				val radius = size * 400f / abs(bend)
				val sign = if (bend > 0) 1f else -1f
				val letters = line.codePoints().toArray().map { String(Character.toChars(it)) }
				val widths = letters.map { fill.measureText(it) }
				val total = widths.sum()
				var along = 0f
				letters.forEachIndexed { i, letter ->
					val angle = (along + widths[i] / 2f - total / 2f) / radius
					along += widths[i]
					canvas.save()
					canvas.translate(radius * sin(angle), centreY + sign * radius * (1f - cos(angle)))
					canvas.rotate(Math.toDegrees((sign * angle).toDouble()).toFloat())
					draw(letter, 0f, baseline)
					canvas.restore()
				}
			}
			canvas.restore()

			renders.mkdirs()
			val name = path.substringAfter('/').substringBeforeLast('.').lowercase()
			val out = File(renders, "$name-sekai-${System.currentTimeMillis()}.png")
			out.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
			bitmap.recycle()
			// Each render is a new file so the preview Image never shows a cached old one; keep a few.
			renders.listFiles().orEmpty().sortedByDescending { it.lastModified() }.drop(KEEP_RENDERS).forEach { it.delete() }

			return mapOf("path" to out.absolutePath, "width" to WIDTH, "height" to HEIGHT)
		}

		/** `render({ img, text, x, y, rotate, size, spacing, curve, color })` -> `{ path, width, height }`. */
		registerNativeAsyncMethod("${manifest.id}.render") { args ->
			val options = args.firstOrNull() as? Map<*, *> ?: error("render needs an options object")
			lock.withLock { withContext(Dispatchers.IO) { render(options) } }
		}

		val saved = File(storageDir, "saved")
		val savedId = Regex("^[A-Za-z0-9_-]{1,64}$")

		/** `keep(renderPath, id)` -> path of a copy that render clean-up never deletes, for Saved. */
		registerNativeAsyncMethod("${manifest.id}.keep") { args ->
			val from = File(args.getOrNull(0) as? String ?: error("No render to keep"))
			val id = args.getOrNull(1) as? String ?: error("No id")
			require(savedId.matches(id)) { "Bad id: $id" }
			require(from.canonicalPath.startsWith(renders.canonicalPath + File.separator)) { "Not one of our renders" }
			withContext(Dispatchers.IO) {
				saved.mkdirs()
				val to = File(saved, "$id.png")
				from.copyTo(to, overwrite = true)
				to.absolutePath
			}
		}

		/**
		 * `reuse(id)` -> a fresh copy of a saved sticker among the renders, for sending. The saved
		 * file itself never goes to Discord's upload queue, in case the upload cleans up after itself.
		 */
		registerNativeAsyncMethod("${manifest.id}.reuse") { args ->
			val id = args.getOrNull(0) as? String ?: error("No id")
			require(savedId.matches(id)) { "Bad id: $id" }
			withContext(Dispatchers.IO) {
				val from = File(saved, "$id.png")
				check(from.isFile) { "That saved sticker's picture is missing" }
				renders.mkdirs()
				val to = File(renders, "$id-sekai-${System.currentTimeMillis()}.png")
				from.copyTo(to, overwrite = true)
				renders.listFiles().orEmpty().sortedByDescending { it.lastModified() }.drop(KEEP_RENDERS).forEach { it.delete() }
				mapOf("path" to to.absolutePath, "width" to WIDTH, "height" to HEIGHT)
			}
		}

		/** `forget(id)`: deletes a saved sticker's picture. */
		registerNativeAsyncMethod("${manifest.id}.forget") { args ->
			val id = args.getOrNull(0) as? String ?: error("No id")
			require(savedId.matches(id)) { "Bad id: $id" }
			withContext(Dispatchers.IO) { File(saved, "$id.png").delete() }
		}

		/** Whether the fonts came with the install; without them the text falls back to bold sans. */
		registerNativeAsyncMethod("${manifest.id}.status") { _ ->
			mapOf(
				"fonts" to File(installDir, "fonts/YurukaStd.otf").isFile,
				"installDir" to installDir.path,
			)
		}

		// The editor's live preview is drawn by React Native, not here, so the font has to be one
		// React Native knows: register it under REACT_FONT before any preview asks for it. On Discord
		// 352.2+ (R8-minified) the font manager is found with the host's DexKit; see RnFonts.
		RnFonts.finder = runCatching { dexFinder }.getOrNull()
		val reactFont = runCatching {
			RnFonts.register(classLoader, REACT_FONT, typeface)
			true
		}.getOrElse {
			android.util.Log.e("SekaiStickers", "Couldn't register the preview font", it)
			false
		}

		/**
		 * `metrics()` -> `{ font, registered, ascent, descent }`: the preview font's family name, and
		 * the text box's ascent and descent as fractions of the font size, from the same paint
		 * `render` uses.
		 */
		registerNativeAsyncMethod("${manifest.id}.metrics") { _ ->
			val metrics = textPaint(100f).fontMetrics
			mapOf(
				"font" to REACT_FONT,
				"registered" to reactFont,
				"ascent" to -metrics.ascent / 100.0,
				"descent" to metrics.descent / 100.0,
			)
		}

		/** `measure([letter, ...])` -> widths as fractions of the font size, for curved text. */
		registerNativeAsyncMethod("${manifest.id}.measure") { args ->
			val letters = (args.firstOrNull() as? List<*>).orEmpty().filterIsInstance<String>().take(500)
			val paint = textPaint(100f)
			letters.associateWith { paint.measureText(it) / 100.0 }
		}
	}
}
