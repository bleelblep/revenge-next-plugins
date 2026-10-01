package com.bleelblep.freestickers

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32

/**
 * Animated PNG (APNG) -> animated GIF, on the phone.
 *
 * Discord doesn't animate APNG in link previews, and its media proxy won't convert one (a `.gif`
 * request for an APNG sticker is refused), so animated server stickers have to be re-encoded and
 * uploaded as a GIF to move.
 *
 * Decoding: Android only decodes a PNG's first image, so each APNG frame is rebuilt as a PNG of
 * its own (the frame's fcTL size in IHDR, its fdAT data as IDAT) and decoded with BitmapFactory,
 * then composited onto a full-size canvas following the frame's blend and dispose ops.
 *
 * Encoding: one 255-colour palette for the whole animation (median cut over a sample of every
 * frame's opaque pixels) plus a transparent index, full-canvas frames with "restore to
 * background" disposal so transparent areas never keep old pixels, and a plain GIF LZW coder.
 */
internal object ApngToGif {
	class NotAnimated : Exception("not an animated PNG")

	private class Frame(
		val width: Int, val height: Int, val x: Int, val y: Int,
		val delayCs: Int, val dispose: Int, val blend: Int, val data: ByteArrayOutputStream,
	)

	private val SIGNATURE = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)
	/** Chunks every rebuilt frame needs from the original image header area. */
	private val COPIED = setOf("PLTE", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT")
	private const val MAX_FRAMES = 150

	fun convert(apng: ByteArray, maxSize: Int): ByteArray {
		val frames = mutableListOf<Frame>()
		var ihdr: ByteArray? = null
		val copied = mutableListOf<Pair<String, ByteArray>>()
		var animated = false
		var current: Frame? = null

		val buf = ByteBuffer.wrap(apng)
		for (i in 0 until 8) if (buf.get() != SIGNATURE[i]) throw IllegalArgumentException("not a PNG")
		while (buf.remaining() >= 12) {
			val length = buf.int
			val type = ByteArray(4).also { buf.get(it) }.toString(Charsets.US_ASCII)
			if (length < 0 || length > buf.remaining() - 4) break
			val data = ByteArray(length).also { buf.get(it) }
			buf.int // CRC
			when (type) {
				"IHDR" -> ihdr = data
				"acTL" -> animated = true
				"fcTL" -> {
					val b = ByteBuffer.wrap(data)
					b.int // sequence
					val w = b.int; val h = b.int; val x = b.int; val y = b.int
					val num = b.short.toInt() and 0xffff
					val den = (b.short.toInt() and 0xffff).let { if (it == 0) 100 else it }
					val dispose = b.get().toInt(); val blend = b.get().toInt()
					val cs = ((num * 100.0) / den).toInt().coerceAtLeast(2)
					current = Frame(w, h, x, y, cs, dispose, blend, ByteArrayOutputStream()).also { frames += it }
				}
				// The default image is a frame only if an fcTL came before it.
				"IDAT" -> current?.data?.write(data)
				"fdAT" -> current?.data?.write(data, 4, data.size - 4)
				"IEND" -> break
				else -> if (type in COPIED && frames.isEmpty()) copied += type to data
			}
		}
		val header = ihdr ?: throw IllegalArgumentException("no IHDR")
		if (!animated || frames.size < 2) throw NotAnimated()

		val canvasW = ByteBuffer.wrap(header, 0, 4).int
		val canvasH = ByteBuffer.wrap(header, 4, 4).int
		val scale = minOf(1.0, maxSize.toDouble() / maxOf(canvasW, canvasH))
		val outW = maxOf(1, (canvasW * scale).toInt())
		val outH = maxOf(1, (canvasH * scale).toInt())

		val canvasBitmap = Bitmap.createBitmap(canvasW, canvasH, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(canvasBitmap)
		val over = Paint(Paint.FILTER_BITMAP_FLAG)
		val source = Paint(Paint.FILTER_BITMAP_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC) }
		val clear = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }

		val rendered = mutableListOf<Pair<IntArray, Int>>()
		for (frame in frames.take(MAX_FRAMES)) {
			val png = framePng(header, copied, frame)
			val bitmap = BitmapFactory.decodeByteArray(png, 0, png.size) ?: continue
			val previous = if (frame.dispose == 2) canvasBitmap.copy(Bitmap.Config.ARGB_8888, true) else null
			val left = frame.x.toFloat(); val top = frame.y.toFloat()
			if (frame.blend == 0) canvas.drawBitmap(bitmap, left, top, source) else canvas.drawBitmap(bitmap, left, top, over)
			bitmap.recycle()

			val scaled = if (outW == canvasW && outH == canvasH) canvasBitmap
			else Bitmap.createScaledBitmap(canvasBitmap, outW, outH, true)
			val pixels = IntArray(outW * outH)
			scaled.getPixels(pixels, 0, outW, 0, 0, outW, outH)
			if (scaled !== canvasBitmap) scaled.recycle()
			rendered += pixels to frame.delayCs

			when (frame.dispose) {
				1 -> canvas.drawRect(left, top, left + frame.width, top + frame.height, clear)
				2 -> if (previous != null) {
					canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
					canvas.drawBitmap(previous, 0f, 0f, source)
					previous.recycle()
				}
			}
		}
		canvasBitmap.recycle()
		if (rendered.size < 2) throw NotAnimated()

		return GifWriter.encode(outW, outH, rendered)
	}

	/** One APNG frame as a standalone PNG BitmapFactory can decode. */
	private fun framePng(header: ByteArray, copied: List<Pair<String, ByteArray>>, frame: Frame): ByteArray {
		val out = ByteArrayOutputStream()
		out.write(SIGNATURE)
		val ihdr = header.copyOf()
		ByteBuffer.wrap(ihdr).putInt(0, frame.width).putInt(4, frame.height)
		chunk(out, "IHDR", ihdr)
		for ((type, data) in copied) chunk(out, type, data)
		chunk(out, "IDAT", frame.data.toByteArray())
		chunk(out, "IEND", ByteArray(0))
		return out.toByteArray()
	}

	private fun chunk(out: OutputStream, type: String, data: ByteArray) {
		val typeBytes = type.toByteArray(Charsets.US_ASCII)
		out.write(ByteBuffer.allocate(4).putInt(data.size).array())
		out.write(typeBytes)
		out.write(data)
		val crc = CRC32().apply { update(typeBytes); update(data) }
		out.write(ByteBuffer.allocate(4).putInt(crc.value.toInt()).array())
	}
}

