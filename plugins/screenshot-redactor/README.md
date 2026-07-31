# Screenshot Redactor

A toggle that replaces usernames and avatars with stable placeholders, so a conversation can be
screenshotted and shared without doxxing anyone in it.

The placeholders are *stable within a session*: the same person is "User 3" in the message
header, in a reply preview, and thirty messages further up. A screenshot of an argument or a
support thread is only worth sharing if you can still tell who said what, so blanking everyone
identically is offered but is not the default.

**Status: works, with two documented leaks.** Message authors, avatars and reply previews are
redacted on device, confirmed, and the long-press toggle works. The **DM header** and the
**server-tag badge** are not redacted — both are described below. Crop the header before sharing.

## How it works

Redaction happens on the *data* a message row is built from, not on the rendered React tree.
`RowManager.prototype.generate` flattens a message into the object the native row renderer
consumes — display name, avatar URL, reply preview — and rewriting fields on that object is the
same category of work as Show Tag, the one render-adjacent patch in this repo with no crash
history.

[`docs/plugin-ideas.md`](../../docs/plugin-ideas.md) originally scoped this plugin as "requires
temporarily rewriting a broad slice of the render tree", which is what made it the hardest idea on
that list. For the message list specifically that turned out to be false — `generate` already
collects everything identifying into one object. It was accurate for everything else: the header
defeated six attempts precisely because it *is* render-tree work.

Per porting rule 2, this plugin uses `before` + `after` and never `instead`: Custom Timestamps
already owns the one permitted `instead` on `generate`.

## Scope

Covered and confirmed on device:

- message author display names
- message author avatars and avatar decorations
- reply-preview names and avatars ("replying to X")
- a long-press toggle in the message menu

Hooked but not visually confirmed — the resolvers are patched, whether every surface routes
through them is untested:

- inline `@mentions`, the member list, profile sheets

**Not covered.** These still identify people while redaction is on:

- **the DM and group-DM header** — attempted six ways and abandoned; see below
- **the server-tag badge** beside usernames — attempted once, broke the client, reverted; see below

- typing indicators, toasts, and system messages
- server names and icons in the guilds bar
- anything the resolver patch turns out not to reach

## ⚠️ The DM header is NOT redacted — known bug, abandoned

**In a DM or group DM, the name at the top of the screen stays real.** Messages, authors, avatars
and reply previews are redacted; the header is not. Crop it before sharing.

Six attempts, removed in 0.17.0 rather than shipped half-working. The code lived in
`patches/channelName.ts` (deleted; recoverable from git history at 0.16.0).

### What was tried, and why each failed

1. **"The header is stage 2."** It says `#general` in a guild — but in a DM it says a person's
   name, so on the surface most likely to be screenshotted it was the single most identifying
   thing on screen. A wrong priority, not a missing feature.
2. **Hook the user-name resolver.** `useName` was found and hooked and did nothing, because a DM
   header doesn't resolve a *user* — it resolves a **channel**.
3. **Hook the channel-name computers.** `computeChannelName`, `computeGroupDmName` and friends
   exist — the Metro sweep found them in module 4321 — but `withProps` never matched them. Still
   unexplained, and they were never the header's path anyway.
4. **Find the channel in the arguments.** `renderChannelTitle` is called as
   `({title, headerTitle}, string)`: it receives the **already-computed title text** and never
   learns which channel it belongs to. No argument-shape handling could recover it.
5. **Use the currently-open channel** from `SelectedChannelStore` instead of the arguments. This
   worked in the sense that it rewrote titles — but the *wrong* ones. Placeholder names appeared
   on settings screens while the DM header stayed real, because the fallback supplies a channel
   for every call including navigation-options objects with no title at all.
6. **Rewrite the title going in** rather than the string coming out, so element-building call
   sites are covered too. Confirmed firing (`rewrote props for channel type=3, title=true`) —
   and the header still showed the real name.

### Where it stands

The resolver being hooked is real, is called on every header render, and its `title` prop *is*
being replaced — verified on device. The header still renders the original name. So something
downstream re-reads the name from another source, or the title is computed earlier and cached in
the navigation route, and neither was worth another round to chase.

**If someone picks this up**, the useful next step is not another resolver: it is finding the
component that actually draws the header text. The Metro sweep flagged these, none of which were
tried:

