package com.bleelblep.scenes

/**
 * One GPU pass per frame: each atmosphere works with Discord's own pixels the way VFX's filters
 * do -- bending them (refraction, shimmer, lensing), grading them, and lighting them -- rather than
 * only laying a tint on top.
 *
 * Every scene sets the same few things, and one composite at the end applies them:
 * - `q`: where to read Discord's pixels from (the distortion);
 * - `wash` / `haze`: a colour the dark parts of the screen lean toward;
 * - `light`: coloured light added with a screen blend (glows, rays, particles);
 * - `grade`: a colour the whole picture is gently pushed toward;
 * - `flash`: a brief whole-screen brightening (lightning).
 * The composite adds a soft chromatic fringe and vignette at the edges. Light and haze lean on the
 * dark parts of the screen, so text and the message box stay readable at any strength.
 */
internal object Atmospheres {
	val ids = listOf("aurora", "nebula", "ocean", "rain", "embers", "forest", "halloween", "thanksgiving", "christmas")
	const val SOURCE = """
uniform shader img;
uniform float2 size;
uniform float density;
uniform float time;
uniform float strength;
uniform float scene;

// Sine-free hash (Dave Hoskins): sin() loses precision on big inputs, which showed as blocky squares.
float hash(float2 p) {
    float3 p3 = fract(float3(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, float3(p3.y, p3.z, p3.x) + 33.33);
    return fract((p3.x + p3.y) * p3.z);
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

// Twinkling stars on a grid: [scale] cells across the short side, [drift] moves them.
float stars(float2 uv, float aspect, float scale, float2 drift, float sharp) {
    float2 g = uv * float2(aspect, 1.0) * scale + drift;
    float2 id = floor(g), f = fract(g) - 0.5;
    float h = hash(id);
    float2 at = (float2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.7;
    float d = length(f - at);
    float twinkle = 0.55 + 0.45 * sin(time * (1.5 + h * 3.0) + h * 40.0);
    return step(0.86, h) * twinkle * (smoothstep(sharp, 0.0, d) + 0.35 * smoothstep(sharp * 3.0, 0.0, d));
}

// Soft glowing motes rising on a grid, flickering: embers, bubbles, fireflies, dust.
float motes(float2 uv, float aspect, float scale, float2 drift, float radius, float keep) {
    float2 g = uv * float2(aspect, 1.0) * scale + drift;
    float2 id = floor(g), f = fract(g) - 0.5;
    float h = hash(id);
    float2 at = float2(sin(time * 0.6 + h * 30.0), cos(time * 0.5 + h * 20.0)) * 0.22;
    float d = length(f - at);
    return step(keep, h) * (1.0 - smoothstep(0.0, radius, d)) * (0.55 + 0.45 * sin(time * 2.0 + h * 50.0));
}

float2 hash2(float2 p) { return float2(hash(p), hash(p + 17.3)); }

// Pool-floor caustics: the bright web along Voronoi cell edges, cells drifting with time.
float caustics(float2 p, float t) {
    float2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            float2 o = float2(float(x), float(y));
            float2 r = 0.5 + 0.5 * sin(t * 0.7 + 6.2831 * hash2(i + o));
            float d = length(o + r - f);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
        }
    }
    return pow(1.0 - smoothstep(0.0, 0.18, d2 - d1), 2.0);
}

// A bat silhouette in its own units (wingspan -1..1), wings flapping with [flap] 0..1.
float bat(float2 f, float flap) {
    float ax = abs(f.x);
    float wingY = -ax * (flap - 0.3) * 0.7 + sin(ax * 9.0) * 0.08 * ax;
    float wing = step(ax, 1.0) * smoothstep(0.1, 0.0, abs(f.y - wingY) - 0.2 * (1.0 - ax));
    float body = smoothstep(0.26, 0.2, length(f * float2(1.4, 0.9)));
    float ears = smoothstep(0.08, 0.04, length(float2(ax - 0.1, f.y + 0.25)));
    return clamp(max(max(wing, body), ears), 0.0, 1.0);
}

// A spider web in a top corner: threads from the corner and sagging rings, [su] from that corner.
float web(float2 su) {
    float r = length(su);
    float th = atan(su.y, su.x);
    float spokes = 1.0 - smoothstep(0.0, 0.0035, abs(sin(th * 7.0)) * r);
    float rings = 1.0 - smoothstep(0.0, 0.0025, abs(fract(r * 16.0 + sin(th * 7.0) * 0.08) - 0.5) / 16.0);
    return max(spokes, rings) * smoothstep(0.32, 0.22, r) * step(0.0, su.y);
}

// Distance from [p] to the segment a-b.
float segment(float2 p, float2 a, float2 b) {
    float2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// A spider silhouette in its own units: abdomen, head, and eight bent legs that twitch a little.
float spider(float2 f, float t) {
    float body = smoothstep(0.62, 0.52, length((f - float2(0.0, 0.35)) * float2(1.0, 0.85)));
    float head = smoothstep(0.36, 0.28, length(f + float2(0.0, 0.3)));
    float legs = 0.0;
    for (int j = 0; j < 4; j++) {
        float fj = float(j);
        float spread = -0.5 + fj * 0.38 + sin(t * 3.0 + fj) * 0.04;
        float2 knee = float2(0.9, -0.55 + fj * 0.42 + spread * 0.2);
        float2 tip = float2(1.35, 0.15 + fj * 0.35);
        float2 m = float2(abs(f.x), f.y);
        legs = max(legs, smoothstep(0.1, 0.0, min(segment(m, float2(0.0, fj * 0.12 - 0.1), knee), segment(m, knee, tip))));
    }
    return clamp(max(max(body, head), legs), 0.0, 1.0);
}

// A maple leaf: five pointed lobes and a stem, [soft] blurring the edge.
float maple(float2 rf, float soft) {
    float th = atan(rf.y, rf.x);
    // Five pointed lobes with deep notches (a triangle profile, not a rounded petal), the side lobes
    // smaller than the top three, and a fine serrated edge.
    float tri = abs(fract(th / 6.2831 * 5.0 + 0.25) * 2.0 - 1.0);
    float tip = pow(1.0 - tri, 1.6);
    float size = 0.8 + 0.2 * sin(th + 1.57);
    float lobes = (0.32 + 0.68 * tip) * size + 0.04 * sin(th * 30.0);
    float leaf = smoothstep(soft, 0.0, length(rf) - 0.17 * lobes);
    float stem = smoothstep(0.012, 0.0, abs(rf.x)) * step(rf.y, -0.05) * step(-0.22, rf.y);
    return max(leaf, stem);
}

half4 main(float2 p) {
    float2 uv = p / size;
    float aspect = size.x / size.y;
    float2 centered = uv * 2.0 - 1.0;
    float edge = clamp(dot(centered, centered) * 0.5, 0.0, 1.0);
    float px = density * strength;

    float2 q = p;
    float haze = 0.0;
    float3 wash = float3(0.0);
    float3 light = float3(0.0);
    float3 grade = float3(1.0);
    float gradeAmount = 0.0;
    float flash = 0.0;
    float vignette = 0.35;
    float rimDark = 0.0;
    float3 paint = float3(0.0);
    float paintAmount = 0.0;
    // At the Immersive strength every scene fills the screen with a slow field of its own colours,
    // the way the nebula does; Soft and Balanced leave it out.
    float immerse = smoothstep(0.75, 1.0, strength);
    float3 fieldLow = float3(0.0);
    float3 fieldHigh = float3(0.0);
    float fieldAmount = 0.0;

    if (scene < 0.5) {
        // Northern lights: smooth folding curtains, bright at the lower edge, rays fading upward,
        // green turning violet as they rise; a deep sky, two star layers, a shooting star.
        float sky = 1.0 - smoothstep(0.05, 0.8, uv.y);
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float x = uv.x * (1.2 + fi * 0.3) + fbm(float2(uv.y * 2.0, time * 0.05 + fi * 3.0)) * 0.35;
            float edgeY = 0.16 + fi * 0.08 + (fbm(float2(x * 1.6 + fi * 5.0, time * 0.03)) - 0.5) * 0.25;
            float d = edgeY - uv.y;
            float lower = smoothstep(0.012, 0.0, -d);
            float rise = exp(-max(d, 0.0) * (5.0 + fi * 2.0)) * lower;
            float rays = 0.55 + 0.45 * fbm(float2(x * 22.0, time * 0.25 + fi));
            float fold = 0.6 + 0.4 * sin(x * 9.0 + fbm(float2(x * 3.0, time * 0.1)) * 6.0 + time * 0.2);
            float3 colour = mix(float3(0.15, 1.0, 0.55), float3(0.75, 0.25, 1.0), clamp(max(d, 0.0) * 6.0, 0.0, 1.0));
            light += colour * rise * rays * fold * (0.95 - fi * 0.25);
        }
        float shoot = fract(time * 0.13);
        float2 sp = float2(1.2 - shoot * 1.6, 0.08 + 0.15 * hash(float2(floor(time * 0.13), 1.0)));
        float2 sd = (uv - sp) * float2(aspect, 1.0);
        float streak = smoothstep(0.004, 0.0, abs(sd.y + sd.x * 0.25)) * smoothstep(0.18, 0.0, abs(sd.x - 0.09)) * step(0.6, hash(float2(floor(time * 0.13), 4.0)));
        light += float3(0.9, 0.95, 1.0) * (stars(uv, aspect, 70.0, float2(0.0), 0.06) + stars(uv, aspect, 35.0, float2(time * 0.01, 0.0), 0.05) + streak) * sky;
        wash = mix(float3(0.0, 0.14, 0.12), float3(0.1, 0.02, 0.2), uv.x);
        haze = 0.45 * sky + 0.12;
        grade = float3(0.85, 1.0, 1.05);
        gradeAmount = 0.3;
        fieldLow = float3(0.0, 0.25, 0.2);
        fieldHigh = float3(0.45, 0.15, 0.8);
        fieldAmount = 0.6;
    } else if (scene < 1.5) {
        // Deep space: domain-warped nebula with bright cores and dust lanes, three parallax star
        // layers, a slow gravitational-lens wobble.
        float2 lens = float2(0.5 + 0.25 * sin(time * 0.05), 0.4 + 0.2 * cos(time * 0.04));
        float2 toLens = (uv - lens) * float2(aspect, 1.0);
        float pull = 0.015 / (dot(toLens, toLens) + 0.02);
        q -= toLens / max(length(toLens), 0.001) * pull * 6.0 * px;
        float2 w = uv * float2(aspect, 1.0) * 2.0 + float2(time * 0.015, -time * 0.01);
        // Measured (tools/preview_scenes.py era): this warped fbm lands between about 0.30 and 0.76; stretch it to 0..1.
        float warp = clamp((fbm(w + fbm(w * 1.7 + time * 0.03) * 1.8) - 0.3) / 0.45, 0.0, 1.0);
        float lanes = smoothstep(0.42, 0.62, fbm(w * 3.0 - 5.0));
        float cloud = smoothstep(0.3, 0.75, warp);
        float3 colour = mix(mix(float3(0.45, 0.1, 0.75), float3(0.05, 0.45, 1.0), warp), float3(1.0, 0.4, 0.65), smoothstep(0.6, 0.95, warp));
        float cores = pow(smoothstep(0.7, 1.0, warp), 2.0);
        light += colour * (cloud * 1.5 + cores * 1.1) * (1.0 - lanes * 0.6);
        light += float3(0.85, 0.9, 1.0) * (
            stars(uv, aspect, 90.0, float2(time * 0.004, 0.0), 0.05) * 0.7 +
            stars(uv, aspect, 45.0, float2(time * 0.012, 0.0), 0.05) * 1.1 +
            stars(uv, aspect, 20.0, float2(time * 0.03, 0.0), 0.04) * 1.5);
        wash = mix(float3(0.005, 0.0, 0.02), colour * 0.55, cloud);
        haze = 0.7;
        grade = float3(0.95, 0.9, 1.1);
        gradeAmount = 0.3;
        vignette = 0.55;
    } else if (scene < 2.5) {
        // Underwater: the screen refracts, cellular (Voronoi) caustics in two moving layers with a
        // slight colour split, light shafts from above, depth, rising bubbles.
        float2 r = float2(fbm(uv * 4.0 + float2(time * 0.2, 0.0)), fbm(uv * 4.0 + float2(0.0, time * 0.22) + 7.0)) - 0.5;
        q += r * 8.0 * px;
        float2 cp = uv * float2(aspect, 1.0) * 5.0 + r * 0.6;
        float3 caustic = float3(caustics(cp - 0.01, time), caustics(cp, time), caustics(cp + 0.01, time)) * 0.55
            + caustics(cp * 1.9 + 4.0, time * 1.3) * 0.25;
        float shafts = pow(noise(float2(uv.x * 6.0 + uv.y * 2.0 - time * 0.1, time * 0.15)), 3.0) * (1.0 - uv.y);
        float bubbles = 0.0;
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float2 g = uv * float2(aspect, 1.0) * (10.0 + fi * 8.0) + float2(sin(uv.y * 10.0 + time + fi) * 0.15, time * (0.35 + fi * 0.2));
            float2 id = floor(g), f = fract(g) - 0.5;
            float d = length(f);
            float ring = smoothstep(0.03, 0.0, abs(d - 0.13)) + smoothstep(0.05, 0.0, length(f - float2(-0.05, -0.06))) * 0.8;
            bubbles += ring * step(0.82, hash(id + fi * 9.0)) * (0.7 - fi * 0.3);
        }
        light += float3(0.35, 0.95, 1.0) * caustic * (1.0 - uv.y * 0.55) + float3(0.4, 0.9, 1.0) * shafts * 0.6 + float3(0.85, 1.0, 1.0) * bubbles * 0.6;
        wash = mix(float3(0.0, 0.28, 0.32), float3(0.0, 0.06, 0.2), uv.y);
        haze = 0.5 + uv.y * 0.3;
        grade = float3(0.7, 1.0, 1.1);
        gradeAmount = 0.4;
        vignette = 0.45;
        fieldLow = float3(0.0, 0.08, 0.3);
        fieldHigh = float3(0.0, 0.6, 0.65);
        fieldAmount = 0.6;
    } else if (scene < 3.5) {
        // Midnight rain: drops on the glass act as little lenses (a flipped, magnified view, a
        // highlight and a dark rim), thin streaks in two layers, mist, the odd lightning flash.
        float2 g = uv * float2(aspect, 1.0) * 10.0 + float2(0.0, time * 0.03);
        float2 id = floor(g), f = fract(g) - 0.5;
        float h = hash(id);
        float2 at = (float2(hash(id + 2.0), hash(id + 5.0)) - 0.5) * 0.45 + float2(0.0, fract(time * 0.04 + h) * 0.25 - 0.12);
        float2 rel = (f - at) * float2(1.0, 0.85);
        float radius = 0.09 + h * 0.07;
        float inside = smoothstep(radius, radius * 0.8, length(rel)) * step(0.45, h);
        // A lens: read from the opposite side, magnified.
        q -= rel * inside * (size.y / 10.0) * 1.8;
        float rim = smoothstep(radius * 0.7, radius, length(rel)) * inside;
        float glint = smoothstep(radius * 0.35, 0.0, length(rel - float2(-radius * 0.35, -radius * 0.4))) * inside;
        float streaks = 0.0;
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float2 s2 = float2(uv.x + uv.y * 0.1, uv.y) * float2(70.0 + fi * 60.0, 6.0 + fi * 4.0) - float2(0.0, time * (1.6 + fi * 1.1));
            float2 sid = floor(s2), sf = fract(s2);
            float sh = hash(sid + fi * 11.0);
            streaks += (1.0 - smoothstep(0.0, 0.06, abs(sf.x - sh))) * smoothstep(0.0, 0.8, sf.y) * step(0.4, sh) * (0.8 - fi * 0.25);
        }
        float mist = fbm(uv * float2(3.0, 5.0) + float2(time * 0.06, 0.0));
        float bolt = floor(time / 7.0);
        float strike = step(0.55, hash(float2(bolt, 3.0)));
        float tt = fract(time / 7.0) * 7.0;
        flash = strike * (smoothstep(0.0, 0.03, tt) * smoothstep(0.35, 0.05, tt) + 0.6 * smoothstep(0.4, 0.43, tt) * smoothstep(0.7, 0.45, tt));
        light += float3(0.6, 0.78, 1.0) * (streaks * 1.3 + glint * 1.4 + inside * 0.12 + mist * mist * 0.45 * uv.y);
        rimDark = rim * 0.75;
        wash = float3(0.05, 0.1, 0.18);
        haze = 0.45 + mist * 0.4;
        grade = float3(0.78, 0.9, 1.08);
        gradeAmount = 0.45;
        fieldLow = float3(0.04, 0.07, 0.15);
        fieldHigh = float3(0.35, 0.45, 0.6);
        fieldAmount = 0.5;
    } else if (scene < 4.5) {
        // Ember glow: heat shimmer rising from below, glowing embers with halos in two layers, a
        // warm glow and smoke from the bottom.
        float heat = smoothstep(0.35, 1.0, uv.y);
        q.x += sin(uv.y * 45.0 - time * 5.0 + noise(uv * 8.0) * 3.0) * 2.5 * px * heat;
        q.y += cos(uv.x * 30.0 + time * 4.0) * 1.2 * px * heat;
        float embers = 0.0;
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float2 drift = float2(sin(uv.y * 6.0 + time + fi) * 0.4, time * (0.35 + fi * 0.25));
            float2 eu = uv * float2(1.0, 0.6);
            embers += motes(eu, aspect, 14.0 + fi * 12.0, drift, 0.08 - fi * 0.02, 0.72) * 1.4;
            embers += motes(eu, aspect, 14.0 + fi * 12.0, drift, 0.3 - fi * 0.08, 0.72) * 0.35;
        }
        float smoke = fbm(uv * float2(3.0, 2.0) + float2(0.0, time * 0.08));
        light += float3(1.0, 0.45, 0.08) * (embers + pow(uv.y, 2.2) * (0.45 + smoke * 0.4));
        wash = mix(float3(0.07, 0.03, 0.03), float3(0.4, 0.12, 0.02), uv.y);
        haze = 0.3 + uv.y * uv.y * 0.5 + smoke * 0.12;
        grade = float3(1.15, 0.95, 0.78);
        gradeAmount = 0.4;
        fieldLow = float3(0.25, 0.03, 0.0);
        fieldHigh = float3(1.0, 0.45, 0.08);
        fieldAmount = 0.65;
    } else if (scene < 5.5) {
        // Enchanted light: broad soft light shafts with glittering dust, wandering fireflies with
        // glowing halos, green haze.
        float diag = uv.x * 0.85 + uv.y * 0.35;
        float band = fbm(float2(diag * 5.0 + time * 0.03, time * 0.05));
        float shaft = smoothstep(0.5, 0.75, band) * (1.0 - uv.y * 0.7);
        float dust = motes(uv, aspect, 45.0, float2(time * 0.03, -time * 0.02), 0.06, 0.6) * shaft * 3.0;
        float flies = 0.0;
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float2 drift = float2(sin(time * 0.3 + fi) * 0.3, cos(time * 0.25 + fi * 2.0) * 0.3) + fi * 3.7;
            flies += motes(uv, aspect, 7.0 + fi * 5.0, drift, 0.12, 0.78) * 1.2;
            flies += motes(uv, aspect, 7.0 + fi * 5.0, drift, 0.45, 0.78) * 0.3;
        }
        light += float3(1.0, 0.85, 0.45) * (shaft * 0.6 + dust * 0.6) + float3(0.75, 1.0, 0.35) * flies;
        wash = float3(0.03, 0.14, 0.05);
        haze = 0.35 + fbm(uv * 4.0 + time * 0.02) * 0.25;
        grade = float3(1.0, 1.05, 0.85);
        gradeAmount = 0.35;
        fieldLow = float3(0.02, 0.18, 0.06);
        fieldHigh = float3(0.85, 0.8, 0.3);
        fieldAmount = 0.55;
    } else if (scene < 6.5) {
        // Halloween night: rolling violet and green fog banks, a moon glowing through the fog with
        // bats circling it, ghost wisps drifting across, spider webs in the top corners, and a
        // flickering pumpkin glow from below.
        q += float2(sin(uv.y * 7.0 + time * 0.6), cos(uv.x * 5.0 - time * 0.5)) * 1.2 * px;
        float2 su = uv * float2(aspect, 1.0);
        float2 moonAt = float2(0.68, 0.13) * float2(aspect, 1.0);
        float2 md = su - moonAt;
        float veil = fbm(uv * float2(2.5, 3.0) + float2(time * 0.04, 0.0));
        float moon = smoothstep(0.06, 0.054, length(md));
        float craters = fbm(md * 35.0 + 3.0);
        float halo = exp(-length(md) * 7.0);
        light += float3(1.0, 0.75, 0.4) * (moon * (0.75 + craters * 0.35) * (1.0 - veil * 0.45) + halo * 0.55);

        // Bats circling the moon at different distances and speeds.
        float bats = 0.0;
        for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float ang = time * (0.45 + fi * 0.11) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0) + fi * 1.9;
            float rad = 0.09 + fi * 0.035;
            float2 bp = su - (moonAt + float2(cos(ang), sin(ang) * 0.55) * rad);
            float scale = 0.03 + fi * 0.004;
            bats = max(bats, bat(bp / scale, 0.5 + 0.5 * sin(time * 16.0 + fi * 3.0)));
        }
        rimDark = bats * 0.9;

        // Ghost wisps: a soft head and a waving tail, drifting across.
        float wisps = 0.0;
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float2 at = float2(fract(time * 0.025 * (1.0 + fi * 0.35) + fi * 0.37) * 1.5 - 0.25, 0.32 + fi * 0.2 + sin(time * 0.5 + fi) * 0.03);
            float2 d = (uv - at) * float2(aspect, 1.0);
            float head = exp(-length(d * float2(1.0, 1.3)) * 30.0);
            float along = clamp(-d.x / 0.2, 0.0, 1.0);
            float tail = exp(-abs(d.y + sin(d.x * 30.0 - time * 4.0) * 0.012) * 70.0) * step(d.x, 0.0) * (1.0 - along) * step(-0.2, d.x);
            wisps += head + tail * 0.55;
        }
        light += float3(0.8, 0.95, 1.0) * wisps * 0.75;

        // Spider webs in both top corners.
        float webs = web(su) + web(float2(aspect - su.x, su.y));
        light += float3(0.75, 0.75, 0.8) * webs * 0.6;
        float spiders = 0.0;
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float x = fi < 0.5 ? 0.13 * aspect : aspect - 0.13 * aspect;
            float hang = 0.17 + fi * 0.06 + 0.05 * sin(time * (0.6 + fi * 0.25) + fi * 2.0);
            float silk = smoothstep(0.0018, 0.0, abs(su.x - x)) * step(su.y, hang);
            light += float3(0.75, 0.75, 0.8) * silk * 0.5;
            spiders = max(spiders, spider((su - float2(x, hang + 0.012)) / 0.022, time + fi * 3.0));
        }
        rimDark = max(rimDark, spiders * 0.95);

        // Fog banks, heaviest low down, and the pumpkin glow.
        float fog = fbm(float2(uv.x * 2.5 + time * 0.05, uv.y * 3.0 - time * 0.02));
        float fogMask = 0.25 + 0.75 * smoothstep(0.3, 1.0, uv.y);
        float flicker = 0.7 + 0.3 * sin(time * 9.0) * sin(time * 13.7 + 1.0);
        light += mix(float3(0.5, 0.12, 0.8), float3(0.15, 0.85, 0.35), fbm(uv * 2.0 + time * 0.04)) * smoothstep(0.35, 0.8, fog) * fogMask * 0.65
            + float3(1.0, 0.42, 0.05) * pow(uv.y, 3.0) * 0.55 * flicker;
        wash = mix(float3(0.07, 0.0, 0.12), float3(0.12, 0.04, 0.0), uv.y);
        haze = 0.55;
        grade = float3(1.05, 0.85, 1.12);
        gradeAmount = 0.4;
        vignette = 0.65;
        fieldLow = float3(0.15, 0.0, 0.25);
        fieldHigh = float3(0.2, 0.75, 0.35);
        fieldAmount = 0.7;
    } else if (scene < 7.5) {
        // Thanksgiving: maple leaves in three depths (near ones bigger, softer and slower), wind
        // gusts, sun rays from the top corner, a sunset gradient and warm bokeh.
        float gust = smoothstep(0.55, 1.0, sin(time * 0.35)) * 0.8;
        float leaves = 0.0;
        float3 leafColour = float3(0.0);
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float scale = 9.0 - fi * 2.5;
            float2 g = uv * float2(aspect, 1.0) * scale
                + float2(sin(time * 0.4 + uv.y * 3.0 + fi) * 0.35 - time * gust * (0.6 + fi * 0.3), -time * (0.45 - fi * 0.08));
            float2 id = floor(g), f = fract(g) - 0.5;
            float h = hash(id + fi * 13.0);
            float ang = time * (0.8 + h * 1.6) * (h < 0.8 ? 1.0 : -1.0) + h * 6.2831;
            float2 rf = float2(f.x * cos(ang) - f.y * sin(ang), f.x * sin(ang) + f.y * cos(ang));
            float soft = 0.012 + fi * 0.01;
            float shape = maple(rf, soft);
            float th = atan(rf.y, rf.x);
            float veins = smoothstep(0.02, 0.0, abs(sin(th * 2.5 + 1.57)) * length(rf)) * shape;
            float keep = step(0.5 + fi * 0.08, h);
            float3 c = h < 0.68 ? float3(0.85, 0.18, 0.06) : (h < 0.8 ? float3(0.95, 0.48, 0.08) : (h < 0.92 ? float3(0.98, 0.75, 0.18) : float3(0.55, 0.28, 0.1)));
            float amt = shape * keep;
            leafColour = mix(leafColour, c * (1.0 - veins * 0.35), amt);
            leaves = max(leaves, amt);
        }
        paint = leafColour;
        paintAmount = leaves * 0.95;
        // Sun rays from the top-left corner.
        float2 sd = (uv - float2(0.05, 0.02)) * float2(aspect, 1.0);
        float rays = pow(noise(float2(atan(sd.y, sd.x) * 14.0, time * 0.12)), 3.0) * exp(-length(sd) * 1.4);
        float bokeh = motes(uv, aspect, 6.0, float2(time * 0.02, time * 0.015), 0.22, 0.8) * 0.5;
        light += float3(1.0, 0.68, 0.25) * (exp(-length(sd) * 3.0) * 0.8 + rays * 0.7 + bokeh);
        wash = mix(float3(0.3, 0.13, 0.03), float3(0.18, 0.04, 0.02), uv.y);
        haze = 0.45;
        grade = float3(1.15, 0.98, 0.78);
        gradeAmount = 0.45;
        fieldLow = float3(0.3, 0.06, 0.02);
        fieldHigh = float3(1.0, 0.65, 0.2);
        fieldAmount = 0.55;
    } else {
        // Christmas: snow in three depths, a drift building along the bottom, twinkling string
        // lights sagging across the top, cold blue grade with warm lights.
        float snow = 0.0;
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float2 drift = float2(sin(time * 0.5 + uv.y * 4.0 + fi * 2.0) * 0.3, -time * (0.25 + fi * 0.2));
            snow += motes(uv, aspect, 9.0 + fi * 10.0, drift, 0.09 - fi * 0.02, 0.45) * (1.0 - fi * 0.2);
        }
        float drift = 0.93 + (fbm(float2(uv.x * 6.0, 1.0)) - 0.5) * 0.05;
        float bank = smoothstep(drift, drift + 0.01, uv.y);
        paint = float3(0.93, 0.96, 1.0) * (0.9 + fbm(uv * 30.0) * 0.1);
        paintAmount = bank * 0.92;
        // String lights: bulbs along a sagging wire at the top.
        float wireX = uv.x * aspect * 22.0;
        float wireY = 0.045 + 0.018 * (1.0 - pow(fract(wireX / 5.0) * 2.0 - 1.0, 2.0));
        float bulbId = floor(wireX);
        float2 bd = float2((fract(wireX) - 0.5) / (aspect * 22.0) * aspect, uv.y - wireY - 0.012);
        float bulb = smoothstep(0.009, 0.005, length(bd));
        float glowB = exp(-length(bd) * 55.0);
        float twinkle = step(0.25, fract(time * 0.7 + hash(float2(bulbId, 2.0))));
        float k = mod(bulbId, 3.0);
        float3 bulbColour = k < 0.5 ? float3(1.0, 0.15, 0.15) : (k < 1.5 ? float3(0.2, 1.0, 0.35) : float3(1.0, 0.8, 0.25));
        float wire = smoothstep(0.0025, 0.0, abs(uv.y - wireY));
        rimDark = wire * 0.6;
        float bokeh = motes(uv, aspect, 5.0, float2(time * 0.01, time * 0.008), 0.25, 0.72);
        float3 bokehColour = mix(float3(1.0, 0.25, 0.25), float3(1.0, 0.82, 0.35), hash(floor(uv * float2(aspect, 1.0) * 5.0 + float2(time * 0.01, time * 0.008))));
        light += float3(0.92, 0.97, 1.0) * snow * 1.6 + bulbColour * (bulb * 1.2 + glowB * 0.9) * twinkle + bokehColour * bokeh * 0.35 * (0.3 + immerse);
        wash = float3(0.03, 0.06, 0.14);
        haze = 0.45;
        grade = float3(0.88, 0.95, 1.1);
        gradeAmount = 0.35;
        fieldLow = float3(0.02, 0.05, 0.2);
        fieldHigh = float3(0.45, 0.65, 0.95);
        fieldAmount = 0.45;
    }

    if (immerse > 0.0 && fieldAmount > 0.0) {
        float2 fw = uv * float2(aspect, 1.0) * 2.0 + float2(time * 0.015, -time * 0.01) + scene * 7.3;
        float fv = clamp((fbm(fw + fbm(fw * 1.7 + time * 0.03) * 1.8) - 0.3) / 0.45, 0.0, 1.0);
        float3 fc = mix(fieldLow, fieldHigh, fv);
        light += fc * smoothstep(0.3, 0.8, fv) * fieldAmount * immerse;
        wash = mix(wash, mix(fieldLow * 0.3, fc * 0.55, smoothstep(0.3, 0.8, fv)), immerse * 0.8);
        haze = mix(haze, 0.7, immerse);
    }

    // Composite: read Discord through the distortion, with a soft chromatic fringe at the edges.
    float2 fringe = centered * edge * 2.5 * px;
    half4 c = img.eval(q);
    float a = float(c.a);
    float3 rgb = float3(float(img.eval(q + fringe).r), float(c.g), float(img.eval(q - fringe).b));
    float lum = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    // Lean on the dark parts of the screen so text stays readable.
    float shadows = 1.0 - smoothstep(0.3, 0.92, lum);
    rgb = mix(rgb, rgb * grade, gradeAmount * strength);
    rgb = mix(rgb, mix(rgb, wash, 0.85), haze * strength * shadows);
    rgb = screenBlend(rgb, light * strength * (0.3 + 0.7 * shadows) * a);
    rgb *= 1.0 - rimDark * strength;
    rgb = mix(rgb, paint * a, clamp(paintAmount * (0.4 + 0.6 * strength), 0.0, 1.0));
    rgb += flash * 0.35 * strength * a;
    rgb *= 1.0 - edge * vignette * strength;
    return half4(half3(clamp(rgb, 0.0, a)), c.a);
}
"""
}
