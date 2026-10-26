package com.bleelblep.screeneffects

/**
 * The frosted glass filter. Listed in [FILTERS] with the rest.
 */

/**
 * Frosted glass: the whole screen frosts over (blurred, whitened, with a fine ice grain) and a
 * finger wipes it clear; [FrostMask] holds where it's been wiped and slowly frosts it back.
 * Animated, so the regrowth shows.
 */
internal const val FROST_SHADER = """
uniform shader img;
uniform shader mask;
uniform float density;
float hash(float2 v) { return fract(sin(dot(v, float2(12.9898, 78.233))) * 43758.5453); }
half4 main(float2 p) {
    half4 c = img.eval(p);
    float fog = float(mask.eval(p).a);
    if (fog < 0.01) return c;
    float n = hash(floor(p / (2.0 * density)));
    float2 j = (float2(hash(floor(p / (3.0 * density)) + 1.3), n) - 0.5) * 6.0 * density;
    float r = 7.0 * density;
    float3 blur = (float3(img.eval(p + j + float2(r, 0.0)).rgb) + float3(img.eval(p + j - float2(r, 0.0)).rgb)
        + float3(img.eval(p + j + float2(0.0, r)).rgb) + float3(img.eval(p + j - float2(0.0, r)).rgb)) * 0.25;
    float l = dot(blur, float3(0.2126, 0.7152, 0.0722));
    float3 frost = mix(blur, float3(l), 0.35) * 0.72 + 0.28;
    frost += (n - 0.5) * 0.05;
    frost += step(0.985, hash(floor(p / (1.5 * density)) + 7.0)) * 0.25;
    float3 rgb = mix(float3(c.rgb), frost * float(c.a), fog * 0.92);
    rgb *= 1.0 - 0.12 * fog * (1.0 - fog) * 4.0;
    return half4(half3(min(rgb, float3(c.a))), c.a);
}
"""

internal const val FILTER_FROST = "frost"
