package com.bleelblep.aicore

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor
import kotlin.math.max

/**
 * Audio for transcription: a Discord voice message (Ogg Opus, or any file Android can decode) in,
 * 16 kHz mono 16-bit WAV pieces out. Gemma's audio encoder takes up to 30 seconds per clip, so the
 * pieces are that long at most. Streamed: a long message never sits in memory.
 *
 * The same file is in AI Core Local (`com.bleelblep.aicorelocal`); keep the two in step.
 */
internal object Audio {
	const val RATE = 16_000
	private const val TIMEOUT_US = 10_000L
	private const val MAX_BYTES = 25L * 1024 * 1024
	private const val LIMIT_MS = 5 * 60 * 1000L

	/** Only Discord's own attachment hosts: this downloads what a plugin names, so it mustn't fetch anything else. */
	private val HOSTS = setOf("cdn.discordapp.com", "media.discordapp.net")

	fun allowed(url: String): Boolean = runCatching {
		val uri = URI(url)
		uri.scheme == "https" && uri.host?.lowercase() in HOSTS
	}.getOrDefault(false)

	/** Downloads [url] (a Discord attachment) into [target]. */
	fun download(url: String, target: File) {
		require(allowed(url)) { "only Discord attachments can be transcribed" }
		var current = url
		for (hop in 0 until 4) {
			val connection = URL(current).openConnection() as HttpURLConnection
			try {
				connection.instanceFollowRedirects = false
				connection.connectTimeout = 15_000
				connection.readTimeout = 30_000
				val code = connection.responseCode
				if (code in 300..399) {
					val next = connection.getHeaderField("Location") ?: error("redirect without a location")
					current = URL(URL(current), next).toString()
					require(allowed(current)) { "the attachment redirected away from Discord" }
					continue
				}
				if (code !in 200..299) error("Discord answered HTTP $code for the voice message")
				target.parentFile?.mkdirs()
				var total = 0L
				connection.inputStream.use { input ->
					target.outputStream().use { output ->
						val buffer = ByteArray(64 * 1024)
						while (true) {
							val n = input.read(buffer)
							if (n < 0) break
							total += n
							if (total > MAX_BYTES) error("the voice message is too big to transcribe")
							output.write(buffer, 0, n)
						}
					}
				}
				return
			} finally {
				connection.disconnect()
			}
		}
		error("too many redirects")
	}

	private class Resampler(inRate: Int) {
		private val step = inRate.toDouble() / RATE
		private val same = inRate == RATE
		private var pos = 0.0
		private var prev = 0f

		inline fun process(input: FloatArray, n: Int, sink: (Float) -> Unit) {
			if (n == 0) return
			if (same) {
				for (i in 0 until n) sink(input[i])
				return
			}
			var p = pos
			while (true) {
				val i = floor(p).toInt()
				if (i + 1 >= n) break
				val a = if (i < 0) prev else input[i]
				sink(a + (input[i + 1] - a) * (p - i).toFloat())
				p += step
			}
			prev = input[n - 1]
			pos = p - n
		}
	}

	/** One WAV file being written; the header's sizes are filled in on [close]. */
	private class Wav(val file: File) {
		private val out = RandomAccessFile(file, "rw").apply { setLength(0); write(ByteArray(44)) }
		private val buffer = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN)
		var samples = 0L