/** A small GIF89a writer: global palette, transparency, looping, LZW. */
internal object GifWriter {
	private const val TRANSPARENT = 255

	fun encode(width: Int, height: Int, frames: List<Pair<IntArray, Int>>): ByteArray {
		val palette = Palette.build(frames.map { it.first })
		val out = ByteArrayOutputStream()
		out.write("GIF89a".toByteArray(Charsets.US_ASCII))
		short(out, width); short(out, height)
		out.write(0xF7) // global colour table, 8 bits, 256 entries
		out.write(TRANSPARENT); out.write(0)
		for (i in 0 until 256) {
			val c = if (i < palette.colours.size) palette.colours[i] else 0
			out.write((c shr 16) and 0xff); out.write((c shr 8) and 0xff); out.write(c and 0xff)
		}
		// NETSCAPE2.0: loop forever.
		out.write(byteArrayOf(0x21, -1, 11) + "NETSCAPE2.0".toByteArray(Charsets.US_ASCII) + byteArrayOf(3, 1, 0, 0, 0))

		val indices = ByteArray(width * height)
		for ((pixels, delay) in frames) {
			for (i in pixels.indices) {
				val p = pixels[i]
				indices[i] = if ((p ushr 24) < 128) TRANSPARENT.toByte() else palette.index(p).toByte()
			}
			// Graphic control: dispose "restore to background", transparent index set.
			out.write(byteArrayOf(0x21, -7, 4, (2 shl 2 or 1).toByte()))
			short(out, delay)
			out.write(TRANSPARENT); out.write(0)
			out.write(0x2C)
			short(out, 0); short(out, 0); short(out, width); short(out, height)
			out.write(0)
			lzw(out, indices, 8)
		}
		out.write(0x3B)
		return out.toByteArray()
	}

	private fun short(out: OutputStream, value: Int) {
		out.write(value and 0xff); out.write((value shr 8) and 0xff)
	}

	/** GIF-flavoured LZW with variable code size, written in 255-byte sub-blocks. */
	private fun lzw(out: OutputStream, data: ByteArray, minCodeSize: Int) {
		out.write(minCodeSize)
		val clear = 1 shl minCodeSize
		val end = clear + 1
		val blocks = SubBlocks(out)
		var codeSize = minCodeSize + 1
		var next = end + 1
		val table = HashMap<Int, Int>(8192)

		blocks.bits(clear, codeSize)
		if (data.isEmpty()) { blocks.bits(end, codeSize); blocks.finish(); return }
		var prefix = data[0].toInt() and 0xff
		for (i in 1 until data.size) {
			val k = data[i].toInt() and 0xff
			val key = (prefix shl 8) or k
			val found = table[key]
			if (found != null) { prefix = found; continue }
			blocks.bits(prefix, codeSize)
			if (next < 4096) {
				table[key] = next++
				if (next > (1 shl codeSize) && codeSize < 12) codeSize++
			} else {
				blocks.bits(clear, codeSize)
				table.clear(); codeSize = minCodeSize + 1; next = end + 1
			}
			prefix = k
		}
		blocks.bits(prefix, codeSize)
		blocks.bits(end, codeSize)
		blocks.finish()
	}

