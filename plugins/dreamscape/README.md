# Dreamscape

One installable plugin, independent feature controllers. Current release: 0.2.0.

## Playback and motion

- Choose 30, 60 or 90 FPS in Features. New installs default to 60; existing frame
  preferences are preserved. Choreographer schedules against display frames; targets
  above the active display refresh rate cannot increase the physical refresh rate.
- Tap a scene for a 12-second preview, automatically enabling Dreamscape. Choose
  **Play everywhere** to keep it visible, or **Channel-only** for assigned channels.
- Android 13+ uses live-image AGSL atmospheres (nebula, underwater caustics, storm
  clouds and warm light shafts), plus procedural foil and chromatic glass refraction.
- Diagnostics show the active renderer, scene, target/update FPS, display Hz and
  shader errors. Measured FPS counts scheduled effect updates, not GPU presentation.

## Implementation plan and module boundaries

1. Shared overlay host: root discovery, foreground lifecycle, tilt, touch ownership,
   capped frame scheduling and surface tracking.
2. Glass: a movable demo lens and detected composer rim; backdrop sampled separately
   from the effect. Foreground text stays outside the composer rim's mask.
3. Hologram: tilt-reactive foil over detected avatar images plus a demo card.
4. Tear: edge handle, drag width, spring closure, procedurally drawn scene.
5. Spells: explicit gesture canvas with circle, zigzag and V recognition, and buttons.
6. Dreams: versioned local scene library, channel assignments, optional AI recipes.
7. Validate schemas/recognition, bundle JS, compile native, package and verify HTTP.

`js/features` owns feature metadata. `js/core` owns storage, channel routing and AI.
Native `features` implement the small `Feature` drawing contract; `core` provides
only host services. Controllers never import other feature controllers. The host
routes spell actions to controllers, so modules can later move to separate plugins.

Particles and interactive surfaces draw into this plugin's own child view. Scene
shaders use VFX's shared `bleelblep.renderLayers.v1` registry under `15-dreamscape`,
preserving other plugins' layers when applying or clearing the atmosphere.
No SYSTEM_ALERT_WINDOW permission.
All effects and cached backdrop pixels are local to Discord. AI receives only the
scene description the user enters, never chat messages. No generated code executes.

Glass backdrop capture uses a downscaled, rate-limited draw of the root while the
Dreamscape layer skips rendering. Some hardware-backed views cannot be captured by
software Canvas; diagnostics report capture failure and the glass keeps its rim.
Composer detection uses native EditText, avatar detection uses image accessibility
labels. Discord builds that expose neither still support the explicit demo surfaces.
Avatar scans are bounded and periodically refreshed to handle recycled views.

Android 13+ enables AGSL refraction. Older Android retains foil, particles, tears,
gestures and a glass tint fallback. Presets and saved AI scenes work offline.
The first release's atmospheres are visual; audio is reserved for a later module.

## Build

From the repository root:

    node node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js build dreamscape
    .\gradlew.bat packageDreamscape -x buildJs --console=plain

Device checks: glass backdrop accuracy, readable composer text, recycled avatars,
keyboard and rotation, tear ownership vs scrolling, VFX coexistence, background
sensor shutdown, disable/re-enable cleanup and frame budget on the target phone.
