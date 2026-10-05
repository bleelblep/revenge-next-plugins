# Scenes

Standalone, offline runtime-shader atmospheres for Discord. No AI service,
generated recipes, credentials, or network requests. Android 13+ is required.

## Built-in atmospheres

- **Northern lights:** moving green/violet aurora curtains and stars.
- **Deep space:** drifting nebula clouds and twinkling stars.
- **Underwater:** caustic lighting, gentle refraction and rising bubbles.
- **Midnight rain:** mist and luminous diagonal rain streaks.
- **Ember glow:** amber haze and rising embers.
- **Enchanted light:** golden shafts, green haze and fireflies.

Tap an atmosphere to enable playback across Discord. Stop atmosphere disables it.
Strength and speed have three presets each. Reduced motion freezes the shader and
stops continuous frame updates. 30/60/90 FPS are display-synced targets, bounded by
the active screen refresh rate. Diagnostics count effect updates, not presented GPU frames.

The shader uses the VFX shared layer registry (`bleelblep.renderLayers.v1`) under
`16-scenes`. Removing Scenes preserves other plugins' layers. Playback pauses on
focus loss, and window discovery handles dialogs and rotation. All atmosphere
particles are procedural GPU effects; no touch-catching overlay or bitmap capture.

## Build and test

```powershell
node --test plugins/scenes/tests/state.test.mjs
node node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js build scenes
.\gradlew.bat packageScenes -x buildJs --console=plain
```

`tests/ScenesShaderSmoke.java` compiles and binds the actual shipping AGSL source
on Android through `app_process`. Visual composition, display frame pacing,
background/resume and coexistence with VFX should also be checked in Discord.
