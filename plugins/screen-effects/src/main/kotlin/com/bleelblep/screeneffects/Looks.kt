package com.bleelblep.screeneffects

/** The Old film screen filter. Listed in [FILTERS] with the rest. */

/**
 * Old film: faded warm tones, film grain, the picture weaving and flickering slightly, thin
 * scratches running down and the odd fleck of dust, inside a soft dark vignette. Animated.
 */
internal const val OLD_FILM_SHADER = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
float hash(float2 v) { return fract(sin(dot(v, float2(12.9898, 78.233))) * 43758.5453); }
half4 main(float2 p) {
    float frame = floor(time * 18.0);
    float2 weave = (float2(hash(float2(frame, 1.0)), hash(float2(frame, 2.0))) - 0.5) * float2(1.5, 2.5) * density;
    half4 c = img.eval(p + weave);
    float3 rgb = float3(c.rgb);
    float l = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, float3(l), 0.55);
    rgb = rgb * float3(1.05, 0.95, 0.78) * 0.85 + float3(0.07, 0.05, 0.02);
    rgb *= 0.93 + 0.07 * hash(float2(frame, 5.0));
    float grain = hash(floor(p / (1.5 * density)) + frame * 1.37) - 0.5;
    rgb += grain * 0.09;
    for (int i = 0; i < 2; ++i) {
        float sx = hash(float2(floor(time * 3.0) + float(i) * 7.0, 9.0)) * size.x;
        float w = (0.6 + hash(float2(frame, float(i))) * 0.8) * density;
        float s = 1.0 - smoothstep(0.0, w, abs(p.x - sx));
        rgb = mix(rgb, float3(0.95, 0.92, 0.85), s * 0.35 * step(0.3, hash(float2(frame + float(i), 3.0))));
    }
    float2 dustCell = floor(p / (40.0 * density));
    float dust = step(0.997, hash(dustCell + frame * 0.71));
    float2 inCell = fract(p / (40.0 * density)) - 0.5;
    rgb = mix(rgb, float3(0.08, 0.06, 0.05), dust * (1.0 - smoothstep(0.05, 0.12, length(inCell))));
    float2 uv = p / size * 2.0 - 1.0;
    rgb *= 1.0 - 0.45 * smoothstep(0.5, 1.5, dot(uv, uv));
    return half4(half3(clamp(rgb, 0.0, 1.0) * float(c.a)), c.a);
}
"""
