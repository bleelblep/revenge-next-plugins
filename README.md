# revenge-next-plugins

Plugins for [Revenge Next](https://github.com/revenge-mod/revenge-bundle-next), built for my own
personal use. Mostly ports of existing Vendetta / classic-Revenge plugins, several by way of my
earlier classic port in [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins).
Credit is given wherever it could be traced: every ported plugin carries a `NOTICE.md` naming the
original author and licence.

Six plugins: one of my own, five ports.

## Install

Add this as a plugin repository in Revenge Next:

```
https://bleelblep.github.io/revenge-next-plugins/index.json
```

> ⚠️ **Show Tag's original license could not be determined.** Its upstream repository and site
> are both gone, and the mirrored build carries no license header — see
> [`plugins/show-tag/NOTICE.md`](./plugins/show-tag/NOTICE.md). It ships here regardless. If
> you're Cynosphere, or you know the original terms, please open an issue and I'll relicense or
> remove it.

## Plugins

### Mine

| Plugin | Licence | What it does |
| --- | --- | --- |
| **Hide Servers (Drawer Fix)** | CC0-1.0 | Locally hide servers or whole folders, without the scroll-jump bug. The replacement bar mirrors stock: folders, real server icons, unread DMs. Settings: per-server and per-folder toggles, instant apply, static icons. With blerp. One GPL-3.0 file, and design debts to kmmiio99o's ServerDrawer — see [`NOTICE.md`](./plugins/hide-servers-drawer/NOTICE.md). |

### Ports

Other people's plugins brought over to Revenge Next. Each keeps its upstream licence; every one
has a `NOTICE.md` in its directory naming the original author and terms.

| Plugin | Original author | Licence | What it does |
| --- | --- | --- | --- |
| **Staff Tags** | Fiery, シグマ siguma | [CC0-1.0](./plugins/staff-tags/NOTICE.md) | Extra tags for staff — OWNER, ADMIN, STAFF, MOD, VC Mod, Chat Mod, WEBHOOK — in chat and the member list. Settings: role-colour toggle. |
| **Custom Timestamps** | Fiery | [Unlicense](./plugins/custom-timestamps/NOTICE.md) | Chat timestamps as calendar / relative / ISO 8601 / a custom format string. Settings: mode, separate messages. |
| **Show Tag** | [Cynosphere](https://github.com/Cynosphere) | ⚠️ [unresolved](./plugins/show-tag/NOTICE.md) | Username — or the full `name#0000` tag on legacy accounts — in the message header and reply previews. Settings: only show usernames. |
| **Hide Call Buttons** | John ([janisslsm](https://github.com/janisslsm)) | [BSD-3-Clause](./plugins/hide-call-buttons/NOTICE.md) | Hides call and video buttons in DMs, user profiles and voice channels. Settings: five per-surface toggles. |

### In progress

| Plugin | Original author | Licence | State |
| --- | --- | --- | --- |
| **Multi Scrobbler** | [kmmiio99o](https://github.com/kmmiio99o) | [GPL-3.0](./plugins/multi-scrobbler/NOTICE.md) | Last.fm / Libre.fm / ListenBrainz listening status on your profile, with album art. Scrobbling, album art and all eight settings sub-pages work. Outstanding: the live RPC preview. |

All six are confirmed working on-device, except Multi Scrobbler's settings sub-pages, which have
only been typechecked so far.

### Notes

Every settings page was broken repo-wide until the module-scope bug in
[porting rule 1](./docs/porting-rules.md#1-never-touch-revenge-at-module-scope) was found — the
settings API itself was never at fault. Hide Servers additionally bootlooped the app until the
same rule was applied across it; the specific killer was almost certainly `React.memo()` at module
scope, which throws inside `optionsFactory()` and fails the plugin before `start()` ever runs.

**Show Tag and Custom Timestamps both patch `RowManager.prototype.generate`.** They are confirmed
to coexist, but only because Show Tag deliberately avoids `instead` — see
[porting rule 2](./docs/porting-rules.md#the-two-instead-recursion-bug). Keep it that way.

## Documentation

- **[Porting rules](./docs/porting-rules.md)** — read before writing or debugging plugin code.
  Module-scope hazards, patcher hook contracts, module lookups, APIs that don't exist. Every
  rule cost an on-device crash to find.
- **[Known issues](./docs/known-issues.md)** — environment and build-level problems that plugin
  code can't fix, plus when to clear the module cache.

### Types

[`types/next/`](./types/next) is the **generated** type surface from revenge-bundle-next
(`bun types` → `dist/types`), vendored. [`types/globals.d.ts`](./types/globals.d.ts) declares the
two globals an external plugin actually gets — `plugin()` and `revenge` — mirroring that repo's
own `types/globals.consumers.ts`.

These replaced a hand-written `types/revenge.d.ts` that had been reverse-engineered from built
plugin output. Adopting the real ones immediately turned up three more non-existent APIs that had
been sitting behind `?.` doing nothing (`design.RawColors`, `design.Tokens`, `discord.haptics`)
and one genuine latent crash — `jsonStorage.cache` is possibly `undefined` because `load: true`
starts the read without awaiting it. See [porting rule 5](./docs/porting-rules.md#5-use-the-official-types-not-guesses).

Regenerate them from a revenge-bundle-next checkout when the API moves.

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

**CC0-1.0 by default**, matching [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins).
Ported plugins keep their upstream terms, so this repo is a mix — check the `NOTICE.md` in a
plugin's directory before copying anything out of it:

| Plugin | License |
| --- | --- |
| Staff Tags | CC0-1.0 (Fiery, シグマ siguma) |
| Custom Timestamps | Unlicense (Fiery) |
| Hide Servers (Drawer Fix) | CC0-1.0, **except** `src/patches/createElementIntercept.ts` (GPL-3.0) |
| Hide Call Buttons | BSD-3-Clause |
| **Multi Scrobbler** | **GPL-3.0** — copyleft, applies to that whole directory |
| Show Tag | **Unknown** — upstream is gone; see its `NOTICE.md` |
