# revenge-next-plugins

Revenge Next ports of the plugins in [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins)
(Staff Tags, Custom Timestamps, Purge My Messages, Hide Servers Drawer Fix), targeting
[Revenge Next](https://github.com/revenge-mod/revenge-bundle-next) instead of classic
Revenge/Vendetta.

## How to install

Add this repository's URL to Revenge Next's plugin sources:

> https://bleelblep.github.io/revenge-next-plugins/index.json

## ⚠️ About this repository's plugin API

Revenge Next's **external plugin** API (the `plugin({...})` factory and the global
`revenge` namespace object every plugin calls into — see [`types/revenge.d.ts`](./types/revenge.d.ts))
has no public documentation as of writing. The types in this repo were reverse-engineered
by downloading and reading the built output of three of [Palm](https://github.com/PalmDevs)'s
own plugins from their live repo
([`revenge-plugin-repo`](https://copyparty.palmdevs.me/revenge-plugin-repo/)):
`palmdevs.silent-typing`, `palmdevs.hide-blocked-messages`, and `palmdevs.flashbang`.

That means:
- Anything exercised by those three plugins (patcher, module finders, jsonStorage, the
  Design table components, JSX runtime) should be accurate.
- Anything not exercised by them (e.g. `patcher.before`/`.after`, confirmation dialogs,
  most Discord action creators) is a best-effort guess by analogy with the classic
  Revenge/Vendetta API, and may be wrong until corrected against a real device.

If a plugin here fails to load or misbehaves, that's the most likely cause — please open
an issue with what broke.

**Known pitfall — `manifest.icon` + `SettingsComponent` can freeze the app at boot.**
Confirmed on-device (Staff Tags, RevengeXposed 1.5.3 / Discord 340.9): `Invariant Violation:
Setting <id> is missing a title`, thrown from Discord's own settings-navigator code
(`getSettingTitle`) while Revenge Next registers the plugin's settings route
(`src/plugins/start/settings.plugins/plugins.tsx` in revenge-bundle-next — when
`manifest.icon` is set, it configures a custom `headerTitle` instead of a plain `title`,
and something downstream that expects `.title` breaks). Reproduced with a **guessed, likely
invalid** icon name (`ShieldIcon`); not yet confirmed whether a real icon name avoids it. Only
set `manifest.icon` on a plugin with a `SettingsComponent` if you've confirmed the icon name
is real and tested it on-device — when in doubt, leave `icon` unset (it's optional).

## Repository format

Built with `pnpm run build` into `dist/`: one `<plugin-id>.zip` (`manifest.json` +
`index.js`) per plugin, plus a root `index.json` (format `1`) listing every published
version, matching the format Revenge Next's repo-add flow expects. Version history in
`index.json` accumulates across builds — see `.github/workflows/deploy.yml`.

## Development

```sh
pnpm install
pnpm run build          # builds every plugin in plugins/ into dist/
node serve.mjs --watch  # build, then serve dist/ over LAN for on-device testing
node devtools.mjs       # debug websocket bridge -- see errors/logs live from the client
```

`serve.mjs` prints a LAN `index.json` URL you can add as a repository source in Revenge
Next directly, and rebuilds on change. `devtools.mjs` is the same debug-websocket bridge
`bleelblep/revengeplugins` uses: point the client's Debugger URL at the printed LAN
address, and its output streams into this terminal. `ws` isn't a listed dependency
(`npm i ws --no-save` / `pnpm add ws --no-save` first) so the CI lockfile stays in sync,
since it's only needed for this local script.

## License

Same license as the source plugins in
[bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins) — see that
repo for full credits and per-file license notes (in particular
`plugins/bleelblep.hide-servers-drawer/NOTICE.md`, carried over unchanged).
