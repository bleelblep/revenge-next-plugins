# Plugin ideas

Shortlist of plugins to build here. None of these exist on mobile — checked against the 166
entries in [Purple-EyeZ/Plugins-List](https://github.com/Purple-EyeZ/Plugins-List), which covers
the Vendetta / Bunny / Revenge Classic ecosystem.

Ordered easiest to hardest. "Proven" means an API this repo has already used successfully
on-device; "unknown" means it needs discovery before the work can be estimated properly.

---

## 1. Anti Ghost Ping — *easiest*

Log messages that pinged you and were then deleted: who, where, and what they said. Discord
tells you nothing when this happens.

- **Proven:** Flux subscriptions (`onFluxEventDispatched`), the `Stores` proxy, `jsonStorage`,
  settings sub-pages.
- **Unknown:** whether the deleted message is still in `MessageStore`'s cache when
  `MESSAGE_DELETE` dispatches. Likely yes if it was ever rendered; needs a one-line check.
- **Why it's easiest:** no render-path patching at all. Every crash in this repo's history came
  from patching something Discord renders — this plugin never touches that path.

## 2. Relationship Notifier

Tell the user when someone removes them as a friend, leaves a mutual server, or closes a group
DM. All things Discord deliberately hides.

- **Proven:** Flux subscriptions, `jsonStorage`, `ToastActionCreators`.
- **Unknown:** exactly which events fire (`RELATIONSHIP_REMOVE`, `GUILD_DELETE`, …) and whether
  a leave is distinguishable from a kick.
- **Shape:** keep a stored snapshot of relationships and mutual guilds, diff on change. More
  state management than #1, still no rendering.

## 3. Message Bookmarks

Long-press a message to save it locally with an optional note; browse and jump back to them from
a settings page.

- **Proven:** `jumpToMessage` (Jump To Top), action-sheet row insertion (Jump To Top),
  `jsonStorage`, settings sub-page routes ([removed] stage 2).
- **Unknown:** the *message* long-press action sheet module — Jump To Top patches the *channel*
  and *forum* ones, and that patch needed two attempts to find the row group.
- **Note:** overlaps with the existing **Local Pins** plugin. Worth checking what that does
  before starting.

## 4. Who Reacted

Show reactor avatars inline under a message without opening the reaction sheet.

- **Proven:** calling Discord's HTTP client correctly, including the relative-path rule that cost
  a debugging round in [removed].
- **Unknown:** the reaction row component, and this is a **render-path patch** — the category
  responsible for every on-device crash so far.
- **Watch:** avoid a second `instead` hook on whatever it patches (porting rule 2).

## 5. Data Saver

Stop images, GIFs and video auto-loading on mobile data; show a tap-to-load placeholder instead.
Discord has no per-connection control and nothing on either platform does this.

- **Blocker:** *there is no way to detect connection type.* `PluginApiExternals` exposes only
  Browserify, ReactNativeClipboard, ReactNativeSafeAreaContext, ReactNavigation and Shopify —
  no NetInfo, and nothing connectivity-related anywhere in the generated types.
- **Fallback:** ship it as a manual toggle ("don't load media") rather than automatic on mobile
  data. Still useful, much less magic.
- **Also unknown:** which component actually renders attachments.

## 6. Screenshot Redactor — *hardest, most distinctive*

A toggle that blurs usernames and avatars so a conversation can be screenshotted without
doxxing anyone. People screenshot far more on phones than on desktop and nothing does this.

- **Unknown:** everything. Requires temporarily rewriting a broad slice of the render tree —
  message headers, avatars, member list, the channel header — consistently and reversibly.
- **Why it's last:** highest payoff, but it's the deepest render-path work on the list, and that
  path has the worst track record here.

---

## Suggested order

**1 → 2 → 3**, then reassess. The first three need no unproven API and no render patching, so
they're the ones that can be finished rather than debugged. #4 is a reasonable first render-path
plugin since its blast radius is one component. #5 needs its scope cut before it's worth starting.
#6 deserves to be built once the rest are done.
