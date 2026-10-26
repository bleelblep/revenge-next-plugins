package com.bleelblep.screeneffects

import android.animation.TimeInterpolator
import android.view.animation.LinearInterpolator

/**
 * One touch effect. [shader] is AGSL and must declare exactly the uniforms [Ripple] sets
 * (`img`, `density`, `size`, `count`, `dose`, and the `t`/`centerX`/`centerY`/`intensity` arrays
 * of length [MAX_COUNT]) and use every one of them, or setting it throws. [duration] gets the
 * distance from the tap to the farthest corner and the display density, and returns seconds.
 */
internal class Style(
	val id: String,
	val shader: String,
	val interpolator: TimeInterpolator,
	val duration: (maxDist: Float, density: Float) -> Float,
)

/** Uniforms plus the shared last step: sample, optional red/blue split, brightness. */
private const val COMMON = """
uniform shader img;

uniform float density;
uniform float2 size;
uniform int count;
uniform float dose;

uniform float[7] t;
uniform float[7] centerX;
uniform float[7] centerY;
uniform float[7] intensity;

half4 finish(float2 fragCoord, float2 offset, float add, float2 split) {
    float2 uv = fragCoord + offset;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > size.x || uv.y > size.y) return half4(0.0);
    half4 c = img.eval(uv);
    float2 s = split + offset * dose;
    if (s.x != 0.0 || s.y != 0.0) {
        c.r = img.eval(uv + s).r;
        c.b = img.eval(uv - s).b;
    }
    return half4(c.rgb + half(add) * c.a, c.a);
}
"""

/**
 * A single sharp ring that races out from the tap, bending the screen like a lens as it passes
 * and leaving it flat behind. Brighter along its crest, fading as it travels.
 */
private const val SHOCKWAVE_SHADER = COMMON + """
float3 shock(float2 pos, float2 center, float k, float time) {
    float radius = time * 1100.0 * density;
    float width = (26.0 + 14.0 * min(k, 2.0)) * density;
    float2 d = pos - center;
    float dist = length(d);
    float diff = dist - radius;
    if (dist < 1.0 || abs(diff) >= width) return float3(0.0);

    float x = diff / width;
    float body = (1.0 - x * x) * (1.0 - x * x);
    float fade = exp(-1.4 * time) * clamp(radius / (40.0 * density), 0.0, 1.0);
    float amp = 34.0 * density * k * fade;
    return float3(-(d / dist) * x * body * amp, 0.16 * body * fade * min(k, 1.5));
}

half4 main(in float2 fragCoord) {
    float2 offset = float2(0.0);
    float add = 0.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float3 s = shock(fragCoord, float2(centerX[i], centerY[i]), intensity[i], t[i]);
        offset += s.xy;
        add += s.z;
    }
    return finish(fragCoord, offset, add, float2(0.0));
}
"""

private const val SWIRL_SECONDS = 0.8f

/** The screen around the tap twists like water down a drain, then untwists. */
private const val SWIRL_SHADER = COMMON + """
float2 swirl(float2 pos, float2 center, float k, float time) {
    float p = clamp(time / 0.8, 0.0, 1.0);
    float envelope = sin(3.14159265 * p);
    float radius = (160.0 + 90.0 * min(k, 2.0)) * density;
    float2 d = pos - center;
    float dist = length(d);
    if (dist >= radius) return pos;

    float f = 1.0 - dist / radius;
    float angle = f * f * 2.6 * k * envelope;
    float s = sin(angle);
    float c = cos(angle);
    return center + float2(d.x * c - d.y * s, d.x * s + d.y * c);
}

half4 main(in float2 fragCoord) {
    float2 p = fragCoord;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        p = swirl(p, float2(centerX[i], centerY[i]), intensity[i], t[i]);
    }
    return finish(fragCoord, p - fragCoord, 0.0, float2(0.0));
}
"""

private const val GLITCH_SECONDS = 0.5f

/**
 * A burst of digital corruption: horizontal slices jump sideways, red and blue tear apart and the
 * brightness flickers, strongest on the tapped row and settling over half a second. The pattern
 * re-rolls 24 times a second.
 */
