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

## Working

**Staff Tags** — chat tags and member-list tags are both confirmed working on-device.

Fixes it took to get there (kept here since the same classes of bug are likely lurking in
the other two plugins too):
- `patcher.after`'s hook only receives the return value, not the original args — code
  written against the classic Revenge/Vendetta `(args, ret)` convention needs `instead` +
  `original(...args)` instead.
- `lookupModule`/`lookupModules` are one-shot and permanently cache a miss if the target
  module hasn't loaded yet (very possible from `preInit`, and even from `start()` for
  chat/member-list UI modules that only initialize once their screen renders) — use
  `getModules` (subscribes, calls back whenever a match actually loads) for anything UI-related.
- `revenge.discord.common.chroma` and `.moment` don't exist. Replaced with a self-contained
  brightness calc and, in Custom Timestamps, a self-contained date formatter.
- `revenge.utils.react.findInReactTree` doesn't exist — replaced with a local implementation
  (`plugins/staff-tags/src/lib/findInReactTree.ts`).
- The member-list patch (`details.tsx`) needed a hand-built module filter to catch `UserRow`,
  which is `React.memo()`-wrapped (so `filters.withName` can never match it — memo wrappers
  have no `.name` of their own). That hand-built filter also has to implement a `.scope(...)`
  **method**, not just a `.scopes` property — `getModules`/`lookupModule` call it as a
  function internally, and a filter missing it throws immediately, silently, every time.

Known limitation: **no settings page** (see below), so `useRoleColor` is hardcoded to `false`
in `jsonStorage`'s default. Once settings are usable again, wiring up a real toggle for that
is still outstanding.

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
- **Hide Servers (Drawer Fix)** soft-bootloops the app on reopen in its current state.
- **Custom Timestamps** loads without crashing, but beyond that hasn't been thoroughly
  exercised on-device — functional correctness is unverified.

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