```
5526:  getHeaderTitle, HeaderTitle
9050:  GenericHeaderTitle, renderGenericTitle
11416: BaseChannelSubtitle, BaseChannelName
```

`BaseChannelName` is the most promising. Those return React elements, not strings, so they need
tree-walking rather than a return-value swap.

### A reporting artifact worth knowing about

Two consecutive runs hooked `renderChannelTitle` and then `getTabTitle`, each with the identical
signature, each reporting the other as unmatched. **These are the same function under different
names.** Identity-dedupe means whichever the finder reaches first claims it and the rest look like
failures. An "unmatched" name in such a log usually means "already hooked under another name" —
worth remembering before trusting a similar report elsewhere.

### The lesson that generalises

Attempts 2–4 each cost a release because the only channel back from the device was one sentence
in the settings page. Wiring up `adb logcat` and logging argument *shapes* answered in a single
run what three releases of guessing had not — and then found an unrelated live leak (the server
tag) that no amount of reasoning would have surfaced.

## How names are redacted, by layer

Three separate patches, because there is no single choke point:

| Surface | Patch | Mechanism |
| --- | --- | --- |
| Message authors, avatars, reply previews | `patches/rowManager.ts` | `RowManager.prototype.generate`, rewriting the flat row data |
| `@mentions`, member list, profile sheets | `patches/displayName.ts` | the shared user-name resolvers |
| DM / group-DM header | — | **not covered**, see below |

The user-name resolvers are no longer guesses. The Metro sweep found two modules exporting the
family, and `useName` alone was covering less than assumed:

```
3970: getName, useName, getGlobalName, getFormattedName, getUserTag, useUserTag
4320: getNickname, getName, useName
```

All seven are hooked. `getUserDisplayName`, guessed at in 0.3.0, does not exist anywhere and was
dropped.

## Settled on device

A diagnostics run on 0.3.0 — `1 RowManager patched. 217 rows seen, 185 redacted, 32 skipped
(32 row type). Row types seen: 1. Avatar fields found: avatarURL, avatarDecorationURL. Name
resolvers patched: useName (props). Toggle mounted on ChatView.` — answered most of the open
questions and exposed one bug.

- **There is only one `RowManager`.** `max: 10` found exactly one, so the "DMs use a second
  RowManager" theory was wrong. The `max` default of 1 was still a latent bug worth fixing.
- **The avatar field is `avatarURL`,** and the only ornament present is `avatarDecorationURL`.
  The other spellings this guessed at were never seen once and have been removed rather than
  carried on a path that runs a few hundred times per screenful.
- **The name resolver is `useName`,** found as a module property. This is the hook the DM
  header, inline `@mentions` and the member list should all resolve through.
- **The overlay host is `ChatView`.**

### The 32 skipped rows

`32 skipped (row type)` alongside `Row types seen: 1` is a contradiction: `noteRowType` only
records numbers, so those 32 rows had a **non-numeric** `rowType` — i.e. no row at all by the
time `after` ran.

**The alarm was wrong, and this is the correction.**

The theory was that `generate` re-enters itself for reply previews, letting an inner call consume
the single `pendingRow` slot shared by `before` and `after`, so the outer call bailed and left
15% of messages showing real names.

A later run with redaction on across 267 rows reported `Deepest nesting: 1` and **zero** `NO ROW`
— no re-entrancy, and no lost rows. The skipped rows were non-message rows carrying a
**non-numeric** `rowType`, which the old counter lumped in with genuine type mismatches while
`noteRowType` silently dropped them for not being numbers. That is why "32 skipped (row type)"
sat next to "Row types seen: 1" and looked like a contradiction: it was a reporting bug, not a
redaction failure.

What survives from that episode:

- `rowTypes` now records non-numeric values as text, so the contradiction cannot recur.
- `skippedNoRow` is counted separately from `skippedRowType` — a pairing bug in this plugin can
  no longer hide inside a normal skip.
- `skippedRowTypeWithAuthor` counts skipped rows that carried an author, which *would* be a real
  leak. It reads `LEAK:` in Diagnostics if it is ever non-zero.
- The stack replaced the single slot anyway: correct at any depth, costs nothing.

> **`show-tag` has the identical single-slot pattern** in `patches/rowManager.ts` and so has the
> same defect — it silently fails to append the handle on whatever fraction of rows are nested.
> Harmless there, and not fixed as part of this work, but it is the same bug.

## Open questions to settle on device

