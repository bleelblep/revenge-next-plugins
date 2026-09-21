# Plugin status and technical notes

## Discord 348

Checked against 348.0 (versioncode 348200) by comparing its Hermes bundle and a jadx decompile with
343.11:

- The native message-row schema only gained fields (`forceRevealSpoilers`, `secondaryCtaButton`,
  and three inside embeds and links). Nothing was removed or renamed, so the plugins that rewrite
  rows (Screenshot Redactor, Translate, Show Tag, Custom Timestamps, Staff Tags) need no schema
  changes.
- `DCDChatManager.updateRows` / `clearRows` and the chat module's React methods are unchanged.
- `SparklesIcon` was removed and there is no standalone sparkle icon left (`SparkleIcon` only
  exists inside `PencilSparkleIcon` and `ImageSparkleIcon`). AI Core, Catch Up and Plugin Hub use
  `MagicWandIcon` instead.
- `addSettingsItemToSection('REVENGE', …)` now succeeds. Plugin Hub had relied on it failing to get
  a section of its own; it now registers its own section directly (see below).

## Screenshot Redactor

Two plugin ids, from two folders:

| Folder | Id | Version | For |
| --- | --- | --- | --- |
| `plugins/screenshot-redactor-dev` | `bleelblep.screenshot-redactor` | `0.27.x` | Discord 347 and newer |
| `plugins/screenshot-redactor` | `bleelblep.screenshot-redactor-legacy` | `0.19.x` | Discord before 347 |

Both redact message authors, avatars, reply previews, inline mentions, DM and group-DM headers,
the DM header avatar, and server-tag badges. On 347+ the chat bridge is a Fabric command rather
than `DCDChatManager`, which is why the lines split.

`0.27.0` adds **message-body redaction**: emails, phone numbers, addresses, card numbers, invite
links and API keys typed into messages are blanked, matched on the device.

Known limitations:

- Arming redaction may require switching channels before messages already on screen repaint.
- Disarming may leave placeholders visible until Discord reloads because rows, resolvers, and
  images can remain cached.
- Names typed directly into a message are not recognised, so they remain visible.
- Group-DM headers only update after the channel is refreshed or switched.
- Screenshot Redactor and Show Tag both modify `generated.username`; their final result can depend
  on patch order and remains unverified.

## Plugin Hub

Registers a **Plugin Hub** section with `index: 1`, directly below Revenge's section, holding two
rows:

- **Hub**: shortcuts to the plugins you pick, in a favourites, grid, cards or shelves layout.
- **AI Hub**: AI Core and the plugins that depend on it, as plain rows. The row is hidden unless
  AI Core is running, detected through `globalThis.__bleelblepAiCore`, which AI Core sets in
  `start` and clears on stop.

Revenge inserts sections without an `index` at the top of the list in registration order, so an
external plugin's unindexed section ends up *above* Revenge's. Index `0` does not work either,
because Revenge treats it as unset.

Listing installed plugins in "Choose plugins" needs Revenge's Developer Mode (the hidden API);
using the hub does not.

## Catch Up

`/catchup` sends a transcript of `<@authorId>: message` lines to AI Core's provider with the
prompt in `js/lib/summarise.ts`. Mentions inside messages stay as raw `<@id>`. The model refers to
people only by copying those mentions. `js/lib/mentions.ts` replaces any `<@id>` that was not in
the transcript with "someone", so a mistyped id never renders as a mention of a stranger. The
summary is a clientside ephemeral message, so its mentions never ping.

## Ghost Log Native Beta

Stores deleted message text encrypted on the device (AES-GCM) and can render deleted messages back
into chat across reloads. It is a message logger and may increase account risk under Discord's Terms
of Service. Its Kotlin half only registers its own native methods and hooks no Discord classes, so
Discord updates do not affect it directly.

## Patch interactions

Show Tag, Custom Timestamps, and Screenshot Redactor patch `RowManager.prototype.generate`.
Custom Timestamps owns the only `instead` hook used on that method. Show Tag and Screenshot
Redactor use `before` or `after` hooks to avoid the patcher's multi-`instead` recursion bug.

See [porting rule 2](./porting-rules.md#2-the-patchers-hook-contracts-differ-from-classic-revengevendettas)
for the hook contracts and recursion analysis.

## Historical fixes

### Settings and module scope

Settings pages previously failed because external plugins read `revenge.*` APIs at module scope,
before Discord's UI modules existed. Hide Servers also bootlooped when `React.memo()` ran at module
scope. The complete rule is documented in
[porting rule 1](./porting-rules.md#1-never-touch-revenge-at-module-scope).

### Module lookup failures

Screenshot Redactor exposed three separate lookup problems:

1. Matching functions often live on a module's `default` export rather than its namespace.
2. `getModules` shares its `max` budget between initialized lookups and future subscriptions.
3. Successfully finding a resolver does not prove the target UI surface uses that resolver.

Prefer `revenge.discord.utils.modules.finders.getModuleWithImportedPath` when the Discord source path is
known. See [porting rule 3](./porting-rules.md#3-module-lookups).

### Staff Tags

Staff Tags `1.2.2` fixed permission tags disappearing because
`revenge.discord.common.Constants.Permissions` does not exist. The plugin now uses Discord's stable
public permission bits directly. See
[porting rule 4](./porting-rules.md#4-apis-that-dont-exist).

### Hide Servers

- `1.3.0` stopped forcing the DM avatar onto the Home button; the option is now disabled by
  default.
- `1.3.3` fixed un-hiding not surviving restart by storing explicit `false` tombstones. This is
  required because `jsonStorage.set()` merges and cannot delete omitted keys.
- `1.5.0` moved the custom guild bar to a debug fallback. The stock bar now hides servers through
  filtered render-path getters while persistence getters remain unfiltered.

See [porting rule 6](./porting-rules.md#6-jsonstorageset-merges-and-a-merge-can-never-delete-a-key)
and [porting rule 8](./porting-rules.md#8-a-filtered-store-getter-can-feed-discords-write-path-not-just-rendering).
