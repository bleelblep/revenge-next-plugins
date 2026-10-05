package com.bleelblep.dreamscape.features

import android.graphics.*
import android.os.Build
import com.bleelblep.dreamscape.core.*
import kotlin.math.sin

internal class Hologram : Feature {
	var surfaces: List<RectF> = emptyList()
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private var shader: RuntimeShader? = null
	var error: String? = null; private set
	override fun draw(canvas: Canvas, frame: Frame) {
		for (r in surfaces) {
			var rendered = false
			if (Build.VERSION.SDK_INT >= 33 && error == null) runCatching {
				val s = shader ?: RuntimeShader(SOURCE).also { shader = it }
				s.setFloatUniform("box", r.left, r.top, r.width().coerceAtLeast(1f), r.height().coerceAtLeast(1f))
				s.setFloatUniform("tilt", frame.tiltX, frame.tiltY)
				s.setFloatUniform("time", frame.time)
				s.setFloatUniform("strength", frame.config.strength)
				s.setFloatUniform("style", when (frame.config.holoStyle) { "prismatic" -> 1f; "ghost" -> 2f; else -> 0f })
				paint.shader = s; paint.alpha = 255
				canvas.drawRoundRect(r, r.height() * .3f, r.height() * .3f, paint)
				rendered = true
			}.onFailure { error = it.message; paint.shader = null }
			if (!rendered) {
			val shift = frame.tiltX * r.width() + sin(frame.time * .6f) * r.width() * .25f
			val colours = if (frame.config.holoStyle == "ghost") intArrayOf(0x0044FFFF, 0x7799FFFF, 0x00FFFFFF)
				else intArrayOf(0x009A7AFF, 0x886FE7FF.toInt(), 0x88FF87DC.toInt(), 0x88FFF6A0.toInt(), 0x009A7AFF)
			paint.shader = LinearGradient(r.left - r.width() + shift, r.top, r.right + shift, r.bottom, colours, null, Shader.TileMode.MIRROR)
			paint.alpha = (frame.config.strength * 190).toInt()
			canvas.drawRoundRect(r, r.height() * .3f, r.height() * .3f, paint)
			}
			paint.shader = null; paint.alpha = 255
			paint.color = 0x88E8DEFF.toInt(); paint.style = Paint.Style.STROKE; paint.strokeWidth = frame.density
			canvas.drawRoundRect(r, r.height() * .3f, r.height() * .3f, paint); paint.style = Paint.Style.FILL
			if (frame.config.holoStyle == "prismatic") for (i in 0..5) {
				val x = r.left + ((i * .37f + frame.time * .06f) % 1) * r.width()
				val y = r.top + ((i * .61f) % 1) * r.height()
				canvas.drawCircle(x, y, frame.density, paint)
			}
		}
	}
	override fun clear() { surfaces = emptyList(); shader = null }
	companion object {
		private const val SOURCE = """
uniform float4 box;
uniform float2 tilt;
uniform float time;
uniform float strength;
uniform float style;
float hash(float2 p) { return fract(sin(dot(p,float2(12.9898,78.233)))*43758.5453); }
half4 main(float2 p) {
    float2 uv=(p-box.xy)/box.zw;
    float angle=uv.x*1.8+uv.y*1.2+tilt.x*0.6+tilt.y*0.4+time*0.08;
    float3 rainbow=0.55+0.45*cos(6.28318*(angle+float3(0.0,0.33,0.67)));
    float band=pow(max(0.0,cos((uv.x-uv.y+tilt.x*0.4+sin(time*0.35)*0.3)*5.0)),10.0);
    float grain=hash(floor(p*0.5));
    float shimmer=step(0.985,grain)*pow(max(0.0,sin(time*2.0+grain*60.0)),8.0);
    if (style>0.5 && style<1.5) rainbow*=0.7+0.3*abs(sin((uv.x+uv.y)*45.0));
    if (style>1.5) rainbow=mix(float3(0.35,0.9,1.0),float3(1.0),band);
    float alpha=clamp((0.16+band*0.38+shimmer*0.4)*strength,0.0,0.8);
    float3 color=clamp(rainbow+band*0.25+shimmer,0.0,1.0);
    return half4(half3(color*alpha),half(alpha));
}
"""
	}
}
