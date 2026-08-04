# Ghost Log Native Beta

A native-first rewrite of Ghost Log. It logs deleted messages into an AES-GCM encrypted on-device
store and, unlike the stable plugin, brings them back **inside the chat across app reloads** — not
just in a separate log screen.

This is the testing track for Ghost Log (`bleelblep.ghost-log`). It uses a separate plugin id
(`bleelblep.ghost-log-native-beta`) so it can be installed and run alongside stable without
touching it. It is published on the `beta` channel only.

**Status: working on device.** Deletion capture (single and bulk), encrypted persistence across
reloads, in-chat restore across reloads, encrypted backup/restore, and the full settings surface
are all confirmed.

## Why native

Discord's delete events live in the Hermes/JS Flux layer, so the *capture* has to be JS. What the
native (Kotlin) half buys is everything JS is bad at:

- **Real encryption.** Hermes has no WebCrypto/Node crypto, so stable's log is a hand-rolled
  cipher. Here the log is AES-GCM via `javax.crypto`.
- **Native-owned persistence.** The encrypted log lives in a Kotlin-managed file, independent of
  the JS `jsonStorage` document, and is synchronously readable before the JS bundle finishes
  loading — which is what makes restore-at-startup reliable.

## How it works

Hybrid: JS captures, native stores, JS renders.

- **Capture.** JS subscribes to `MESSAGE_DELETE` / `MESSAGE_DELETE_BULK`, reads the message before
  it leaves the store, and bridges it to native. Native encrypts (AES-GCM) and persists it.
- **Restore.** The chat list reads `MessageStore.getMessages(channelId)`. We hook it and merge our
  stored deletions back into the returned `ChannelMessages._array`, built as real `MessageRecord`
  instances through Discord's own `createMessageRecord` and slotted in by timestamp. Because the
  list re-reads on every draw, restored messages survive the store's reconciliation against server
  truth — the thing that made naive store injection blink and vanish.

A hand-built plain object was tried first for restore and crashed the row builder (`isNewMessageGroup`
calls methods on `_array` items, which are `MessageRecord` instances with a `Date` timestamp and a
`UserRecord` author). Building records through `createMessageRecord` is what makes injection safe.

## Scope

Confirmed on device:

- deleted message capture, single and bulk, into the encrypted native log
- persistence of that log across app reloads
- in-chat restore of deleted messages across reloads, with the red overlay
- encrypted backup create/restore to a user-chosen path (shared storage or app-private)
- settings parity with stable: Deleted messages, Settings (logging/notifications/limits), Backup,
  Visual style, Debug, Licence
- tap a deleted-message entry in the log to jump to it in its original server/channel, via
  Discord's own in-app router (`transitionTo`) rather than an OS-level deep link

## Upcoming

- **Edit logging.** Capture message edits (before → after content) alongside deletions, shown in
  the log with an "edited" marker. Only deletions are captured today.

## Known limitations

- **Edits are not logged yet.** Only deletions are captured; edit history is planned.
- **Restore position is chronological**, not pixel-perfect — restored messages slot in by timestamp
  and may differ slightly from their original neighbours if the surrounding window changed.
- **The native jar is prebuilt and committed.** JS changes build with `npm run build`; Kotlin
  changes need a Gradle rebuild in the standalone template project, then the jar re-copied here.
- **Count my own messages** (Debug) is the intended way to self-test; it is off by default, matching
  stable.

## Warning

This is a message logger. It stores deleted message text (encrypted) on your device and can render
deleted messages back into chat. Client mods already break Discord's Terms of Service, and message
loggers are the kind most associated with accounts being actioned. Only you can see the log, but the
risk is yours.
