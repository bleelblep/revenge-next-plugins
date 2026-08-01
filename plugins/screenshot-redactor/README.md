# Screenshot Redactor

A toggle that replaces usernames and avatars with stable placeholders, so a conversation can be
screenshotted and shared without doxxing anyone in it.

The placeholders are *stable within a session*: the same person is "User 3" in the message header,
in a reply preview, and thirty messages further up. A screenshot of an argument or a support
thread is only worth sharing if you can still tell who said what, so blanking everyone identically
is offered but is not the default.

**Status: working, with one known leak and one missing convenience.** Message authors, avatars,
reply previews, the DM header, group-DM headers and the server-tag badge all redact on device,
confirmed. **Inline `@mentions` do not** — see Known bugs. Arming redaction still needs a channel
switch to repaint messages already on screen.

## How it works

Redaction runs on the *data* a message row is built from, never on the rendered React tree.

`RowManager.prototype.generate` flattens a message into the flat object the native row renderer
consumes — display name, avatar URL, reply preview — so rewriting fields on that object covers the
whole message list at one point. Names outside the message list (the DM header, `@mentions`, the
member list) have no equivalent choke point and go through the shared name resolvers instead.

Per porting rule 2 this plugin uses `before` + `after` and never `instead`: Custom Timestamps
already owns the one permitted `instead` on `generate`.

## Scope

Covered and confirmed on device:

- message author display names, avatars and avatar decorations
- reply-preview names and avatars ("replying to X")
- the DM header and group-DM headers
- the server-tag badge, behind an off-by-default switch
- system messages and join notices — redaction gates on a row carrying an `authorId` rather than
  on its row type, so a row that names someone is covered whatever type it arrives under
- a long-press toggle in the message menu

Not covered. These still identify people while redaction is on:

- **inline `@mentions`** — a live leak, see Known bugs
- the member list and profile sheets, which resolve names the same way `@mentions` do and are
  assumed to be leaking for the same reason; untested
- provisional (unclaimed) accounts in a group-DM header, which bypass every resolver
- typing indicators and toasts
- server names, channel names, and the guilds bar
- message content, which names people constantly

## Known bugs

### `@mentions` are not redacted — the name resolvers are never hooked

`patches/displayName.ts` has claimed since 0.3.0 to hook seven name resolvers. It hooks one.
Device logs show the entire result of that patch:

```
hooked name resolver: useUserTag (props, module 3970)
```

`getName` — the resolver `@mentions`, the member list and the header fallback all go through — has
never been hooked in any release. Two separate causes have been found and only the first is fixed:

1. **The resolvers live under `default`.** A device probe shows the shape unambiguously:

   ```
   1214.getName: exports=undefined default.getName=function
   ```

   Every one of the 26 modules `withProps('getName')` matches has the function at
   `mod.default.getName`, and the callback tested `mod.getName`, found `undefined`, and dropped
   all of them. `useUserTag` only ever landed because it happens to be its own module, caught by
   the `withName` + `returnNamespace` finder which does look at `.default`. Fixed in 0.18.5.

2. **`getModules` never calls back for these modules, though `lookupModules` finds them.** With
   the `.default` handling in place the hook still does not register. The probe's
   `lookupModules(withProps('getName'))` returns 26 modules; the equivalent `getModules`
   subscription in `patches/displayName.ts` fires for none of them. This is unexplained.

**Next step for whoever picks this up:** switch `patches/displayName.ts` from `getModules` to
`lookupModules`, since the probe proves that path reaches the modules. That trades away the
subscribe-on-load behaviour porting rule 3 recommends, so the resolvers would need to be looked up
lazily — on first row render rather than at `start()` — to avoid caching a miss.

Module 1214 is the target: it carries `getName`, `useName`, `getNickname`, `getGlobalName`,
`getFormattedName`, `getUserTag` and `useUserTag` together.

### Arming redaction does not repaint messages already on screen

Switching channels is still required. `patches/chatManager.ts` is written and correct as far as it
goes, but the native module it needs is never found — the log says `DCDChatManager not directly
reachable; asking Metro for it` and never reports it hooked. Both the direct routes
(`revenge.react.ReactNative.NativeModules`, `nativeModuleProxy`) and the
`getModules(withProps('DCDChatManager'))` fallback come back empty.

Discord's own call site is a plain `NativeModules.DCDChatManager`, so the object exists; the
plugin cannot currently reach it. Until it can, the mirror in `lib/chatRows.ts` never fills and
`refreshChat()` reports `nothing mirrored yet`.

See "The chat bridge" below for why a store nudge cannot substitute for this.

### The DM header depends on a workaround