private const val GLITCH_SHADER = COMMON + """
float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

half4 main(in float2 fragCoord) {
    float2 offset = float2(0.0);
    float add = 0.0;
    float split = 0.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float time = t[i];
        float e = pow(1.0 - clamp(time / 0.5, 0.0, 1.0), 1.5);
        if (e > 0.0) {
            float k = intensity[i];
            float frame = floor(time * 24.0) + float(i) * 17.0;
            float2 d = fragCoord - float2(centerX[i], centerY[i]);
            float near = exp(-abs(d.y) / (220.0 * density)) * mix(0.6, 1.0, exp(-abs(d.x) / (400.0 * density)));

            float bandHeight = (6.0 + 34.0 * hash(frame * 1.31 + 0.5)) * density;
            float band = floor(fragCoord.y / bandHeight);
            if (hash(band * 12.9898 + frame * 78.233) > 0.62) {
                offset.x += (hash(band * 3.7 + frame * 1.9) - 0.5) * 140.0 * density * k * e * near;
            }
            split += 7.0 * density * min(k, 2.0) * e * (0.4 + 0.6 * near);
            add += (hash(frame * 5.3 + 0.25) - 0.5) * 0.12 * e * near;
        }
    }
    return finish(fragCoord, offset, add, float2(split, 0.0));
}
"""

private const val PIXEL_SECONDS = 0.6f

/** A circle of chunky pixels blooms out from the tap, then sharpens back into the screen. */
private const val PIXEL_SHADER = COMMON + """
half4 main(in float2 fragCoord) {
    float block = 1.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float k = min(intensity[i], 2.0);
        float p = clamp(t[i] / 0.6, 0.0, 1.0);
        float radius = (60.0 + 220.0 * k) * density * (0.3 + 0.7 * sqrt(p));
        float dist = length(fragCoord - float2(centerX[i], centerY[i]));
        float edge = 1.0 - smoothstep(radius * 0.7, radius, dist);
        block = max(block, 1.0 + (22.0 * density * k - 1.0) * (1.0 - p) * edge);
    }
    float2 offset = float2(0.0);
    if (block > 1.5) {
        offset = (floor(fragCoord / block) + 0.5) * block - fragCoord;
    }
    return finish(fragCoord, offset, 0.0, float2(0.0));
}
"""

private const val INK_SECONDS = 1.8f

/**
 * A drop of ink hits the screen: a blot blooms out with a wobbly, tendrilled edge, the screen
 * ripples under its rim as it spreads, then it thins and dissolves. [inkColor] picks each drop's
 * ink; the colour and black-and-white versions differ only in that.
 */
private fun inkShader(inkColor: String) = COMMON + """
float hash(float n) {
    return fract(sin(n) * 43758.5453);
}
""" + inkColor + """
half4 main(in float2 fragCoord) {
    float2 offset = float2(0.0);
    float3 tint = float3(0.0);
    float amount = 0.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float p = clamp(t[i] / 1.8, 0.0, 1.0);
        float k = min(intensity[i], 2.0);
        float2 center = float2(centerX[i], centerY[i]);
        float2 d = fragCoord - center;
        float dist = length(d);
        float seed = centerX[i] * 0.013 + centerY[i] * 0.007;
        float ang = atan(d.y, d.x);
        float wobble = 1.0 + 0.16 * sin(ang * 5.0 + seed * 9.0 + p * 2.0) + 0.09 * sin(ang * 11.0 - seed * 5.0) + 0.05 * sin(ang * 23.0 + seed);
        float radius = (70.0 + 110.0 * k) * density * (1.0 - exp(-4.0 * p)) * wobble;
        float edge = 1.0 - smoothstep(radius * 0.85, radius, dist);
        float fade = pow(1.0 - p, 1.2);
        float swirlInk = 0.8 + 0.2 * sin(dist / (9.0 * density) - p * 6.0 + ang * 3.0);
        float a = edge * fade * swirlInk * 0.8;
        tint += inkColor(seed, center) * a;
        amount += a;
        float rim = exp(-abs(dist - radius) / (10.0 * density)) * fade;
        if (dist > 0.5) offset += d / dist * rim * 9.0 * density * k;
    }
    half4 c = finish(fragCoord, offset, 0.0, float2(0.0));
    if (amount <= 0.0) return c;
    float3 ink = tint / amount;
    float a = min(amount, 0.9);
    float l = dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722));
    float3 inked = ink * (0.7 + 0.45 * l) * float(c.a);
    return half4(half3(mix(float3(c.rgb), inked, a)), c.a);
}
"""

/** Bright, saturated inks: hot pink, electric blue, violet, green, orange. */
private val INK_SHADER = inkShader("""
float3 inkColor(float n, float2 center) {
    float h = hash(n);
    if (h < 0.2) return float3(1.0, 0.05, 0.55);
    if (h < 0.4) return float3(0.0, 0.45, 1.0);
    if (h < 0.6) return float3(0.62, 0.08, 1.0);
    if (h < 0.8) return float3(0.0, 0.95, 0.55);
    return float3(1.0, 0.45, 0.0);
}
""")

