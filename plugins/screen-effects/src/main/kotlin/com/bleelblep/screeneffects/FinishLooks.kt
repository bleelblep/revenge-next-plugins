package com.bleelblep.screeneffects

/*
 * The screen effect under each combo skin's full-screen finish (SkinFinishes.kt), on phones that
 * run AGSL shaders. On the legacy renderer there is none and the finish is drawn as it is.
 *
 * Each look is a VFX filter, touch effect or Scenes atmosphere reworked into a `look(p)` function:
 * VHS is taken straight from Filters.kt, Cosy is Scenes' Enchanted forest, Comic is the comic-book filter VFX had in 0.12, Rhythm is
 * Vaporwave, Terminal is Night vision with the Glitch touch effect's slices, Platformer is the
 * Pixel touch effect held on screen. [wrap] puts every one under the same main: it fades in with
 * `strength` (like Arcade's CRT) and punches in, with a jolt, on the finish's slam and stamp.
 *
 * Every look gets exactly these uniforms and the wrapper uses them all, because setting a uniform
 * the shader stripped as unused throws.
 */

private const val HEAD = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
uniform float strength;
"""

/** [punch] scales the slam/stamp jolt: 1 for most, small for Cosy. */
private fun wrap(body: String, punch: Float) = HEAD + body + """
float finishHit(float at) {
    float x = time - at;
    return x < 0.0 ? 0.0 : exp(-x * 8.0);
}
half4 main(float2 p) {
    float hit = (finishHit(0.3) + 0.7 * finishHit(2.05)) * $punch;
    float2 q = mix(p, size * 0.5, 0.035 * hit) + float2(sin(time * 61.0), cos(time * 53.0)) * 3.0 * density * hit;
    half4 base = img.eval(q);
    return mix(base, look(q), half(clamp(strength, 0.0, 1.0)));
}
"""

/** A filter from Filters.kt as a `look(p)` function: its own uniforms dropped (HEAD declares them). */
private fun fromFilter(source: String) =
	source.substringAfter("uniform float time;").replace("half4 main(float2 p)", "half4 look(float2 p)")

/** Style rank: a blood-red duotone with a slash shimmer running across. */
private const val STYLE = """
half4 look(float2 p) {
    half4 c = img.eval(p);
    float l = smoothstep(0.05, 0.95, dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722)));
    float3 dark = float3(0.06, 0.0, 0.03);
    float3 mid = float3(0.80, 0.06, 0.14);
    float3 light = float3(1.0, 0.94, 0.88);
    float3 tone = l < 0.5 ? mix(dark, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
    float3 rgb = mix(float3(c.rgb), tone, 0.7);
    float2 uv = p / size * 2.0 - 1.0;
    rgb *= smoothstep(1.5, 0.4, length(uv));
    rgb += 0.06 * max(0.0, sin((p.x + p.y) / (11.0 * density) - time * 6.0));
    return half4(half3(min(rgb, float3(float(c.a)))), c.a);
}
"""

/** Rhythm: Vaporwave's pink-to-cyan duotone and scanlines, pulsing on a 120 bpm beat. */
private const val RHYTHM = """
half4 look(float2 p) {
    half4 c = img.eval(p);
    float l = dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722));
    float3 shadow = float3(0.30, 0.05, 0.45);
    float3 mid = float3(1.00, 0.35, 0.75);
    float3 light = float3(0.45, 1.00, 1.00);
    float3 tone = l < 0.5 ? mix(shadow, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
    float scan = 0.9 + 0.1 * sin(p.y / density * 2.2);
    float beat = exp(-fract(time * 2.0) * 6.0);
    float3 rgb = mix(float3(c.rgb), tone * scan, 0.6) * (1.0 + 0.12 * beat);
    float2 uv = p / size * 2.0 - 1.0;
    rgb *= smoothstep(1.6, 0.6, length(uv));
    return half4(half3(min(rgb, float3(float(c.a)))), c.a);
}
"""

/** Retro platformer: chunky pixels that settle from big to small, and a short 8-bit palette. */
private const val PLATFORMER = """
half4 look(float2 p) {
    float settle = clamp(time / 0.6, 0.0, 1.0);
    float block = mix(20.0, 3.0, settle * settle) * density;
    float2 q = clamp((floor(p / block) + 0.5) * block, float2(0.0), size - 1.0);
    half4 c = img.eval(q);
    float3 rgb = float3(c.rgb);
    float l = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    rgb = clamp(mix(float3(l), rgb, 1.3), 0.0, 1.0);
    rgb = floor(rgb * 5.0 + 0.5) / 5.0;
    return half4(half3(min(rgb, float3(float(c.a)))), c.a);
}
"""

/** On fire: heat haze rippling up from the bottom, warm grading and an orange glow off bright things. */
private const val FIRE = """
half4 look(float2 p) {
    float2 uv = p / size;
    float rise = uv.y * uv.y;
    float2 q = p + float2(
        sin(p.y / (14.0 * density) + time * 9.0) * 3.0 * density * (0.3 + rise),
        sin(p.x / (22.0 * density) + time * 6.0) * 2.0 * density * rise);
    half4 c = img.eval(q);
    float3 rgb = float3(c.rgb) * float3(1.12, 0.96, 0.78);
    float r = 7.0 * density;
    float3 glow = (float3(img.eval(q + float2(r, 0.0)).rgb) + float3(img.eval(q - float2(r, 0.0)).rgb)
        + float3(img.eval(q + float2(0.0, r)).rgb) + float3(img.eval(q - float2(0.0, r)).rgb)) / 4.0;
    rgb += max(glow - 0.55, 0.0) * 1.6 * float3(1.0, 0.55, 0.15);
    float2 cuv = uv * 2.0 - 1.0;
    rgb = mix(rgb, float3(0.9, 0.25, 0.05), smoothstep(0.6, 1.6, dot(cuv, cuv)) * 0.45);
    return half4(half3(min(rgb, float3(float(c.a)))), c.a);
}
"""

/** Comic action: VFX 0.12's comic-book filter. Ink outlines, flat colours, halftone shadows. */
private const val COMIC = """
float lum(half3 c) { return dot(float3(c), float3(0.2126, 0.7152, 0.0722)); }
half4 look(float2 p) {
    half4 c = img.eval(p);
    float d = density;
    float l = lum(c.rgb);
    float gx = lum(img.eval(p + float2(d, 0.0)).rgb) - lum(img.eval(p - float2(d, 0.0)).rgb);
    float gy = lum(img.eval(p + float2(0.0, d)).rgb) - lum(img.eval(p - float2(0.0, d)).rgb);
    float edge = smoothstep(0.18, 0.35, length(float2(gx, gy)));
    float3 rgb = clamp(mix(float3(l), float3(c.rgb), 1.35), 0.0, 1.0);
    rgb = floor(rgb * 4.0 + 0.5) / 4.0;
    float cell = 4.0 * d;
    float2 r = float2(p.x + p.y, p.x - p.y) * 0.70710678;
    float2 f = fract(r / cell) - 0.5;
    float radius = sqrt(clamp((0.55 - l) / 0.55, 0.0, 1.0)) * 0.5;
    float dots = (1.0 - smoothstep(radius - 0.08, radius, length(f))) * step(l, 0.55);
    rgb *= 1.0 - 0.35 * dots;
    rgb *= 1.0 - 0.85 * edge;
    return half4(half3(min(rgb, float3(c.a))), c.a);
}
"""

/**
 * Hacker terminal: Night vision's green phosphor and grain, in a wider eyepiece, with the Glitch
 * effect's slices tearing hardest on the slam and the stamp.
 */
private const val TERMINAL = """
float hash1(float n) { return fract(sin(n) * 43758.5453); }
half4 look(float2 p) {
    float tear = 0.08 + step(0.3, time) * exp(-max(time - 0.3, 0.0) * 4.0)
        + 0.7 * step(2.05, time) * exp(-max(time - 2.05, 0.0) * 5.0);
    float frame = floor(time * 24.0);
    float bandHeight = (6.0 + 30.0 * hash1(frame * 1.31 + 0.5)) * density;
    float band = floor(p.y / bandHeight);
    float2 q = p;
    if (hash1(band * 12.9898 + frame * 78.233) > 0.7) {
        q.x += (hash1(band * 3.7 + frame * 1.9) - 0.5) * 90.0 * density * tear;
    }
    half4 c = img.eval(q);
    float l = dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722));
    l = pow(l, 0.7) * 1.25;
    float grain = fract(sin(dot(floor(p / 2.0) + frame, float2(12.9898, 78.233))) * 43758.5453);
    l *= 0.9 + 0.2 * grain;
    float scan = 0.85 + 0.15 * sin(p.y / density * 3.14159265 + time * 20.0);
    float2 uv = p / size * 2.0 - 1.0;
    uv.x *= size.x / size.y;
    float eyepiece = smoothstep(1.6, 0.9, length(uv));
    float3 green = float3(0.2, 1.0, 0.4) * l * scan * eyepiece;
    return half4(half3(min(green, float3(float(c.a)))), c.a);
}
"""

/**
 * Cosy: Enchanted forest from Scenes (bleelblep.scenes, EnchantedForest.kt + Common.kt's helpers,
 * both original CC0): sunbeams through a leaf canopy, fairy dust, fireflies and toadstool glow.
 * Copied rather than shared (plugins are separate builds). Changed: the toadstool sprites are left
 * out, since VFX ships no image atlas, but their glow stays; `scene` isn't a uniform here; `main`
 * is `look`.
 */
private const val FOREST = """