Diagnostics confirms what got *patched*. It cannot confirm what those patches actually did to the
screen, so these still need eyes on a device:

1. **Does the DM header actually redact now?** `useName` was found and hooked, but whether the DM
   title resolves through it — rather than reading the recipient off the channel object directly —
   is unknown. If the header still shows a real name while Diagnostics says `useName (props)`, the
   resolver is real but the header doesn't use it, and the header needs its own patch after all.
2. **Does the long-press row appear?** The sheet is found and patched; what's unproven is the
   insertion. Long-press a message and read **`Row insertion:`** in Diagnostics — it now says
   which strategy landed, or names the failure. If it says the children fallback was used, the
   row is on screen but probably in the wrong section. If it fails outright, `Sheet contains:`
   lists the component names in the tree, which is what the next attempt should aim at.
3. **Whether the re-render nudge reaches the row cache.** The message list is virtualised and rows
   are generated once, so toggling redaction on may leave what's already on screen unredacted —
   the worst possible failure for this plugin. `lib/nudge.ts` calls `emitChange` on the stores the
   chat subscribes to, which is the trick that works for the guilds bar in Hide Servers, but
   `RowManager` may cache above that level. If it doesn't take, the toast already tells the user
   to reopen the channel; the real fix is finding and clearing `RowManager`'s own cache.
4. **After-chain ordering vs Show Tag.** This hook overwrites `generated.username`; Show Tag
   appends the real `@handle` to it. Whichever `after` runs last wins. The hook registers at
   `HookPriority.LOWEST` meaning "run after everyone else" — but whether the patcher orders the
   after-chain that way is a guess. Test with both plugins on: if handles reappear, flip that
   line to `HIGHEST`.
5. **Whether `rowType !== 1` skips anything that matters.** Only `1` has ever been observed, so
   the gate currently costs nothing — but system messages and join notices name people too, and
   if they arrive under a type that has simply not been scrolled past yet they are missed
   silently.

## The quick toggle

**Long-press any message → "Hide names" / "Show names".** Default since 0.5.0.

A sheet row is invisible until asked for, so unlike a button on screen it cannot end up in the
shot at all. It toggles, toasts, and closes the sheet so the screenshot can be taken immediately.

Deliberately the *message* sheet: Jump To Top already patches `ChannelLongPressActionSheet` and
`ForumPostLongPressActionSheet`, and stacking two plugins' rows into one sheet is how you end up
debugging someone else's insertion order.

### Finding the sheet without knowing its name

0.5.0 looked the sheet up by module name and found nothing — all three guesses
(`MessageLongPressActionSheet`, `MessageActionSheet`, `MessageLongPressSheet`) missed, and only
the channel and forum names are actually known here, from Jump To Top.

0.6.0 stops guessing. Every action sheet in the app opens through
`ActionSheetActionCreators.openLazy(sheetPromise, key, props)` — a typed, confirmed API whose
`key` names the sheet — so hooking that finds the message sheet without knowing its module name,
and **records every key it sees**. If the match is still wrong, Diagnostics now just tells you
the real name after one long-press instead of costing another release.

The row is injected by replacing `openLazy`'s promise with a derived one that resolves only
after the row has been added, so there is no race with Discord's own resolution handler. If the
resolved namespace turns out to be frozen and the patcher can't write to it, the fallback hands
back a copy whose `default` wraps the original.

Confirmed on device: the key is **`MessageLongPressActionSheet`** — which was 0.5.0's *first*
module-name guess. The module simply isn't findable by that name, while the sheet key is exactly
it.

### Patched ≠ visible

0.6.0 reported "Menu row attached to MessageLongPressActionSheet" while no row was on screen,
because that message was emitted when the sheet *module* got patched — not when a row actually
landed in it. Two different claims, and reporting the easy one as if it were the hard one is
worse than reporting nothing.

The insertion itself was the untested part. `findActionGroups` was matching `node.type.name ===
"ActionSheetRowGroup"`, copied from Jump To Top's channel sheet — and **a `React.memo()` wrapper
has no `.name` of its own**, the trap that already forced staff-tags to hand-build a filter for
`UserRow` (porting rule 3). 0.7.0:

- resolves a component's name through `name`, `displayName`, `type.name`/`type.displayName`
  (memo) and `render.name` (forwardRef);
- matches any array *containing* a row group rather than requiring it in first position, since
  the message sheet may lead with a header or reaction picker that the channel sheet doesn't
  have;
