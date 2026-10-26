package com.bleelblep.sparkle

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.os.SystemClock
import android.view.Surface
import android.view.WindowManager
import kotlin.math.sqrt

/**
 * The phone itself: a shake sends Sparkle tumbling, a tilt makes it slide (with gravity on), tipping
 * the top of the phone down lifts it up the screen and tipping it back pushes it down, and
 * plugging in or running low on battery gets a reaction. Listens only while Sparkle is on screen and
 * Discord is in front; [Pet] starts and stops it.
 */
internal object Phone {
	private const val EARTH_G = 9.81f
	private const val SHAKE_JERK = 14f
	private const val SHAKE_HITS = 4
	private const val SHAKE_WINDOW_MS = 900L
	private const val LOW_LEVEL = 15

	var running = false
		private set
	private var context: Context? = null
	private var sensors: SensorManager? = null
	private var prev: FloatArray? = null
	/** How upright the phone is held, averaged over a few seconds: forward/back tilt is measured from it. */
	private var restSy = Float.NaN
	private val hits = ArrayList<Long>()
	private var batteryRegistered = false
	private var wasCharging: Boolean? = null
	private var lowNotified = false

	private val accel = object : SensorEventListener {
		override fun onSensorChanged(event: SensorEvent) {
			runCatching { onAccel(event.values[0], event.values[1], event.values[2]) }
		}

		override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
	}

	private val battery = object : BroadcastReceiver() {
		override fun onReceive(ctx: Context, intent: Intent) {
			runCatching { onBattery(intent) }
		}
	}

	fun start(ctx: Context) {
		if (running) return
		running = true
		context = ctx.applicationContext
		if (Settings.shake) startSensor()
		if (Settings.battery) startBattery()
	}

	fun stop() {
		if (!running) return
		running = false
		stopSensor()
		stopBattery()
		Pet.tilt = 0f
		Pet.tiltY = 0f
	}

	/** Re-reads the two switches while running. */
	fun sync() {
		if (!running) return
		if (Settings.shake) startSensor() else stopSensor()
		if (Settings.battery) startBattery() else stopBattery()
	}

	private fun startSensor() {
		if (sensors != null) return
		val manager = context?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
		val sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
		if (manager.registerListener(accel, sensor, SensorManager.SENSOR_DELAY_UI)) {
			sensors = manager
			prev = null
			restSy = Float.NaN
			hits.clear()
		}
	}

	private fun stopSensor() {
		sensors?.unregisterListener(accel)
		sensors = null
		Pet.tilt = 0f
		Pet.tiltY = 0f
	}

	private fun startBattery() {
		if (batteryRegistered) return
		val ctx = context ?: return
		// Sticky: registering hands back the current state at once, which only sets the baseline.
		wasCharging = null
		runCatching {
			ctx.registerReceiver(battery, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
			batteryRegistered = true
		}
	}

	private fun stopBattery() {
		if (!batteryRegistered) return
		runCatching { context?.unregisterReceiver(battery) }
		batteryRegistered = false
	}

	private fun onBattery(intent: Intent) {
		val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
		val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
		val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
		val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
		val percent = if (level < 0) 100 else level * 100 / scale
		val before = wasCharging
		wasCharging = charging
		if (before == false && charging) mainHandler.post { Pet.onCharging() }
		if (charging || percent > LOW_LEVEL + 5) lowNotified = false
		// Once per dip below the line, not on every percent after it.
		if (!charging && percent <= LOW_LEVEL && !lowNotified) {
			lowNotified = true
			if (before != null) mainHandler.post { Pet.onLowBattery() }
		}
	}

	private fun rotation(): Int = runCatching {
		@Suppress("DEPRECATION")
		(context?.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation
	}.getOrDefault(Surface.ROTATION_0)

	private fun onAccel(ax: Float, ay: Float, az: Float) {
		val last = prev
		prev = floatArrayOf(ax, ay, az)
		if (last != null) {
			val jerk = sqrt((ax - last[0]).let { it * it } + (ay - last[1]).let { it * it } + (az - last[2]).let { it * it })
			if (jerk > SHAKE_JERK) {
				val now = SystemClock.uptimeMillis()
				hits.removeAll { now - it > SHAKE_WINDOW_MS }
				hits.add(now)
				if (hits.size >= SHAKE_HITS) {
					hits.clear()
					mainHandler.post { Pet.onShake(jerk) }
				}
			}
		}
		// Screen-relative sideways tilt, only while the phone is roughly upright.
		val (sx, sy) = when (rotation()) {
			Surface.ROTATION_90 -> ay to ax
			Surface.ROTATION_180 -> ax to -ay
			Surface.ROTATION_270 -> -ay to -ax
			else -> -ax to ay
		}
		val raw = if (sy > 2f) (sx / EARTH_G).coerceIn(-1f, 1f) else 0f
		Pet.tilt = Pet.tilt * 0.7f + raw * 0.3f
		// Forward/back: there is no "level" way to hold a phone, so this is measured against how it has
		// been held lately. Tipping the top down (towards flat or past it) lifts Sparkle, tipping it back
		// up pushes it down; hold a new angle and after a few seconds that becomes the rest angle again.
		if (restSy.isNaN()) restSy = sy
		restSy += (sy - restSy) * 0.012f
		val pitch = ((restSy - sy) / EARTH_G).coerceIn(-1f, 1f)
		Pet.tiltY = Pet.tiltY * 0.7f + pitch * 0.3f
	}
}
