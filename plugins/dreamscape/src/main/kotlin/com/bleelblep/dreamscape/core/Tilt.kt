package com.bleelblep.dreamscape.core

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

internal class Tilt(context: Context) : SensorEventListener {
	private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
	private val sensor = manager.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
	val supported get() = sensor != null
	private var registered = false
	var x = 0f; private set
	var y = 0f; private set
	fun active(on: Boolean) {
		if (on == registered) return
		if (on && sensor != null) registered = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
		else { manager.unregisterListener(this); registered = false; x = 0f; y = 0f }
	}
	override fun onSensorChanged(e: SensorEvent) {
		x += ((e.values[0] / 9.81f).coerceIn(-1f, 1f) - x) * .12f
		y += ((e.values[1] / 9.81f).coerceIn(-1f, 1f) - y) * .12f
	}
	override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
