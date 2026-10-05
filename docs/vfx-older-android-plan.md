# VFX support for Android 12 and earlier

Date: 2026-10-05  
Status: Proposed; implementation has not started.

## Goal

Provide useful versions of VFX effects on Android 12 and earlier, reusing existing shader math and effect parameters where practical. Automatically show effects supported by the device and choose the best available renderer.

Use two compatibility tiers: Android 13+ and Android 12 and below. Build the fallback against Android 11 (API 30) capabilities and validate earlier supported versions against the plugin's minimum SDK. Android 11 is the fallback development baseline, not a new minimum installation requirement.

Full visual parity is not required for the initial implementation. Distinguish effects drawn over Discord from effects that sample and distort Discord's pixels.

## Current implementation

The `plugins/screen-effects` implementation primarily uses an Android 13+ `supported` flag. `Filters.kt`, `Ripple.kt`, `Lens.kt`, and `Finger.kt` depend on `RuntimeShader`.

Relevant integration points:

- Native capability reporting: `src/main/kotlin/com/bleelblep/screeneffects/ScreenEffects.kt`
- Effect composition: `Compositor.kt` and `SharedLayers.kt`
- Filter implementations: `Filters.kt`
- JS native state: `js/native.ts`
- Picker definitions: `js/ui/options.ts`
- Settings: `js/ui/pages/Effect.tsx`, `Filter.tsx`, `Settings.tsx`, and `Test.tsx`

Paths above are relative to `plugins/screen-effects` unless otherwise noted.

## Rendering tiers

| Android | Proposed renderer | Coverage |
| --- | --- | --- |
| Android 13+, API 33+ | Existing AGSL RuntimeShader pipeline | Full filters and distortions |
| Android 12 and below, API 32 and below within the supported minimum SDK | Shared fallback built for Android 11/API 30: hardware-accelerated Canvas overlays and view transforms | Scanlines, grain, vignettes, rings, particles, shake, and simpler effects |

Android 12 uses the same fallback as Android 11 and earlier. The fallback must not depend on RenderEffect (API 31) or RuntimeShader (API 33); there is no separate Android 12 enhancement tier.

OpenGL ES is a possible later renderer for older devices, contingent on a viable content-capture pipeline.

## Effect feasibility

| Effect | Initial older-Android version | Limitations |
| --- | --- | --- |
| CRT | Scanlines, vignette, rounded-screen mask | Actual curvature requires content sampling |
| Old film | Animated scratches, dust, grain, flicker; faded colors where supported | Exact color response may differ |
| Night vision | Green tint, grain, eyepiece overlay; monochrome treatment only if a compatible content-coloring path is verified | An overlay alone cannot convert the underlying UI to monochrome; nonlinear brightness response is approximate |
| Vaporwave | Color washes and scanlines | Actual luminance-based recoloring requires access to content; exact three-tone mapping needs custom GPU processing |
| Shockwave | Animated bright ring, glow, optional shake | No local screen bending in the overlay version |
| Ink | Expanding shapes and gradients | Refraction and sampling the underlying color require more work |
| Dreamy | Drifting clouds, pastel washes, sparkles | Whirlpools and true bloom require access to content pixels |
| VHS | Noise, tracking bands, flicker | Per-line displacement and RGB separation require custom GPU processing |

Reuse timing, easing, noise functions, colors, touch coordinates, and effect parameters. Implement alternate renderers rather than attempting to execute AGSL on unsupported Android versions.

### Difficult effects

These require sampling and redrawing the underlying UI:

- Ripple that bends chat content.
- Magnifying lens.
- Pixelation.
- Jelly dragging.
- Black-hole distortion.
- Frost that clears precisely under the finger.

An overlay alone cannot reproduce those transformations.

## OpenGL ES feasibility

Port the shader calculations from AGSL to GLSL, replacing pixel-coordinate child-shader sampling with normalized texture sampling:

```text
AGSL: img.eval(pixelPosition)
GLSL: texture(inputTexture, normalizedCoordinates)
```

Adapt shader types, uniforms, coordinate orientation, alpha handling, and color behavior for the selected GLSL version.

The main challenge is obtaining `inputTexture`. RuntimeShader receives rendered View content from Android; an OpenGL overlay does not. A TextureView provides a rendering surface, not automatic access to content behind it.

The capture-and-display pipeline must:

- Capture the correct Discord window.
- Exclude the effect overlay to prevent visual feedback.
- Handle scrolling, keyboard changes, and separate dialog windows.
- Account for video and other separately rendered surfaces.
- Avoid excessive bitmap allocation, CPU readback, and GPU uploads.
- Preserve touch routing and acceptable latency.

Prototype this separately before committing to full visual parity on older devices.

## Capability reporting and dynamic UI

Replace the all-or-nothing flag with native per-effect capabilities. Example schema:

```ts
{
  apiLevel: 30,
  tier: "fallback",
  hardwareAccelerated: true,
  effects: {
    shockwave: { available: true, renderer: "canvas", quality: "approximate" },
    crt: { available: true, renderer: "canvas", quality: "approximate" },
    lens: { available: false, reason: "No supported content renderer" }
  }
}
```

Determine availability using:

1. Android API level.
2. Hardware acceleration on the target window.
3. Successful renderer initialization.
4. Shader compilation where applicable.
5. Effect-specific requirements.

Use the existing `brokenStyles` mechanism as a starting point for reporting renderer failures.

### UI behavior

- Show available effects automatically.
- Select the best supported renderer under the same effect ID.
- Describe fallback differences accurately: for example, “Scanlines and vignette” rather than promising curvature.
- Hide unavailable choices from the main picker.
- Optionally offer an Unavailable effects section with explanations.
- Preserve saved preferences when a renderer is unavailable.
- Apply capability checks to quick toggles, message triggers, and test buttons as well as settings.
- Enforce availability natively so saved settings or triggers cannot bypass the picker checks.

## Implementation phases

### Phase 1: Capability system

- Introduce a renderer interface and per-effect availability.
- Separate API 33 shader classes from older-compatible code.
- Audit Compositor and SharedLayers: RenderEffect itself requires API 31.
- Keep RenderEffect-typed fields, method signatures, and initialization inside the modern implementation. The fallback needs its own overlay/transform composition path that loads on API 30 and earlier.
- Filter settings and trigger options using native capabilities.
- Keep cleanup and effect ownership consistent across renderers.

### Phase 2: Lightweight fallback pack

Start with CRT overlay, old film, night vision approximation, shockwave, and ink overlay. These offer strong visible improvements at moderate complexity.

### Phase 3: Fallback compatibility and performance

Validate the shared fallback on Android 11 first, then Android 12 and earlier supported API levels. Check window changes, keyboard visibility, touch routing, cleanup, and composition with other plugins. Measure frame time, allocations, and battery impact on lower-end hardware. Hide individual effects whose required capabilities fail; do not assume every pre-13 device has identical GPU support.

### Phase 4: Optional OpenGL prototype

Prototype one short-lived ripple using captured content. Measure capture latency, frame rate, memory use, and scrolling behavior before extending it to persistent filters or interactive lenses.

## Difficulty and recommendation

| Work | Estimated complexity |
| --- | --- |
| Capability detection and dynamic UI | Low to medium |
| Useful Canvas fallback collection | Medium |
| Shared fallback compatibility and performance validation | Medium |
| Full screen-distorting parity through OpenGL | High; a new rendering subsystem |

Recommended approach: deliver convincing lightweight versions first, make availability automatic, and reserve pixel-distortion support for devices where a tested capture/rendering pipeline performs well.