The header resolves `getNickname(userId) ?? getName(user)`. Because `getName` is not hooked, the
`getNickname` hook returns a placeholder even when the user has no nickname set, so the fallback is
never reached. This is what makes the header work today.

The cost: while redaction is armed, everything that asks whether a user has a nickname gets "yes".
Surfaces that branch on a nickname existing will render as though one is set. It reverts when
redaction is switched off, and it is gated behind **Names everywhere, not just messages**.

Once `getName` is hooked properly this should be reverted — `src/patches/dmHeader.ts` documents the
exact condition to restore.

## How names are redacted, by layer

| Surface | Patch | Mechanism |
| --- | --- | --- |
| Message rows, reply previews, avatars, badges | `patches/rowManager.ts` | `RowManager.prototype.generate`, rewriting the flat row data |
| The DM and group-DM header | `patches/dmHeader.ts` | `RelationshipStore.getNickname` |
| `@mentions`, member list, profile sheets | `patches/displayName.ts` | the shared name resolvers — **currently hooks nothing useful** |
| Re-resolving headers after a toggle | `lib/nudge.ts` | a store emit, which un-memoizes `useStateFromStores` |
| Message list repaint after a toggle | `patches/chatManager.ts` | `DCDChatManager.updateRows` — **currently never installs** |

`patches/rowManager.ts` and `patches/chatManager.ts` share `lib/rowSchema.ts`, so they cannot
disagree about what a `Message` is. Running both is safe: every replacement is derived from
`authorId` rather than from the field's current value, which makes redaction idempotent.

## The DM header

Six attempts failed before the component was identified by disassembling the shipped bundle. The
history is kept because the reason they failed is the useful part — every one assumed the header
renders a channel title, and it does not.

The code for attempts 1–6 lived in `patches/channelName.ts` (deleted in 0.17.0; recoverable from
git history at 0.16.0). None of it came back.

### What was tried and ruled out

1. **"The header is stage 2."** It says `#general` in a guild, but in a DM it says a person's name
   — on the surface most likely to be screenshotted, the most identifying thing on screen. A wrong
   priority rather than a missing feature.
2. **Hook the user-name resolver.** `useName` was hooked and did nothing. The conclusion drawn was
   that the header resolves a channel, not a user. That conclusion was wrong, and it cost four more
   attempts: the header does resolve a user, through a resolver that was never actually hooked.
3. **Hook the channel-name computers.** `computeChannelName` and `computeGroupDmName` exist, but
   `withProps` never matched them and they were never the single-DM header's path anyway.
4. **Find the channel in the arguments.** `renderChannelTitle` receives the already-computed title
   text and never learns which channel it belongs to.
5. **Use the currently-open channel** from `SelectedChannelStore` instead. This rewrote titles, but
   the wrong ones — placeholder names appeared on settings screens while the header stayed real,
   because the fallback supplies a channel for every call including navigation objects with no
   title at all.
6. **Rewrite the title going in** rather than the string coming out. Confirmed firing, and the
   header still showed the real name.

### What it actually does

`DMChannelName`, function 91654 in Discord Android 340.9:

```js
function DMChannelName({ userId, style }) {
    const name = useStateFromStores([RelationshipStore, UserStore], () => {
        let n = RelationshipStore.getNickname(userId)          // a string argument
        if (n == null) n = getName(UserStore.getUser(userId))  // an object argument
        return n ?? ""
    }, [userId])

    return jsx(LegacyText, { children: name, accessibilityRole: "header", … })
}
```

Group DMs go through `computeChannelName`'s `GROUP_DM` branch, which runs the same fallback once
per recipient:

```js
channel.recipients
    .map(id => UserStore.getUser(id))
    .map(user => user.isProvisional
        ? user.globalName
        : (RelationshipStore.getNickname(user.id) ?? getName(user)) ?? "???")
```

Three things follow, and between them they explain all six failures:

- **The header resolves a person, not a channel title.** Attempts 3–6 rewrote functions this path
  never calls, which is why attempt 6 could confirm the title prop was being replaced and still
  watch the real name render.
- **`getNickname` takes a bare id string**, unlike the rest of the family. `findUser` looks for an
  argument that is an object with an `.id`, so the hook bailed and passed the real nickname through.
- **`getNickname` is a method on a Flux store, not a module export.** `withProps('getNickname')`
  looks for a module whose exports carry that key; the store's methods are on a singleton behind
  the `Stores` proxy. `patches/dmHeader.ts` goes at the store directly.

The symptom that pinned all of this: in a group DM, exactly one name redacted. The recipient with a
friend nickname went through `getNickname` and was caught; the one without fell through to
`getName` and was not.

`user.isProvisional ? user.globalName` is a plain property read and cannot be hooked. Provisional
accounts in a group-DM header are still uncovered.

