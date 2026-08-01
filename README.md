# revenge-next-plugins

Plugins for [Revenge Next](https://github.com/revenge-mod/revenge-bundle-next), built for my own
personal use. A mix of my own plugins and ports of existing Vendetta / classic-Revenge ones,
several by way of my earlier classic port in
[bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins). Credit is given wherever
it could be traced: every ported plugin carries a `NOTICE.md` naming the original author and
licence.

Eight plugins: four of mine, four ports.

## Install

Add this as a plugin repository in Revenge Next:

```
https://bleelblep.github.io/revenge-next-plugins/
```

## Plugins

### Mine

| Plugin | Licence | What it does |
| --- | --- | --- |
| **Screenshot Redactor** 🧪 | CC0-1.0 | Replaces every author with a stable placeholder — "User 1", "User 2" — and swaps avatars for Discord's defaults, so a conversation can be screenshotted without doxxing anyone. Long-press any message to arm it. **Inline `@mentions` are not redacted** — see [its README](./plugins/screenshot-redactor/README.md). |
| **Anti Ghost Ping** 🆕 | CC0-1.0 | Catches messages that pinged you and were then deleted — who, where, and what they said. **This is a message logger**, see below. |
| **Relationship Notifier** 🆕 | CC0-1.0 | Tells you when someone removes you as a friend, when you leave a server, or when a group DM closes. Discord hides all three. Stores names only, no message content. |
| **Hide Servers (Drawer Fix)** | CC0-1.0 | Locally hide servers or whole folders, without the scroll-jump bug. The replacement bar mirrors stock: folders, real server icons, unread DMs. Settings: per-server and per-folder toggles, instant apply, static icons, DM avatar on Home (off by default). With blerp. One GPL-3.0 file, and design debts to kmmiio99o's ServerDrawer — see [`NOTICE.md`](./plugins/hide-servers-drawer/NOTICE.md). |

🧪 **Screenshot Redactor is usable but incomplete.** Message authors, avatars, reply previews, the
DM and group-DM headers, and the server-tag badge all redact on device, confirmed. Two gaps
remain: inline `@mentions` still show real names, and arming redaction needs a channel switch to
repaint messages already on screen. Both have identified causes and are recorded in the plugin's
README and settings page.

🆕 **These two are new, and tested to very different degrees.** Anti Ghost Ping works end to end,
but only against its own self-ping test toggle — a real ghost ping from someone else has never
been observed. Relationship Notifier has never been run at all: it builds and typechecks, and
that is the extent of it. Each of its three events reads a payload shape I inferred rather than
confirmed, so any one of them could be wrong independently of the others.

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

Show Tag's licence was unresolved for a while — upstream's repository and site are both gone, and
the mirrored build carries no licence header. It is now settled as the **Unlicense**, recovered
from a surviving clone whose history shows the licence in Cynosphere's own initial commit. The
evidence is written up in [its `NOTICE.md`](./plugins/show-tag/NOTICE.md).

### Notes

Every settings page was broken repo-wide until the module-scope bug in
[porting rule 1](./docs/porting-rules.md#1-never-touch-revenge-at-module-scope) was found — the
settings API itself was never at fault. Hide Servers additionally bootlooped the app until the
same rule was applied across it; the specific killer was almost certainly `React.memo()` at module
scope, which throws inside `optionsFactory()` and fails the plugin before `start()` ever runs.

**Module exports usually live on `default`.** `withProps('getName')` matches a module and then
`mod.getName` is `undefined`, because the function is at `mod.default.getName`. Screenshot Redactor
claimed to hook seven name resolvers from 0.3.0 onward and hooked exactly one; six attempts at its
DM header, plus `@mentions` and the member list, were all debugging a hook that never existed. The
plugin's diagnostics reported the resolvers as patched throughout, because they recorded intent
rather than outcome — log what a hook *did*, not that you tried it. See
[porting rule 3](./docs/porting-rules.md#3-module-lookups).

**Show Tag, Custom Timestamps and Screenshot Redactor all patch `RowManager.prototype.generate`.**
The first two are confirmed to coexist, and only because Show Tag deliberately avoids `instead` —
see [porting rule 2](./docs/porting-rules.md#the-two-instead-recursion-bug). Keep it that way:
Custom Timestamps owns the one permitted `instead` on this method, and the other two are
`before`/`after` only.

Screenshot Redactor and Show Tag additionally *fight over the same field* — one overwrites
`generated.username`, the other appends the real handle to it — so the after-chain order decides
which wins. That ordering is still unverified; see the plugin's own README.

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
  Module-scope hazards, patcher hook contracts, module lookups, APIs that don't exist, and how to
  read the shipped APK instead of guessing. Every rule cost an on-device crash or a wasted release
  to find.
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

`adb logcat -s ReactNativeJS:V` is the other half of that loop, and often the faster one — see
[porting rule 5](./docs/porting-rules.md#5-read-the-app-instead-of-guessing) for the traps
(clear the buffer first, filter by tag rather than grepping for your prefix, and log one line per
call).

`ws` isn't a listed dependency (`npm i ws --no-save` / `pnpm add ws --no-save` first) so the CI
lockfile stays in sync, since it's only needed for that local script.

### Local-only plugins

Some plugins in `plugins/` are deliberately not published. `build.mjs` still picks them up for
local `dist/` builds and `serve.mjs`, but CI builds from a clean checkout so they never reach
gh-pages or `index.json`. See [`.gitignore`](./.gitignore) for which and why.

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
| Screenshot Redactor, Anti Ghost Ping, Relationship Notifier | CC0-1.0 |
| Hide Servers (Drawer Fix) | CC0-1.0, **except** `src/patches/createElementIntercept.ts` (GPL-3.0) |
| Staff Tags | CC0-1.0 (Fiery, シグマ siguma) |
| Custom Timestamps | Unlicense (Fiery) |
| Show Tag | Unlicense (Cynosphere) — upstream is gone, licence recovered from a clone; see its `NOTICE.md` |
| Hide Call Buttons | BSD-3-Clause |
