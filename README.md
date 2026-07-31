# revenge-next-plugins

Revenge Next ports of plugins from [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins),
targeting [Revenge Next](https://github.com/revenge-mod/revenge-bundle-next) instead of classic
Revenge/Vendetta. Purge My Messages was dropped from this port.

Currently **private and unpublished** (GitHub Pages disabled) until Hide Servers is either
fixed or dropped.

## Plugins

| Plugin | Status | What it does |
| --- | --- | --- |
| **Staff Tags** | Working | Extra tags for staff — OWNER, ADMIN, STAFF, MOD, VC Mod, Chat Mod, WEBHOOK. In chat and the member list. Settings: role-colour toggle. |
| **Custom Timestamps** | Working | Chat timestamps in calendar / relative / ISO 8601 / a custom format string. Settings: mode + "separate messages". |
| **Show Tag** | Working | Username (or full `name#0000` tag on legacy accounts) in the message header and reply previews. Settings: "only show usernames". Ported from [Cynosphere](https://github.com/Cynosphere)'s Vendetta plugin — see [`NOTICE.md`](./plugins/show-tag/NOTICE.md), the original's **license is unresolved**, don't publish it yet. |
| **Hide Call Buttons** | Working | Hides call/video buttons in DMs, user profiles and voice channels. Settings: five per-surface toggles. Ported from John ([janisslsm](https://github.com/janisslsm))'s Vendetta plugin, BSD-3-Clause — see [`NOTICE.md`](./plugins/hide-call-buttons/NOTICE.md). |
| **Hide Servers (Drawer Fix)** | Broken | Soft-bootloops on reopen. See [below](#hide-servers). |

All four settings pages are confirmed working on-device. They were broken repo-wide until the
module-scope bug in [porting rule 1](./docs/porting-rules.md#1-never-touch-revenge-at-module-scope)
was found — the settings API itself was never at fault.

**Show Tag and Custom Timestamps both patch `RowManager.prototype.generate`.** They are confirmed
to coexist, but only because Show Tag deliberately avoids `instead` — see
[porting rule 2](./docs/porting-rules.md#the-two-instead-recursion-bug). Keep it that way.

### Hide Servers

Its bundle still has ~14 module-scope `revenge.*` destructures, 5 of them
`revenge.discord.flux.Stores` (`lib/dms.ts`, `patches/sortedGuilds.ts`, `lib/notifications.ts`,
`ui/components/GuildRow.tsx`, `ui/components/CustomGuildsBar.tsx`). That violates
[porting rule 1](./docs/porting-rules.md#1-never-touch-revenge-at-module-scope) and is likely
most of the bootloop — fix that before looking anywhere else.

## Documentation

- **[Porting rules](./docs/porting-rules.md)** — read before writing or debugging plugin code.
  Module-scope hazards, patcher hook contracts, module lookups, APIs that don't exist. Every
  rule cost an on-device crash to find.
- **[Known issues](./docs/known-issues.md)** — environment and build-level problems that plugin
  code can't fix, plus when to clear the module cache.

Revenge Next's **external plugin** API (the `plugin({...})` factory and the global `revenge`
namespace — see [`types/revenge.d.ts`](./types/revenge.d.ts)) has no public documentation. The
types here were reverse-engineered from the built output of three of
[Palm](https://github.com/PalmDevs)'s own plugins, then corrected against crash logs and
revenge-bundle-next's source. Treat them as approximations.

## Development

```sh
pnpm install
pnpm run build          # builds every plugin in plugins/ into dist/
node serve.mjs --watch  # build, then serve dist/ over LAN for on-device testing
node devtools.mjs       # debug websocket bridge -- see errors/logs live from the client
```

`serve.mjs` prints a LAN `index.json` URL you can add as a repository source in Revenge Next
directly, and rebuilds on change. `devtools.mjs` is the same debug-websocket bridge
`bleelblep/revengeplugins` uses: point the client's Debugger URL at the printed LAN address and
its output streams into your terminal. Running both is much faster than exporting a crash log
per attempt.

`ws` isn't a listed dependency (`npm i ws --no-save` / `pnpm add ws --no-save` first) so the CI
lockfile stays in sync, since it's only needed for that local script.

### Build output

`dist/` gets one `<plugin-id>.zip` (`manifest.json` + `index.js`) per plugin, plus a root
`index.json` (format `1`) listing every published version — the format Revenge Next's repo-add
flow expects. Version history in `index.json` accumulates across builds; see
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).

## License

Same license as the source plugins in
[bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins) — see that repo for
full credits and per-file license notes, in particular
[`plugins/hide-servers-drawer/NOTICE.md`](./plugins/hide-servers-drawer/NOTICE.md), carried over
unchanged.
