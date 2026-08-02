# Plugin status and technical notes

## Screenshot Redactor

### Stable (`0.19.1`)

The stable release redacts message authors, avatars, reply previews, inline mentions, DM and
group-DM headers, the DM header avatar, and server-tag badges.

Known limitations:

- Arming redaction may require switching channels before messages already on screen repaint.
- Disarming may leave placeholders visible until Discord reloads because rows, resolvers, and
  images can remain cached.
- Message text is deliberately untouched, so names typed directly into a message remain visible.
- Screenshot Redactor and Show Tag both modify `generated.username`; their final result can depend
  on patch order and remains unverified.

### Beta (`0.25.2-beta1`)

The beta keeps the stable redaction patches but changes the controls and refresh behavior.

Changes compared with stable:

| Area | Stable | Beta |
| --- | --- | --- |
| Settings | All controls and diagnostics are on one page. | Uses a short main page with separate Visuals and Debug pages. |
| Quick controls | Optional long-press row and optional floating chat button. | Removes the floating button and uses the long-press row as the only quick control. |
| Repainting | Tries the native chat mirror; usually requires a channel switch when that module is unavailable. | Also dispatches up to 50 cached messages through `MESSAGE_UPDATE` to ask Discord to regenerate visible rows. |
| Header refresh | Nudges four likely stores. | Nudges six likely stores and sweeps initialized store callback sets, but group-DM headers still require a channel refresh or switch. |
| New-install defaults | Server tags and your own identity are not redacted by default. | Server tags and your own identity are redacted by default. |
| Recovery | Explains that a reload may be needed. | Adds a Reload Discord action to mark the plugin for reload. |
| Diagnostics | Included on the main settings page. | Moved to a dedicated page with a manual Repaint chat action and clearer repaint results. |

Beta items that still need device confirmation:

- **Flux repaint:** the beta dispatches synthetic `MESSAGE_UPDATE` events for up to 50 cached
  messages. The source notes that other event handlers may reject these payloads. Confirm that
  arming and disarming repaint visible rows without changing message state, duplicating rows, or
  causing errors.
- **Group-DM headers:** redaction applies only after the channel is refreshed or switched. The
  wider store sweep does not repaint the currently displayed group-DM header immediately.
- **Long-press migration:** the beta removes the setting that controls the long-press row but still
  reads the persisted `showSheetToggle` value. A user who disabled that row in stable may carry
  `false` into beta and have no visible setting to turn it back on.
- **More aggressive defaults:** fresh beta installs redact server tags and the current user by
  default. Confirm this is intentional before promoting beta to stable, especially because the
  server-tag option is still described as capable of visibly breaking chat.
- **Broad store sweep:** toggling redaction invokes callback sets across initialized Flux stores to
  refresh headers. Check for unnecessary rerenders, UI stalls, or unrelated state changes.

The beta deliberately removes the floating chat overlay (`patches/overlay.tsx`) rather than merely
hiding it. Users must use the main settings toggle or the message long-press action.

## Anti Ghost Ping

The self-ping test works end to end. A real ghost ping from another user has not been confirmed.

This plugin stores deleted message text unencrypted on the device until its log is cleared. It is
a message logger and may increase account risk under Discord's Terms of Service.

## Ghost Log

Ghost Log records deleted message text and can preserve deleted messages in chat with a visual
indicator. It has the same local-storage and account-risk warning as Anti Ghost Ping.

## Relationship Notifier

The plugin builds and type-checks, but its friend removal, mutual-server loss, and group-DM close
event payloads still require on-device confirmation. It records names and avatar hashes, not
message content.

## Who Reacted

The action-sheet insertion uses a mechanism already confirmed by Screenshot Redactor. The REST
request for reactor names builds and type-checks but still needs visual confirmation on a real
message. See [`plugins/who-reacted/README.md`](../plugins/who-reacted/README.md) for investigation
notes and remaining limitations.

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

Prefer `revenge.discord.utils.finders.getModuleWithImportedPath` when the Discord source path is
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