For reference, `BaseChannelName` — flagged by an early Metro sweep as the most promising candidate
— is real but belongs to the channel *list*: its module sits alongside `UnreadSetting`, `SELECTED`,
`LOCKED`, `MUTED` and `RELEVANT`.

## The chat bridge

The message list is not a React tree that can be re-rendered, which is why arming redaction leaves
what is already on screen untouched.

Rows cross into native exactly once, as the JSON argument to
`DCDChatManager.updateRows(tag, rowsJSON, isLoadingAtTop)`. After that they live in Kotlin, in
`ChatListManager`'s own `List<Row>`, and JS has no further say in what is displayed. `ChatModule`
exposes exactly two methods that change the screen — `updateRows` and `clearRows` — and
`updateRows` is a delta, not a repaint: every row carries a `changeType`
(`NOOP=0, INSERT=1, UPDATE=2, DELETE=3`) and an `index` that native splices into the list it
already holds.

This rules out the store-nudge approach that `lib/nudge.ts` originally used for the message list.
Even with every subscriber re-rendering, nothing crosses the bridge, because JS only pushes rows
that actually changed and none had. Switching channels works because it is the one thing that makes
JS push a complete list, which native takes through `createNewRows` — a whole-list replace —
instead of `modifyExistingRows`.

`lib/chatRows.ts` implements the repaint: mirror the row list on the JS side, then `clearRows(tag)`
and push the mirror back. The next batch after a clear takes the `createNewRows` path, where the
list is taken as given and only the order matters. That is deliberately the forgiving path, since
an `UPDATE`-at-index repaint would scramble the indices if the mirror were off by one. The batch
algorithm is a transcription of the decompiled `modifyExistingRows`, not an interpretation.

None of it runs yet, because the native module is never found. See Known bugs.

Three properties of the mirror, for whoever gets it working:

- **It holds unredacted rows**, so switching redaction *off* can also repaint without a channel
  switch. It is memory-only and dropped when the plugin stops, but it is a copy of the visible
  conversation.
- **It is only repainted once believed complete.** If redaction is armed while a channel is already
  open, the first batch seen is a delta, and adopting that as the whole list would replace a
  conversation with two or three rows. A mirror is trusted only if `clearRows` was observed
  emptying it first, or the batch adopted had the shape of a whole list. A false "fragment" costs a
  repaint; a false "complete" costs the conversation.
- **It is capped at 8 chat lists**, oldest evicted first.

`clearRows` also resets `SpoilerManager`, so revealed spoilers re-hide on a repaint.

## Where the field names come from

Two sources, and the distinction between them matters:

