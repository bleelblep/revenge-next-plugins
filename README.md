# revenge-next-plugins

Plugins for [Revenge Next](https://github.com/revenge-mod/revenge-bundle-next), built for my own
personal use. Mostly ports of existing Vendetta / classic-Revenge plugins, several by way of my
earlier classic port in [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins).
Credit is given wherever it could be traced: every ported plugin carries a `NOTICE.md` naming the
original author and licence.

Seven plugins: three of my own, four ports.

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
| **Screenshot Redactor** 🧪 | CC0-1.0 | Replaces every author with a stable placeholder — "User 1", "User 2" — swaps avatars for Discord's defaults, so a conversation can be screenshotted without doxxing anyone. Long-press any message to arm it. ⚠️ **The DM header and server-tag badge are not redacted** — see [its README](./plugins/screenshot-redactor/README.md). |
| **Anti Ghost Ping** 🆕 | CC0-1.0 | Catches messages that pinged you and were then deleted — who, where, and what they said. ⚠️ **This is a message logger**, see below. |
| **Relationship Notifier** 🆕 | CC0-1.0 | Tells you when someone removes you as a friend, when you leave a server, or when a group DM closes. Discord hides all three. Stores names only, no message content. |
| **Hide Servers (Drawer Fix)** | CC0-1.0 | Locally hide servers or whole folders, without the scroll-jump bug. The replacement bar mirrors stock: folders, real server icons, unread DMs. Settings: per-server and per-folder toggles, instant apply, static icons, DM avatar on Home (off by default). With blerp. One GPL-3.0 file, and design debts to kmmiio99o's ServerDrawer — see [`NOTICE.md`](./plugins/hide-servers-drawer/NOTICE.md). |

🧪 Screenshot Redactor redacts message authors, avatars and reply previews on device, confirmed,
and the long-press toggle works. **Two things it does not redact:** the DM/group-DM header
(attempted six ways, abandoned) and the server-tag badge beside usernames (attempted once, broke
the client, reverted). Both are called out in the plugin's own settings page, and its README
records what was tried and where to pick each up. Crop the header before sharing.

🆕 Both are new and **lightly tested**. Anti Ghost Ping has been verified end to end, but only
with its own self-ping test toggle — a genuine ghost ping from someone else hasn't been observed
yet. Relationship Notifier has been built and typechecked but not run at all: each of its three
events reads a payload shape I inferred rather than confirmed, so any one of them could be wrong
independently of the others.

> ### ⚠️ Anti Ghost Ping is a message logger
>
> It stores the **text of deleted messages** that pinged you, unencrypted on the device, until you
> clear the log. Client mods already break Discord's Terms of Service, and message loggers are the
> category most associated with accounts being actioned. Nothing leaves your device and only you
> can read the log — but that is the risk, and it is stated in the plugin's own settings too.
>
> Relationship Notifier is **not** a logger: it records names and avatar hashes, never message
> content.

### Ports

Other people's plugins brought over to Revenge Next. Each keeps its upstream licence; every one
has a `NOTICE.md` in its directory naming the original author and terms.

| Plugin | Original author | Licence | What it does |
| --- | --- | --- | --- |
| **Staff Tags** | Fiery, シグマ siguma | [CC0-1.0](./plugins/staff-tags/NOTICE.md) | Extra tags for staff — OWNER, ADMIN, STAFF, MOD, VC Mod, Chat Mod, WEBHOOK — in chat and the member list. Settings: role-colour toggle. Permission-based tags (everything but OWNER/WEBHOOK) were silently broken until 1.2.2 — see Notes. |
| **Custom Timestamps** | Fiery | [Unlicense](./plugins/custom-timestamps/NOTICE.md) | Chat timestamps as calendar / relative / ISO 8601 / a custom format string. Settings: mode, separate messages. |
| **Show Tag** | [Cynosphere](https://github.com/Cynosphere) | [Unlicense](./plugins/show-tag/NOTICE.md) | Username — or the full `name#0000` tag on legacy accounts — in the message header and reply previews. Settings: only show usernames. |
| **Hide Call Buttons** | John ([janisslsm](https://github.com/janisslsm)) | [BSD-3-Clause](./plugins/hide-call-buttons/NOTICE.md) | Hides call and video buttons in DMs, user profiles and voice channels. Settings: five per-surface toggles. |

### Notes

Every settings page was broken repo-wide until the module-scope bug in
[porting rule 1](./docs/porting-rules.md#1-never-touch-revenge-at-module-scope) was found — the
settings API itself was never at fault. Hide Servers additionally bootlooped the app until the
same rule was applied across it; the specific killer was almost certainly `React.memo()` at module
scope, which throws inside `optionsFactory()` and fails the plugin before `start()` ever runs.

**Show Tag, Custom Timestamps and Screenshot Redactor all patch `RowManager.prototype.generate`.**
The first two are confirmed to coexist, and only because Show Tag deliberately avoids `instead` —
see [porting rule 2](./docs/porting-rules.md#the-two-instead-recursion-bug). Keep it that way:
Custom Timestamps owns the one permitted `instead` on this method, and the other two are
`before`/`after` only.

Screenshot Redactor and Show Tag additionally *fight over the same field* — one overwrites
`generated.username`, the other appends the real handle to it — so the after-chain order decides
which wins. That ordering is unverified; see the plugin's own README.

**Staff Tags 1.2.2 fixed every permission-based tag disappearing.** `getTag.ts` read
`revenge.discord.common.Constants.Permissions`, which does not exist, behind a `?.` and a `?? {}`
fallback — so a correctly-computed permission bitmask got mapped against an empty table and
silently produced nothing. Only OWNER and WEBHOOK (the two `condition`-based tags, not
permission-based) kept working, which is why the symptom looked like a partial failure rather
than a missing API. Fixed by hardcoding the permission bits directly — they're part of Discord's
public API and can't change without breaking every bot on the platform, so there's nothing left
to look up. See [porting rule 4](./docs/porting-rules.md#4-apis-that-dont-exist).

**Hide Servers 1.3.0 stopped forcing the DM avatar onto the Home button.** The original code
believed that was stock behaviour; it isn't — stock keeps a static glyph (`ClydeIcon`, confirmed
via `revenge.assets.getAssets()`) — so the avatar is now an opt-in setting, off by default.

**Hide Servers 1.3.3 fixed un-hiding a server not surviving a relaunch.** `jsonStorage.set()`
recursively merges rather than replaces, so a merge can add or overwrite a key but never remove
one — omitting an id from the persisted `hidden` object did nothing, and its stale `true` entry
came back on every reload. Hiding worked (adding a key is what a merge is good at); only removal
was ever going to be broken. Fixed by writing an explicit `false` tombstone instead of omitting
the key. See [porting rule 6](./docs/porting-rules.md#6-jsonstorageset-merges-and-a-merge-can-never-delete-a-key).

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
starts the read without awaiting it. See [porting rule 7](./docs/porting-rules.md#7-use-the-official-types-not-guesses).

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
| Anti Ghost Ping, Relationship Notifier | CC0-1.0 |
| Staff Tags | CC0-1.0 (Fiery, シグマ siguma) |
| Custom Timestamps | Unlicense (Fiery) |
| Hide Servers (Drawer Fix) | CC0-1.0, **except** `src/patches/createElementIntercept.ts` (GPL-3.0) |
| Hide Call Buttons | BSD-3-Clause |
| Show Tag | Unlicense (Cynosphere) — upstream is gone, licence recovered from a clone; see its `NOTICE.md` |