- falls back to the sheet's own children array — a row in an odd visual position beats a feature
  that silently doesn't exist;
- reports **`Row insertion:`** separately from the module patch, naming the failure when it
  fails, and dumps the sheet's component names when nothing matches at all.

### The floating button, and why it stopped being the default

0.3.0 put a round eye button over the chat, which hid itself for 8 seconds when armed so it
wouldn't be in the picture. It mounted fine (`ChatView`, confirmed on device) — but that
self-hide was a workaround for a placement that was wrong to begin with. A control whose entire
purpose is "make this screenshot safe to post" should not be parked in the corner of every shot
and then have to sneak out of frame.

It's still there behind **Quick toggle → Floating button over the chat**, off by default. Its
position is also unverified: `bottom: 16` is measured from `ChatView`'s box, not the composer's,
so it may sit behind the message input.

`JumpToPresentButton` was never a candidate host, beyond being another plugin's surface: it only
renders while you're scrolled up, so the toggle would vanish exactly when you're at the bottom of
a conversation about to screenshot it.

## Deliberate design choices

- **Off by default.** A plugin that silently rewrote every name in the app on install would be
  indistinguishable from a bug.
- **The alias map is never persisted.** A mapping that survived a restart would be a
  pseudonymisation table sitting on disk — exactly the artefact this plugin exists to avoid
  producing. It is also cleared when the plugin stops, and by default whenever redaction is
  switched on, so numbers can't be matched up between two screenshots.
- **The placeholder avatar is keyed to the placeholder number, not the user id.** Discord derives
  the default avatar from the id; copying that would make the avatar a stable six-way fingerprint
  of the account across otherwise-unrelated screenshots.
- **`block` style is fixed-width.** Varying it with the name would leak roughly how long the real
  names were, and varying it with the index would leak how many distinct people are present.
- **The patch is installed once at start and gated per-row**, rather than installed and removed
  as the toggle flips. Patching `RowManager` is the risky part; doing it once on a cold app is
  safer than doing it repeatedly with the chat on screen. When redaction is off the hook does one
  property read and returns.

## ⚠️ The server-tag badge is NOT redacted — second known leak

`clanTag`, `clanTagGuildId` and `clanBadgeUrl` sit on every generated message row and render as a
badge beside the username. A server tag narrows down which server someone belongs to, so it goes
into every screenshot this plugin makes.

0.16.0 cleared them and **visibly broke the client**; 0.17.1 reverted it and the breakage went
away, confirming the cause.

**The idea is right, the clearing strategy is wrong.** `redactAvatars()` clears by assigning
`""`, and an empty string is not "absent" — `clanBadgeUrl: ""` is an image URI Discord will try
to load. On the observed row, absent values were `null` (`avatarDecorationURL`) or `undefined`
(`roleIcon`, `lobbyTagIconUrl`), never `""`. `avatarDecorationURL` gets away with `""` only
because it is usually already `null`, so the `typeof === "string"` guard means that branch almost
never runs — the bug was there all along and the clan fields were simply the first ones that
actually exercised it.

Note this also makes the surviving `ORNAMENT_KEYS = ["avatarDecorationURL"]` suspect: on a row
where that field *is* a string, it will be set to `""` and hit the same path.

**To retry:** switch the clearing to `undefined` (or `null`), verify `avatarDecorationURL` still
behaves, then add the clan fields one at a time.

How it was found is the part worth keeping: **by dumping a whole row over `adb logcat` and
reading it**, not by reasoning, and not by any of this plugin's own diagnostics — those only ever
check fields whose names were already known. Everything on that row this plugin does not
explicitly clear is in the picture by default. That is the argument for keeping the `Verbose
logging` switch: the failure mode is silent, and the only defence is periodically looking at the
whole row instead of the parts already accounted for.

## Limits worth being honest about

This reduces what a screenshot gives away. It does not make one safe to post.

**The DM header still shows the real name** — that is the big one, and it is documented above.
In a DM, that header is often the single most identifying thing on screen. Crop it.

Message *content* is untouched, and content names people constantly — "thanks Sarah", a pasted
link with a username in it, a quoted email. Server and channel names are untouched. Message
timestamps are untouched, and a timestamp plus a public channel is often enough to find the
original. Redaction is also purely local and purely visual: nothing is stripped from the message
data, so anything that reads the underlying model rather than the rendered row still sees
everything.
