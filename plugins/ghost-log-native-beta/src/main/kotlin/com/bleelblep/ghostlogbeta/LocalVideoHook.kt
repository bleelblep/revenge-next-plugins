package com.bleelblep.ghostlogbeta

import android.net.Uri
import android.util.Log
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.io.File
import java.io.RandomAccessFile
import java.lang.reflect.InvocationHandler
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.lang.reflect.Proxy

/**
 * Lets Discord's video player play Ghost Log's saved videos.
 *
 * Restored attachments point at decrypted copies in app-private storage (`file://.../mediacache/`).
 * Images load, because Fresco reads local files. Videos did not: Discord's player
 * (`com.discord.media_player.MediaPlayer`, 348.x) takes every source from `CacheDataSourceFactory`,
 * an ExoPlayer cache over an OkHttp or Cronet upstream, which only speaks HTTP. The poster frame
 * showed, then playback failed. A local HTTP server is no way round it either: the release build
 * sets `use_cleartext_traffic` false, so plain http to 127.0.0.1 is refused.
 *
 * So the data sources that factory builds are wrapped. A wrapped source reads a `file://` uri
 * itself, and only when it is inside [allowedDir] (Ghost Log's own decrypted cache); every other
 * uri goes to Discord's source untouched. Nothing in revenge-xposed is changed: this is an ordinary
 * XposedBridge hook from the plugin, like Text Brightness's.
 *
 * ExoPlayer is obfuscated in Discord's build (`DataSource.o(p)` is open, `x()` is getUri, ...), and
 * those names change between builds, so methods are told apart by signature, not by name:
 *
 * - `long (DataSpec)`: open. The uri is the DataSpec's only `Uri` field; position and length come
 *   from `DataSpec.toString()` ("DataSpec[GET uri, position, length, key, flags]"), which ExoPlayer
 *   keeps and obfuscation can't rename.
 * - `int (byte[], int, int)`: read. -1 is ExoPlayer's end-of-input.
 * - `Uri ()`: getUri. `Map ()`: response headers. `close()`.
 * - Anything else (the transfer listener) goes to Discord's source.
 */
object LocalVideoHook {
	private const val TAG = "GhostLogNativeBeta"
	private const val FACTORY = "com.discord.media_player.CacheDataSourceFactory"
	private const val DATA_SOURCE = "com.google.android.exoplayer2.upstream.DataSource"

	/** "DataSpec[GET file:///x.mp4, 0, -1, null, 0]" -> position 0, length -1. */
	private val SPEC = Regex(""", (-?\d+), (-?\d+), [^,]*, -?\d+]$""")

	fun install(classLoader: ClassLoader, allowedDir: File): () -> Unit {
		val factory = runCatching { classLoader.loadClass(FACTORY) }.getOrNull()
		val dataSource = runCatching { classLoader.loadClass(DATA_SOURCE) }.getOrNull()
		if (factory == null || dataSource == null) {
			Log.w(TAG, "local video: player classes not found; saved videos will not play")
			return {}
		}
		val root = allowedDir.canonicalPath + File.separator
		val hook = object : XC_MethodHook() {
			override fun afterHookedMethod(param: MethodHookParam) {
				val original = param.result ?: return
				if (!dataSource.isInstance(original) || Proxy.isProxyClass(original.javaClass)) return
				param.result = Proxy.newProxyInstance(classLoader, arrayOf(dataSource), Source(original, root))
			}
		}
		// Both entry points: `createDataSource()` for playback and `buildCacheDataSource(boolean)`,
		// which the first calls and downloads use directly. Wrapping twice is guarded above.
		val unhooks = factory.declaredMethods
			.filter { dataSource.isAssignableFrom(it.returnType) && !java.lang.reflect.Modifier.isStatic(it.modifiers) }
			.map { XposedBridge.hookMethod(it, hook) }
		Log.i(TAG, "local video: hooked ${unhooks.size} player source method(s)")
		return { unhooks.forEach { runCatching { it.unhook() } } }
	}

	private class Source(private val delegate: Any, private val root: String) : InvocationHandler {
		private var file: RandomAccessFile? = null
		private var uri: Uri? = null
		private var remaining = 0L

		override fun invoke(proxy: Any, method: Method, args: Array<out Any?>?): Any? {
			val params = method.parameterTypes
			if (method.declaringClass == Any::class.java) {
				return when (method.name) {
					"equals" -> proxy === args?.getOrNull(0)
					"hashCode" -> System.identityHashCode(proxy)
					else -> "GhostLogLocalSource(${delegate})"
				}
			}
			// open(DataSpec)
			if (method.returnType == java.lang.Long.TYPE && params.size == 1 && args != null) {
				val spec = args[0]
				val local = spec?.let { localFileFor(it) }
				if (local != null) return openLocal(local, spec)
			}
			val open = file
			if (open != null) {
				when {
					method.returnType == Integer.TYPE && params.size == 3 && params[0] == ByteArray::class.java ->
						return readLocal(open, args!![0] as ByteArray, args[1] as Int, args[2] as Int)
					method.returnType == Uri::class.java && params.isEmpty() -> return uri
					Map::class.java.isAssignableFrom(method.returnType) && params.isEmpty() -> return emptyMap<String, List<String>>()
					method.name == "close" && params.isEmpty() -> {
						runCatching { open.close() }
						file = null
						uri = null
						return null
					}
				}
			}
			return try {
				method.invoke(delegate, *(args ?: emptyArray()))
			} catch (error: InvocationTargetException) {
				throw error.targetException
			}
		}

		/** The file a DataSpec asks for, only if it is a file:// uri inside Ghost Log's own cache. */
		private fun localFileFor(spec: Any): File? {
			val specUri = spec.javaClass.fields.firstOrNull { it.type == Uri::class.java }?.get(spec) as? Uri
				?: return null
			if (specUri.scheme != "file") return null
			val path = specUri.path ?: return null
			val file = File(path)
			val canonical = runCatching { file.canonicalPath }.getOrNull() ?: return null
			if (!canonical.startsWith(root) || !file.isFile) return null
			uri = specUri
			return file
		}

		private fun openLocal(local: File, spec: Any): Long {
			val match = SPEC.find(spec.toString())
			val position = match?.groupValues?.get(1)?.toLongOrNull() ?: 0L
			val length = match?.groupValues?.get(2)?.toLongOrNull() ?: -1L
			val raf = RandomAccessFile(local, "r")
			val available = (raf.length() - position).coerceAtLeast(0L)
			raf.seek(position.coerceAtMost(raf.length()))
			remaining = if (length >= 0) minOf(length, available) else available
			file = raf
			return remaining
		}

		private fun readLocal(raf: RandomAccessFile, buffer: ByteArray, offset: Int, length: Int): Int {
			if (length == 0) return 0
			if (remaining <= 0L) return -1
			val read = raf.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
			if (read < 0) return -1
			remaining -= read
			return read
		}
	}
}
