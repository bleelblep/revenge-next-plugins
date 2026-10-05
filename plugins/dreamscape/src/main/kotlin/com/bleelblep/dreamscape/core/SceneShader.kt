package com.bleelblep.dreamscape.core

import android.graphics.Color
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.view.View
import java.util.TreeMap
import java.util.WeakHashMap

/** Uses VFX's process-wide layer contract; only our ordered key is added/removed. */
internal class SceneShader(private val root: View) {
	private var shader: RuntimeShader? = null
	private var applied = false
	var error: String? = null; private set
	val active: Boolean get() = applied

	@Suppress("UNCHECKED_CAST")
	private fun layer(effect: RenderEffect?) {
		val props = System.getProperties()
		val table = synchronized(props) {
			(props["bleelblep.renderLayers.v1"] as? WeakHashMap<View, TreeMap<String, RenderEffect>>)
				?: WeakHashMap<View, TreeMap<String, RenderEffect>>().also { props["bleelblep.renderLayers.v1"] = it }
		}
		val layers = table.getOrPut(root) { TreeMap() }
		if (effect == null) layers.remove("15-dreamscape") else layers["15-dreamscape"] = effect
		var combined: RenderEffect? = null
		for (entry in layers.values) combined = if (combined == null) entry else RenderEffect.createChainEffect(entry, combined)
		root.setRenderEffect(combined)
		if (layers.isEmpty()) table.remove(root)
		applied = effect != null
	}

	fun draw(scene: Scene?, time: Float, strength: Float, preview: Boolean): Boolean {
		if (Build.VERSION.SDK_INT < 33 || error != null || scene == null) { clear(); return false }
		return runCatching {
			val s = shader ?: RuntimeShader(SOURCE).also { shader = it }
			s.setFloatUniform("size", root.width.toFloat().coerceAtLeast(1f), root.height.toFloat().coerceAtLeast(1f))
			s.setFloatUniform("time", time * scene.speed)
			s.setFloatUniform("density", root.resources.displayMetrics.density)
			s.setFloatUniform("tint", Color.red(scene.color) / 255f, Color.green(scene.color) / 255f, Color.blue(scene.color) / 255f)
			s.setFloatUniform("amount", ((.35f + scene.intensity) * (.5f + strength * .5f) * if (preview) 1.2f else 1f).coerceIn(.2f, 1f))
			s.setFloatUniform("world", when (scene.world) { "ocean" -> 1f; "storm" -> 2f; "library" -> 3f; else -> 0f })
			layer(RenderEffect.createRuntimeShaderEffect(s, "img"))
			true
		}.getOrElse { error = it.message ?: it.javaClass.simpleName; clear(); false }
	}
	fun clear() { if (Build.VERSION.SDK_INT >= 33 && applied) layer(null) }

	companion object {
		// VFX-style live image sampling, chromatic fringe and procedural atmosphere.
		private const val SOURCE = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
uniform float3 tint;
uniform float amount;
uniform float world;
float hash(float2 p) { return fract(sin(dot(p, float2(127.1,311.7)))*43758.5453); }
float noise(float2 p) {
    float2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+float2(1.0,0.0)),f.x),mix(hash(i+float2(0.0,1.0)),hash(i+1.0),f.x),f.y);
}
half4 main(float2 p) {
    float2 uv=p/size;
    float2 q=p;
    float2 centered=uv*2.0-1.0;
    float edge=clamp(dot(centered,centered)*0.65,0.0,1.0);
    float haze=0.0;
    float glow=0.0;
    float3 color=tint;
    if (world < 0.5) {
        float2 cloud=uv*float2(3.0,4.0)+float2(time*0.06,-time*0.03);
        float n=noise(cloud)*0.65+noise(cloud*2.1+4.2)*0.35;
        haze=smoothstep(0.25,0.85,n)*(0.35+edge*0.65);
        color=mix(tint,float3(0.18,0.55,1.0),smoothstep(0.3,0.8,n));
        q+=float2(sin(uv.y*8.0+time),cos(uv.x*6.0+time*0.7))*density*amount;
        float2 moon=(uv-float2(0.8,0.2))*float2(size.x/size.y,1.0);
        glow=exp(-length(moon)*24.0)*0.28;
    } else if (world < 1.5) {
        float wave=sin(uv.x*17.0+time*1.2+sin(uv.y*9.0-time));
        float cross=sin(uv.y*21.0-time*1.4+sin(uv.x*11.0+time));
        glow=pow(1.0-abs(wave*cross),12.0)*0.2;
        haze=0.25+edge*0.35;
        color=mix(float3(0.03,0.20,0.48),tint,uv.y);
        q+=float2(wave,cross)*density*2.5*amount;
    } else if (world < 2.5) {
        float cloud=noise(uv*float2(4.0,6.0)+float2(time*0.15,0.0));
        haze=0.3+cloud*0.4;
        float flash=pow(max(0.0,sin(time*0.8)),28.0);
        glow=flash*0.14*(0.3+cloud);
        color=mix(float3(0.10,0.15,0.32),tint,cloud);
        q.x+=sin(uv.y*18.0+time*3.0)*density*amount;
    } else {
        float shaft=pow(max(0.0,sin(uv.x*13.0+uv.y*3.0+sin(time*0.3))),10.0);
        haze=0.2+edge*0.3;
        glow=shaft*(1.0-uv.y)*0.16;
        color=mix(float3(0.28,0.12,0.08),tint,0.7);
    }
    half4 c=img.eval(q);
    float2 fringe=centered*edge*density*amount;
    float3 rgb=float3(float(img.eval(q+fringe).r),float(c.g),float(img.eval(q-fringe).b));
    float luminance=dot(rgb,float3(0.2126,0.7152,0.0722));
    float shadow=1.0-smoothstep(0.2,0.85,luminance);
    rgb=mix(rgb,rgb*color+color*0.22*float(c.a),haze*amount*shadow);
    rgb+=color*(haze*0.1+glow)*amount*float(c.a);
    return half4(half3(clamp(rgb,0.0,float(c.a))),c.a);
}
"""
	}
}
