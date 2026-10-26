# Third-party code

VFX is CC0-1.0, like the rest of this repository, with one exception:

- `src/main/kotlin/com/bleelblep/screeneffects/Ripple.kt` is a close port of Telegram for Android's
  `SuperRipple.java` and its shader `superripple_effect.agsl`
  ([DrKLO/Telegram](https://github.com/DrKLO/Telegram)), licensed GPL-2.0-or-later. That file
  carries the same licence; see its header and `THIRD_PARTY_LICENSES/GPL-2.0.txt`.

Everything else is original work and CC0-1.0: the Shockwave, Swirl, Glitch and Pixel burst shaders
in `Styles.kt` (they run through `Ripple.kt`'s animation loop but contain no Telegram code), the
Lens in `Lens.kt`, the legacy OpenGL ports of all of these in `LegacyCapture.kt`, the particles and charge ring in `Particles.kt`, the screen filters in `Filters.kt`,
and power mode and message effects in `Extras.kt`. `js/lib/commands.ts` is copied from Catch Up
(CC0, same author).

The idea comes from the exteraGram plugin "Animated touches" (`animtou`) by @jaxbastard and
@zwylair, which drives Telegram's own `SuperRipple`. No code from it is used; its
red/blue-split idea ("dose") was reimplemented in the shader above.

The fighting-game sounds in `sounds/` (embedded in `SoundData.kt` by `tools/embed_sounds.py`) are
by Kenney (www.kenney.nl) under CC0 1.0 -- public domain. Which pack each comes from is in
`sounds/LICENSE.txt`. The combo skins' sounds are synthesised by `tools/make_skin_sounds.py`, no
samples, and are CC0 too.