// Sine-free hash (Dave Hoskins): sin() loses precision on big inputs, which showed as blocky squares.
float hash(float2 p) {
    float3 p3 = fract(float3(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, float3(p3.y, p3.z, p3.x) + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float hash1(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
float noise(float2 p) {
    float2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), f.x), mix(hash(i + float2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float fbm(float2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += noise(p) * a; p = p * 2.03 + 3.1; a *= 0.5; }
    return v;
}
float3 screenBlend(float3 base, float3 add) { return 1.0 - (1.0 - base) * (1.0 - clamp(add, 0.0, 1.0)); }

// Lays an atmosphere over Discord's pixels [rgb] (alpha [a]) at screen point [p]:
// - `wash` / `haze`: a colour the dark parts of the screen lean toward;
// - `light`: coloured light added with a screen blend (glows, particles);
// - `grade` / `gradeAmount`: a colour the whole picture is gently pushed toward;
// - `rimDark`: darkening (silhouettes, shadows);
// - `paint` / `paintAmount`: opaque things in front of the screen (snow, petals);
// - `flash`: a brief whole-screen brightening (lightning).
// Light and haze lean on the dark parts of the screen so text stays readable.
half4 blend(float2 p, float3 rgb, float a, float3 light, float3 wash, float haze, float3 grade, float gradeAmount,
        float rimDark, float3 paint, float paintAmount, float flash, float vignette) {
    float2 centered = p / size * 2.0 - 1.0;
    float edge = clamp(dot(centered, centered) * 0.5, 0.0, 1.0);
    float lum = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    float shadows = 1.0 - smoothstep(0.3, 0.92, lum);
    rgb = mix(rgb, rgb * grade, gradeAmount * strength);
    rgb = mix(rgb, mix(rgb, wash, 0.85), haze * strength * shadows);
    rgb = screenBlend(rgb, light * strength * (0.3 + 0.7 * shadows) * a);
    rgb *= 1.0 - rimDark * strength;
    rgb = mix(rgb, paint * a, clamp(paintAmount * (0.4 + 0.6 * strength), 0.0, 1.0));
    rgb += flash * 0.35 * strength * a;
    rgb *= 1.0 - edge * vignette * strength;
    return half4(half3(clamp(rgb, 0.0, a)), half(a));
}

// Reads Discord at [q] (the distorted point) with a soft chromatic fringe toward the edges.
float4 readScreen(float2 p, float2 q) {
    float2 centered = p / size * 2.0 - 1.0;
    float edge = clamp(dot(centered, centered) * 0.5, 0.0, 1.0);
    float2 fringe = centered * edge * 2.5 * density * strength;
    half4 c = img.eval(q);
    return float4(float(img.eval(q + fringe).r), float(c.g), float(img.eval(q - fringe).b), float(c.a));
}

// A leaf, pointed at both ends, along +y in its own units (length about 1).
float leaf(float2 f) {
    float w = 0.32 * sin(clamp(f.y + 0.5, 0.0, 1.0) * 3.1416);
    return smoothstep(0.03, -0.03, abs(f.x) - w) * step(-0.5, f.y) * step(f.y, 0.5);
}

// The canopy: overlapping leaves hanging from the top edge, thick in the corners, thin in the
// middle. [dp] is in dp from the top-left.
float canopy(float2 dp, float2 sizeDp) {
    float side = min(dp.x, sizeDp.x - dp.x);
    float reach = 26.0 + 120.0 * smoothstep(200.0, 0.0, side) + 30.0 * fbm(float2(dp.x / 40.0, 3.0));
    if (dp.y > reach + 30.0) return 0.0;
    float m = 0.0;
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float2 g = dp / (22.0 + fi * 8.0) + float2(fi * 3.7, 0.0);
        float2 id = floor(g), f = fract(g) - 0.5;
        float h = hash(id + fi * 7.0);
        float a = (h - 0.5) * 1.6 + sin(time * 0.8 + h * 20.0) * 0.08;
        float2 r = float2(f.x * cos(a) - f.y * sin(a), f.x * sin(a) + f.y * cos(a));
        m = max(m, leaf(r / 0.95) * step(0.25, h));
    }
    return m * smoothstep(reach + 25.0, reach - 10.0, dp.y);
}

half4 look(float2 p) {
    float2 uv = p / size;
    float d = density;
    float2 dp = p / d;
    float2 sizeDp = size / d;

    // Sunbeams from above the top-left corner: bright and dim bands by angle, flickering as the
    // canopy moves.
    float2 src = float2(-0.25 * sizeDp.x, -0.35 * sizeDp.y);
    float2 sd = dp - src;
    float ang = atan(sd.y, sd.x);
    float beams = pow(noise(float2(ang * 26.0, time * 0.12)), 2.2) * 0.65 + pow(noise(float2(ang * 61.0 + 7.0, time * 0.2)), 3.0) * 0.45;
    beams *= smoothstep(0.15, 0.45, ang / 1.5708) * smoothstep(1.0, 0.7, ang / 1.5708);
    beams *= exp(-length(sd) / (sizeDp.y * 1.1));

    // Fairy dust: tiny glints, mostly inside the beams.
    float2 gg = dp / 9.0 + float2(time * 0.15, -time * 0.25);
    float2 gid = floor(gg), gf = fract(gg) - 0.5;
    float gh = hash(gid + 2.0);
    float dust = step(0.9, gh) * smoothstep(0.12, 0.0, length(gf - (float2(hash(gid + 5.0), hash(gid + 9.0)) - 0.5) * 0.6))
        * pow(0.5 + 0.5 * sin(time * 3.0 + gh * 60.0), 4.0) * (0.25 + beams * 2.5);

    // Fireflies: two depths wandering about, each blinking on and off.
    float flies = 0.0;
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float cell = 90.0 - fi * 30.0;
        float2 g = dp / cell + float2(fi * 4.3, fi * 1.9);
        float2 id = floor(g), f = fract(g) - 0.5;
        float h = hash(id + fi * 13.0);
        float2 at = float2(sin(time * (0.35 + h * 0.3) + h * 20.0), cos(time * (0.3 + h * 0.25) + h * 9.0)) * 0.3;
        float r = length(f - at) * cell;
        float blink = smoothstep(0.55, 0.9, sin(time * (0.8 + h) + h * 40.0));
        flies += step(0.45, h) * blink * (smoothstep(2.6, 0.8, r) + exp(-r * 0.16) * 0.5) * (1.0 - fi * 0.3);
    }

    // Glowing spots where Scenes draws its toadstools, three on the left and two on the right.
    float shroomGlow = 0.0;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float left = fi < 2.5 ? 1.0 : 0.0;
        float x = left > 0.5 ? 20.0 + fi * 26.0 : sizeDp.x - 22.0 - (fi - 3.0) * 30.0;
        float h = 30.0 + hash1(fi * 5.1) * 26.0;
        float2 c = float2(x, sizeDp.y - 3.0 - h * 0.5);
        shroomGlow += exp(-length(dp - c + float2(0.0, h * 0.25)) / (h * 1.1)) * (0.8 + 0.2 * sin(time * 1.3 + fi * 2.0));
    }

    float leaves = canopy(dp, sizeDp);
    float3 light = float3(1.0, 0.88, 0.5) * beams * 0.75
        + float3(1.0, 0.95, 0.7) * dust
        + float3(0.75, 1.0, 0.3) * flies
        + float3(0.3, 0.95, 1.0) * shroomGlow * 0.55;

    float3 leafColour = mix(float3(0.03, 0.12, 0.04), float3(0.12, 0.3, 0.08), fbm(dp / 30.0)) + float3(0.25, 0.3, 0.05) * beams;
    float paintAmount = leaves * 0.92;
    float3 paint = leafColour;

    float4 s = readScreen(p, p);
    return blend(p, s.rgb, s.a, light,
        mix(float3(0.03, 0.14, 0.07), float3(0.02, 0.1, 0.08), uv.y), 0.35 + fbm(uv * 4.0 + time * 0.02) * 0.2 + uv.y * uv.y * 0.15,
        float3(1.0, 1.05, 0.85), 0.35,
        0.0, paint, paintAmount, 0.0, 0.5);
}
"""

/** Skin finish id -> AGSL source, built once on first use (main thread, modern renderer only). */
internal val FINISH_LOOKS: Map<String, String> by lazy {
	mapOf(
		"stylerank" to wrap(STYLE, 1f),
		"rhythm" to wrap(RHYTHM, 1f),
		"platformer" to wrap(PLATFORMER, 1f),
		"onfire" to wrap(FIRE, 1f),
		"shmup" to wrap(fromFilter(VHS), 1f),
		"comic" to wrap(COMIC, 1f),
		"terminal" to wrap(TERMINAL, 1f),
		"cosy" to wrap(FOREST, 0.15f),
		// Time circuits: the Flux filter (Filters.kt), electricity round the edges and the lightning.
		"timecircuits" to wrap(fromFilter(FLUX), 1f),
	)
}
