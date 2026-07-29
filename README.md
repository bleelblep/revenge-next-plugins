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

## Repository format

Built with `pnpm run build` into `dist/`: one `<plugin-id>.zip` (`manifest.json` +
`index.js`) per plugin, plus a root `index.json` (format `1`) listing every published
version, matching the format Revenge Next's repo-add flow expects. Version history in
`index.json` accumulates across builds — see `.github/workflows/deploy.yml`.

## Development

```sh
pnpm install
pnpm run build   # builds every plugin in plugins/ into dist/
```

## License

Same license as the source plugins in
[bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins) — see that
repo for full credits and per-file license notes (in particular
`plugins/bleelblep.hide-servers-drawer/NOTICE.md`, carried over unchanged).
