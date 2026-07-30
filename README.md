# revenge-next-plugins

Revenge Next ports of plugins from [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins)
(Staff Tags, Custom Timestamps, Hide Servers Drawer Fix), targeting
[Revenge Next](https://github.com/revenge-mod/revenge-bundle-next) instead of classic
Revenge/Vendetta. Purge My Messages was dropped from this port.

This repo is currently **private and unpublished** (GitHub Pages disabled) while the issues
below get sorted out.

## ⚠️ About this repository's plugin API

Revenge Next's **external plugin** API (the `plugin({...})` factory and the global
`revenge` namespace object every plugin calls into — see [`types/revenge.d.ts`](./types/revenge.d.ts))
has no public documentation as of writing. The types in this repo were reverse-engineered
by downloading and reading the built output of three of [Palm](https://github.com/PalmDevs)'s
own plugins from their live repo, then corrected repeatedly against on-device crash logs and
revenge-bundle-next's own source.

## Currently broken

- **Settings pages don't work on any plugin.** Setting `SettingsComponent` reliably crashes
  Discord's entire Settings screen on open — not just the plugin's own page —
  `Invariant Violation: Setting <id> is missing a title`, thrown from Discord's own
  `getSettingTitle` while it builds descriptors for the whole Settings navigator. The wiring
  Revenge Next uses to register an external plugin's settings route (`useTitle: () =>
  plugin.manifest.name`, in `src/plugins/start/settings.plugins/plugins.tsx`) matches its
  real source exactly, unchanged across their 2026-07-25 plugin-system rewrite, and no one
  else has reported this upstream — root cause unconfirmed. All three plugins currently ship
  with `SettingsComponent` omitted and their options hardcoded to sensible defaults.
- **Custom Timestamps** and **Hide Servers (Drawer Fix)** load without crashing, but beyond
  that haven't been thoroughly exercised on-device. Unlike Staff Tags (chat tags and
  member-list tags both confirmed working), functional correctness here is unverified.

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