- **Discord's native deserializers**, from a jadx decompile of the APK
  ([molangning/reversing-discord](https://github.com/molangning/reversing-discord)). The generated
  `$$serializer` classes name every field the native side will accept — `ChatModule.java`,
  `ChatListManager.java`, `RowSerializer.java`, `MessageRow$$serializer`, `Message$$serializer`.
- **A row dump over `adb logcat`**, which shows what JS actually puts on the object.

These are not the same list, and assuming they were caused a wrong fix in 0.18.0. The native
schema named `tagText` / `tagType` / `connectionsRoleTag` as the badge fields and invented an
`avatarURLs` that does not exist on a real row; the fields actually populated are `clanTag`,
`clanTagGuildId` and `clanBadgeUrl`, which is what the original row dump had found all along.

**Use the deserializer for the wire protocol and the dump for what carries an identity.** The
decompile answered the bridge protocol and the DM header correctly; it is not authoritative about
the JS object.

A dump can only report fields populated on the row that got dumped, so it needs repeating
occasionally rather than trusting an old field list. Everything on a row this plugin does not
explicitly clear is in the picture by default, which is the argument for keeping **Verbose
logging**: the failure mode is silent.

Schema last read from Discord Android 340.9.

## The server-tag badge

`clanTag`, `clanTagGuildId` and `clanBadgeUrl` sit on every message row and render as a badge
beside the username, narrowing down which server someone belongs to.

0.16.0 cleared them and visibly broke the client; 0.17.1 reverted it and the breakage went away,
confirming the cause. The idea was right and the clearing was wrong: it assigned `""`, and an empty
string is not "absent" — `clanBadgeUrl: ""` is an image URI Discord tries to load. Absent values on
a real row are `null` or `undefined`, never `""`.

Clearing now writes `null`. That also removes the latent form of the same bug on
`avatarDecorationURL`, which only escaped it by usually being `null` already.

Working on device, behind **What gets covered → Hide server tags (experimental)**, off by default.
It stays opt-in because the failure mode is "the client visibly breaks" and the 0.16.0 diagnosis
was confident too. Turning it off reverts without a restart.

## The quick toggle

**Long-press any message → "Hide names" / "Show names".** Default since 0.5.0.

A sheet row is invisible until asked for, so unlike a button on screen it cannot end up in the shot
at all. It toggles, toasts, and closes the sheet so the screenshot can be taken immediately.

Deliberately the message sheet: Jump To Top already patches `ChannelLongPressActionSheet` and
`ForumPostLongPressActionSheet`, and stacking two plugins' rows into one sheet means debugging
someone else's insertion order.

### Finding the sheet without knowing its name

0.5.0 looked the sheet up by module name and found nothing. 0.6.0 stopped guessing: every action
sheet opens through `ActionSheetActionCreators.openLazy(sheetPromise, key, props)`, a typed API
whose `key` names the sheet, so hooking that finds the message sheet without knowing its module
name and records every key it sees.

Confirmed on device: the key is `MessageLongPressActionSheet` — which was 0.5.0's first module-name
guess. The module is not findable by that name; the sheet key is exactly it.

The row is injected by replacing `openLazy`'s promise with a derived one that resolves only after
the row has been added, so there is no race with Discord's own handler. If the resolved namespace
is frozen, the fallback hands back a copy whose `default` wraps the original.

Patching the sheet module and landing a row in it are different claims, and 0.6.0 reported the
first as if it were the second. The insertion was the untested part: `findActionGroups` matched
`node.type.name === "ActionSheetRowGroup"`, and a `React.memo()` wrapper has no `.name` of its own
(porting rule 3). 0.7.0 resolves component names through `name`, `displayName`,
`type.name`/`type.displayName` and `render.name`, matches any array containing a row group rather
than requiring it first, falls back to the sheet's own children array, and reports insertion
separately from the module patch.

### The floating button

0.3.0 put a round eye button over the chat which hid itself for 8 seconds when armed. It mounted
fine on `ChatView`, but the self-hide was a workaround for a placement that was wrong to begin
with: a control whose purpose is "make this screenshot safe to post" should not sit in the corner
of every shot and then sneak out of frame.

Still available behind **Quick toggle → Floating button over the chat**, off by default. Its
position is unverified — `bottom: 16` is measured from `ChatView`'s box, not the composer's, so it
may sit behind the message input.

`JumpToPresentButton` was never a candidate host: it only renders while scrolled up, so the toggle
would vanish exactly when you are at the bottom of a conversation about to screenshot it.

## Deliberate design choices

- **Off by default.** A plugin that silently rewrote every name in the app on install would be
  indistinguishable from a bug.
- **The alias map is never persisted.** A mapping that survived a restart would be a
  pseudonymisation table on disk — the artefact this plugin exists to avoid producing. It is
  cleared when the plugin stops, and by default whenever redaction is switched on, so numbers
  cannot be matched between two screenshots.
- **The placeholder avatar is keyed to the placeholder number, not the user id.** Discord derives
  the default avatar from the id; copying that would make the avatar a stable six-way fingerprint
  of the account across unrelated screenshots.
- **`block` style is fixed-width.** Varying it with the name would leak roughly how long the real
  names were; varying it with the index would leak how many distinct people are present.
- **Patches are installed once at start and gated per row**, rather than installed and removed as
  the toggle flips. Patching the chat path is the risky part, and doing it once on a cold app is
  safer than doing it repeatedly with the chat on screen.

## Debug tools

Under **Debug** in settings:

- **Verbose logging** — prints the generated row's field names to `adb logcat -s ReactNativeJS`.
  Key names and types only, never a value.
- **Probe name modules** — sweeps Metro's initialized modules and reports which ones export a name
  resolver, in what shape (`exports` vs `default`), and what the finder returns for each. This is
  what identified both `@mentions` bugs.
- **Diagnostics** — what got patched, how many rows were seen and redacted, and why any were
  skipped.

Every probe line is logged individually. Only the first line of a multi-line `console.log` carries
the `ReactNativeJS` tag, so batching them makes every continuation line invisible to a tag filter —
porting rule 5, which the earlier probe walked straight into: it reported 79 candidate modules and
printed none of them.

## Limits

This reduces what a screenshot gives away. It does not make one safe to post.

`@mentions` still show real names, and mentions are common in exactly the conversations worth
screenshotting. Message content is untouched, and content names people constantly — "thanks Sarah",
a pasted link with a username in it, a quoted email. Server and channel names are untouched.
Timestamps are untouched, and a timestamp plus a public channel is often enough to find the
original.

Redaction is purely local and purely visual: nothing is stripped from the message data, so anything
reading the underlying model rather than the rendered row still sees everything.