/**
 * Black or white ink, whichever stands out against what's under the tap: black on light screens,
 * white on dark ones.
 */
private val INK_MONO_SHADER = inkShader("""
float3 inkColor(float n, float2 center) {
    half4 under = img.eval(center);
    float l = dot(float3(under.rgb), float3(0.2126, 0.7152, 0.0722));
    return l > 0.5 ? float3(0.02) : float3(1.0);
}
""")

private const val TIMEJUMP_SECONDS = 0.9f

/**
 * Time jump: a blue-white flash at the finger, jagged electric arcs crackling outward (re-rolled
 * 20 times a second), the screen pulled in towards the tap and then thrown back out with a pop,
 * like a car hitting 88 miles an hour.
 */
private const val TIMEJUMP_SHADER = COMMON + """
float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

half4 main(in float2 fragCoord) {
    float2 offset = float2(0.0);
    float glow = 0.0;
    float white = 0.0;
    float strength = 0.0;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float time = t[i];
        float p = clamp(time / 0.9, 0.0, 1.0);
        float k = min(intensity[i], 2.0);
        float2 d = fragCoord - float2(centerX[i], centerY[i]);
        float dist = length(d);
        float r = dist / density;
        float pull = p < 0.55 ? sin(3.14159265 * p / 0.55) : 0.0;
        float pop = p >= 0.55 ? exp(-(p - 0.55) * 9.0) : 0.0;
        float reach = 120.0 + 80.0 * k;
        float near = exp(-r / reach);
        if (dist > 0.5) offset += d / dist * (pull * 22.0 - pop * 30.0) * density * k * near;
        white += exp(-r / (26.0 + 14.0 * k)) * (exp(-p * 10.0) * 1.2 + pop * 0.8);
        float seed = centerX[i] * 0.013 + centerY[i] * 0.007 + floor(time * 20.0) * 1.7;
        float ang = atan(d.y, d.x);
        float len = reach * 1.6 * (0.3 + 0.7 * sqrt(p));
        float n = floor(r / 14.0);
        float f = fract(r / 14.0);
        for (int j = 0; j < 6; ++j) {
            float fj = float(j);
            float base = (fj + hash(seed + fj)) * 1.0471976;
            float da = ang - base;
            da -= 6.2831853 * floor((da + 3.14159265) / 6.2831853);
            float lateral = (mix(hash(seed + fj * 7.0 + n), hash(seed + fj * 7.0 + n + 1.0), f) - 0.5) * 24.0;
            float dev = abs(da * r - lateral);
            float flicker = 0.6 + 0.4 * hash(seed + fj * 11.0);
            glow += (exp(-dev / 1.4) + 0.35 * exp(-dev / 7.0)) * (1.0 - smoothstep(len * 0.6, len, r))
                * smoothstep(2.0, 10.0, r) * (1.0 - p) * flicker;
        }
        strength = max(strength, min(k, 1.5));
    }
    half4 c = finish(fragCoord, offset, 0.0, float2(0.0));
    float3 add = (float3(0.45, 0.75, 1.0) * glow + float3(0.85, 0.93, 1.0) * white) * strength;
    return half4(c.rgb + half3(add) * c.a, c.a);
}
"""

private val LINEAR = LinearInterpolator()

internal val STYLES: Map<String, Style> = listOf(
	RIPPLE_STYLE,
	Style("shockwave", SHOCKWAVE_SHADER, LINEAR) { maxDist, density -> maxDist / (1100f * density) + 0.1f },
	Style("swirl", SWIRL_SHADER, LINEAR) { _, _ -> SWIRL_SECONDS },
	Style("glitch", GLITCH_SHADER, LINEAR) { _, _ -> GLITCH_SECONDS },
	Style("pixel", PIXEL_SHADER, LINEAR) { _, _ -> PIXEL_SECONDS },
	Style("ink", INK_SHADER, LINEAR) { _, _ -> INK_SECONDS },
	Style("inkmono", INK_MONO_SHADER, LINEAR) { _, _ -> INK_SECONDS },
	Style("timejump", TIMEJUMP_SHADER, LINEAR) { _, _ -> TIMEJUMP_SECONDS },
).associateBy { it.id }

internal const val DEFAULT_STYLE = "ripple"

/** Effects that are not tap-driven [Style]s: nothing at all, and the finger-following [Lens]. */
internal const val STYLE_NONE = "none"
internal const val STYLE_LENS = "lens"

