package com.bleelblep.dreamscape.features

import android.graphics.*
import android.os.Build
import com.bleelblep.dreamscape.core.*

internal class Glass : Feature {
	var surfaces: List<Surface> = emptyList()
	var backdrop: Bitmap? = null
	var error: String? = null; private set
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private var shader: RuntimeShader? = null
	private var failed = false
	private var imageShader: BitmapShader? = null
	private var image: Bitmap? = null
	private val path = Path()
	var touchX = 0f; var touchY = 0f; var touchTime = -100f
	override fun draw(canvas: Canvas, frame: Frame) {
		val c = canvas; val f = frame
		for (surface in surfaces) {
			val r = surface.bounds
			c.save()
			path.reset(); path.fillType = Path.FillType.EVEN_ODD
			path.addRoundRect(r, 18 * f.density, 18 * f.density, Path.Direction.CW)
			if (surface.composer) {
				val inner = RectF(r); inner.inset(5 * f.density, 5 * f.density)
				if (inner.width() > 0 && inner.height() > 0) path.addRoundRect(inner, 13 * f.density, 13 * f.density, Path.Direction.CW)
			}
			c.clipPath(path)
			val bitmap = backdrop
			if (Build.VERSION.SDK_INT >= 33 && !failed && bitmap != null) {
				runCatching {
					val s = shader ?: RuntimeShader(SOURCE).also { shader = it }
					if (image !== bitmap) { image = bitmap; imageShader = BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
					val bs = imageShader!!
					bs.setLocalMatrix(Matrix().apply { setScale(f.width / bitmap.width, f.height / bitmap.height) })
					s.setInputShader("backdrop", bs)
					s.setFloatUniform("box", r.left, r.top, r.right, r.bottom)
					s.setFloatUniform("tilt", f.tiltX, f.tiltY)
					s.setFloatUniform("strength", f.config.strength)
					s.setFloatUniform("density", f.density)
					s.setFloatUniform("frost", if (f.config.glassStyle == "frosted") 4 * f.density else 0f)
					s.setFloatUniform("smoke", if (f.config.glassStyle == "smoked") .4f else 0f)
					s.setFloatUniform("touch", touchX, touchY, (f.time - touchTime).coerceAtLeast(0f))
					paint.shader = s; c.drawRect(r, paint); paint.shader = null
				}.onFailure { failed = true; error = it.message; paint.shader = null }
			}
			paint.color = if (f.config.glassStyle == "smoked") 0x44202030 else 0x227FCFFF
			c.drawRect(r, paint); c.restore()
			paint.style = Paint.Style.STROKE; paint.strokeWidth = 1.5f * f.density
			paint.color = 0x99E8EEFF.toInt(); c.drawRoundRect(r, 18 * f.density, 18 * f.density, paint)
			paint.style = Paint.Style.FILL
		}
	}
	override fun clear() { surfaces = emptyList(); backdrop = null; imageShader = null; image = null; shader = null }
	companion object {
		private const val SOURCE = """
uniform shader backdrop;
uniform float4 box;
uniform float2 tilt;
uniform float strength;
uniform float density;
uniform float frost;
uniform float smoke;
uniform float3 touch;
half4 main(float2 p) {
    float2 mid = (box.xy + box.zw) * 0.5;
    float2 halfSize = max((box.zw-box.xy)*0.5, float2(1.0));
    float2 q = (p-mid)/halfSize;
    float edge = pow(clamp(max(abs(q.x),abs(q.y)),0.0,1.0),5.0);
    float2 uv = p - q * edge * 10.0 * density * strength + tilt * 3.0 * density;
    float dist = length(p-touch.xy);
    float ripple = sin(dist*0.1-touch.z*12.0)*exp(-touch.z*4.0)*2.0;
    uv += normalize(p-touch.xy+float2(0.01))*ripple;
    half4 c = (backdrop.eval(uv)+backdrop.eval(uv+float2(frost,0.0))+backdrop.eval(uv-float2(frost,0.0))+backdrop.eval(uv+float2(0.0,frost))+backdrop.eval(uv-float2(0.0,frost)))/5.0;
    float2 fringe = q * edge * strength * density * 1.5;
    c.r = mix(c.r,backdrop.eval(uv+fringe).r,half(0.65));
    c.b = mix(c.b,backdrop.eval(uv-fringe).b,half(0.65));
    float grain = fract(sin(dot(floor(p/density),float2(12.9898,78.233)))*43758.5453);
    c.rgb += half3((grain-0.5)*0.025*min(frost,1.0))*c.a;
    c.rgb *= half(1.0-smoke);
    c.rgb += half3(edge*(0.10+0.08*tilt.x))*c.a;
    return half4(clamp(c.rgb,half3(0.0),half3(c.a)),c.a);
}
"""
	}
}