		fun add(value: Float) {
			if (buffer.remaining() < 2) flush()
			buffer.putShort((value.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
			samples++
		}

		private fun flush() {
			out.write(buffer.array(), 0, buffer.position())
			buffer.clear()
		}

		fun close() {
			flush()
			val data = samples * 2
			val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
				put("RIFF".toByteArray()); putInt((36 + data).toInt()); put("WAVE".toByteArray())
				put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1); putInt(RATE); putInt(RATE * 2); putShort(2); putShort(16)
				put("data".toByteArray()); putInt(data.toInt())
			}
			out.seek(0)
			out.write(header.array())
			out.close()
		}
	}

	class Pieces(val files: List<File>, val durationSecs: Double)

	/**
	 * Decodes [source] into WAV pieces of at most [pieceSecs] seconds in [outDir], named
	 * `part-0.wav`, `part-1.wav`, … Pieces under half a second of sound at the end are dropped.
	 */
	fun toWavPieces(source: File, outDir: File, pieceSecs: Int, cancelled: () -> Boolean = { false }): Pieces {
		outDir.mkdirs()
		val extractor = MediaExtractor()
		var decoder: MediaCodec? = null
		val pieces = mutableListOf<File>()
		var wav: Wav? = null
		var total = 0L
		val perPiece = pieceSecs.toLong() * RATE
		try {
			extractor.setDataSource(source.absolutePath)
			val track = (0 until extractor.trackCount).firstOrNull {
				extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
			} ?: error("that file has no sound in it")
			extractor.selectTrack(track)
			val format = extractor.getTrackFormat(track)
			val mime = format.getString(MediaFormat.KEY_MIME)!!
			decoder = MediaCodec.createDecoderByType(mime)
			decoder.configure(format, null, null, 0)
			decoder.start()

			var channels = format.intOr(MediaFormat.KEY_CHANNEL_COUNT, 1)
			var floatPcm = false
			var resampler = Resampler(format.intOr(MediaFormat.KEY_SAMPLE_RATE, RATE))
			var mono = FloatArray(4096)
			val sink: (Float) -> Unit = { v ->
				val current = wav ?: Wav(File(outDir, "part-${pieces.size}.wav")).also { wav = it; pieces += it.file }
				current.add(v)
				total++
				if (current.samples >= perPiece) {
					current.close()
					wav = null
				}
			}

			val info = MediaCodec.BufferInfo()
			var inputDone = false
			var done = false
			val deadline = System.currentTimeMillis() + LIMIT_MS
			while (!done) {
				if (System.currentTimeMillis() > deadline) error("reading the voice message took too long")
				if (cancelled()) error("cancelled")
				if (!inputDone) {
					val index = decoder.dequeueInputBuffer(TIMEOUT_US)
					if (index >= 0) {
						val n = extractor.readSampleData(decoder.getInputBuffer(index)!!, 0)
						if (n < 0) {
							decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
							inputDone = true
						} else {
							decoder.queueInputBuffer(index, 0, n, extractor.sampleTime, 0)
							extractor.advance()
						}
					}
				}
				val index = decoder.dequeueOutputBuffer(info, TIMEOUT_US)
				if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
					val out = decoder.outputFormat
					channels = out.intOr(MediaFormat.KEY_CHANNEL_COUNT, channels)
					floatPcm = out.intOr(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT) == AudioFormat.ENCODING_PCM_FLOAT
					resampler = Resampler(out.intOr(MediaFormat.KEY_SAMPLE_RATE, RATE))
				} else if (index >= 0) {
					val buffer = decoder.getOutputBuffer(index)!!
					buffer.position(info.offset)
					buffer.limit(info.offset + info.size)
					buffer.order(ByteOrder.nativeOrder())
					val ch = max(1, channels)
					val frames = if (floatPcm) info.size / 4 / ch else info.size / 2 / ch
					if (mono.size < frames) mono = FloatArray(frames)
					if (floatPcm) {
						val fb = buffer.asFloatBuffer()
						for (f in 0 until frames) {
							var s = 0f
							for (c in 0 until ch) s += fb.get()
							mono[f] = s / ch
						}
					} else {
						val sb = buffer.asShortBuffer()
						for (f in 0 until frames) {
							var s = 0f
							for (c in 0 until ch) s += sb.get() / 32768f
							mono[f] = s / ch
						}
					}
					decoder.releaseOutputBuffer(index, false)
					resampler.process(mono, frames, sink)
					if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) done = true
				}
			}
			wav?.let { last ->
				last.close()
				if (last.samples < RATE / 2 && pieces.size > 1) {
					last.file.delete()
					pieces.remove(last.file)
				}
			}
			wav = null
			if (total == 0L) error("that file has no sound in it")
			return Pieces(pieces.toList(), total.toDouble() / RATE)
		} finally {
			runCatching { wav?.close() }
			runCatching { decoder?.stop() }
			runCatching { decoder?.release() }
			extractor.release()
		}
	}

	private fun MediaFormat.intOr(key: String, fallback: Int): Int =
		if (containsKey(key)) runCatching { getInteger(key) }.getOrDefault(fallback) else fallback
}