	private class SubBlocks(val out: OutputStream) {
		private val block = ByteArray(255)
		private var used = 0
		private var acc = 0
		private var count = 0

		fun bits(code: Int, size: Int) {
			acc = acc or (code shl count)
			count += size
			while (count >= 8) { byte(acc and 0xff); acc = acc ushr 8; count -= 8 }
		}

		private fun byte(b: Int) {
			block[used++] = b.toByte()
			if (used == 255) flush()
		}

		private fun flush() {
			if (used == 0) return
			out.write(used); out.write(block, 0, used); used = 0
		}

		fun finish() {
			if (count > 0) { byte(acc and 0xff); acc = 0; count = 0 }
			flush(); out.write(0)
		}
	}
}

/** 255 colours by median cut over sampled opaque pixels, with a 15-bit lookup for mapping. */
internal class Palette private constructor(val colours: IntArray) {
	private val cache = IntArray(32768) { -1 }

	fun index(argb: Int): Int {
		val key = ((argb shr 9) and 0x7c00) or ((argb shr 6) and 0x3e0) or ((argb shr 3) and 0x1f)
		val cached = cache[key]
		if (cached >= 0) return cached
		val r = (argb shr 16) and 0xff; val g = (argb shr 8) and 0xff; val b = argb and 0xff
		var best = 0; var bestD = Int.MAX_VALUE
		for (i in colours.indices) {
			val c = colours[i]
			val dr = r - ((c shr 16) and 0xff); val dg = g - ((c shr 8) and 0xff); val db = b - (c and 0xff)
			val d = dr * dr * 3 + dg * dg * 4 + db * db * 2
			if (d < bestD) { bestD = d; best = i }
		}
		cache[key] = best
		return best
	}

	companion object {
		private const val SAMPLE = 60_000

		fun build(frames: List<IntArray>): Palette {
			val total = frames.sumOf { it.size }
			val step = maxOf(1, total / SAMPLE)
			val sample = ArrayList<Int>(minOf(total, SAMPLE) + 16)
			var n = 0
			for (frame in frames) for (p in frame) {
				if (n++ % step == 0 && (p ushr 24) >= 128) sample += p and 0xffffff
			}
			if (sample.isEmpty()) return Palette(intArrayOf(0))

			val boxes = mutableListOf(sample.toIntArray())
			while (boxes.size < 255) {
				val (index, channel) = widest(boxes) ?: break
				val box = boxes.removeAt(index)
				val shift = when (channel) { 0 -> 16; 1 -> 8; else -> 0 }
				val sorted = box.sortedBy { (it shr shift) and 0xff }.toIntArray()
				val mid = sorted.size / 2
				boxes += sorted.copyOfRange(0, mid)
				boxes += sorted.copyOfRange(mid, sorted.size)
			}
			return Palette(boxes.filter { it.isNotEmpty() }.map { average(it) }.toIntArray())
		}

		/** The box with the widest spread in any channel, and that channel; null when none splits. */
		private fun widest(boxes: List<IntArray>): Pair<Int, Int>? {
			var best: Pair<Int, Int>? = null
			var bestRange = 0
			for ((i, box) in boxes.withIndex()) {
				if (box.size < 2) continue
				for (channel in 0..2) {
					val shift = when (channel) { 0 -> 16; 1 -> 8; else -> 0 }
					var lo = 255; var hi = 0
					for (c in box) { val v = (c shr shift) and 0xff; if (v < lo) lo = v; if (v > hi) hi = v }
					if (hi - lo > bestRange) { bestRange = hi - lo; best = i to channel }
				}
			}
			return best
		}

		private fun average(box: IntArray): Int {
			var r = 0L; var g = 0L; var b = 0L
			for (c in box) { r += (c shr 16) and 0xff; g += (c shr 8) and 0xff; b += c and 0xff }
			val n = box.size
			return ((r / n).toInt() shl 16) or ((g / n).toInt() shl 8) or (b / n).toInt()
		}
	}
}
