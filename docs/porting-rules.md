# Porting rules

Rules for writing or debugging plugin code in this repo. Every one of them cost at least one
on-device crash to find, and none of them are documented upstream — they were traced through
[revenge-bundle-next](https://github.com/revenge-mod/revenge-bundle-next)'s own source and
confirmed against [PalmDevs](https://github.com/PalmDevs)' working plugins.

Read this before touching a plugin.

## 1. Never touch `revenge.*` at module scope

The single most important rule here. It was the real cause of the "settings pages crash the
whole Settings screen" bug that this repo spent a long time misdiagnosing.

Note this rule is specific to **external** plugins. PalmDevs'
[revenge-next-plugins](https://github.com/PalmDevs/revenge-next-plugins) reads `Design` at module
scope quite happily — those are *internal* plugins, compiled into the bundle via
`registerInternalPlugin` and loaded as ordinary Metro modules on demand. Ours are external: loaded
from a zip and evaluated through `new Function` at preInit. Same code, different moment. Don't
copy their module-scope patterns.

A plugin's entire bundle is evaluated during **preInit** — revenge-bundle-next's
`createOptionsFactory` (`lib/plugins/src/_internal/external-plugins.ts`) runs the script
through `new Function('revenge', 'plugin', 'return ' + script)`, reached from `preinit.ts` →
`preInitPlugin` → `resolvePluginOptions`. That is long before Discord's UI modules exist.

`revenge.discord.design.Design` and `revenge.discord.flux.Stores` are lazy proxies backed by
`lookupModule`. On a full-scope miss, `lookupModule` calls `cacheFilterNotFound(key)`
(`lib/modules/src/finders/lookup.ts`), and every later lookup of that key short-circuits to
NotFound. The key for Design is the *shared* `'revenge.discord.design.Design'` — the same one
Revenge's own settings UI uses. So a single module-scope line like

```ts
const { TableRowGroup } = revenge.discord.design.Design   // ❌ runs at preInit
```

doesn't just break the plugin — it breaks Design app-wide, which is why the entire Settings
screen went down rather than only the plugin's own page. Worse, `cacheFilterNotFound` writes
into `cache.finds`, which the next unrelated `cacheFilterResultForId` flushes to the native
on-disk module cache, so the poisoning **survives app restarts** until the cache version bumps.

Read these inside render functions or lifecycle callbacks instead (which is what PalmDevs'
own plugins do), or behind a memoized `lazy()`/`once()` wrapper:

```ts
export default function Settings({ api }) {
    const { TableRowGroup } = revenge.discord.design.Design   // ✅ runs at render
    ...
}
```

The same applies to `revenge.react.ReactNative` and `revenge.assets`: those are ESM live
bindings that are still `undefined` at preInit, so destructuring them at module scope captures
`undefined` forever.

**Grepping for `const … = revenge.` is not enough.** Three variants in hide-servers-drawer had
no `revenge.` on the line at all:

- `getAssetIdByName("FolderIcon")` **called** at module scope. `revenge.assets` is a plain
  object and safe to *read* early, but the asset registry isn't populated at preInit, so the
  result was `undefined` and frozen that way in a `const` for the whole session.
- `React.memo(Component)` at module scope. `revenge.react.React` is an ESM live binding that may
  still be `undefined` at preInit, so this throws inside `optionsFactory()` — failing the entire
  plugin before `start()` runs. This was almost certainly what bootlooped the app. Build the memo
  on first render into a module-level holder instead, so the component type stays stable from
  render 2 onward and memoisation still works.
- `StyleSheet.create({…})` at module scope. React Native accepts plain style objects; use one.

The general form: anything **derived from** a `revenge.*` value at module scope is suspect, not
just the destructure itself.

`revenge.modules.finders.getModules` at module scope is the one safe exception — it scopes its
internal lookup to already-initialized modules, and `cacheFilterNotFound` only fires on
full-scope lookups. It still leaks a subscription that's never cleaned up on stop, so prefer
not to.

This also explains why dropping `SettingsComponent` appeared to fix Staff Tags: removing the
`import Settings from "./ui/pages/Settings"` let Rollup tree-shake the file out, taking its
module-scope destructures with it. The settings API was never the problem.

**If you're testing a build that already hit this, clear Revenge's module cache first** — the
bad entry is likely still on disk, and a correct build will look just as broken without it.

Confirmed on-device: moving these reads into render functions restored the settings pages on all
five plugins, with no change to how `SettingsComponent` is registered.

## 2. The patcher's hook contracts differ from classic Revenge/Vendetta's

Check each one against `lib/patcher/src/` rather than assuming.

- **`before`'s hook must return the args array.** `applyHooks`
  (`lib/patcher/src/_internal.ts`) does `arg = hook(arg)` with no `?? arg` fallback, so
  returning nothing silently sets args to `undefined` for every later hook on that method.
  In Custom Timestamps this fed `undefined` to an `instead` hook on the same method, whose
  `original(...args)` threw `TypeError: Cannot convert undefined value to object` from Hermes'
  `arraySpread` and took down the entire ChatView. Return the args **outside** your `try`, so
  they survive a throw in the hook body.
- **`after`'s hook only receives the return value**, not the original args. Code written
  against the classic `(args, ret)` convention needs `instead` + the original call instead.
  Its return value is assigned the same unconditional way, so return the result on every path.
- **When patching a prototype method, forward `this`.** Use a plain `function`, not an arrow,
  and `Reflect.apply(original, this, args)`, not `original(...args)`:

  ```ts
  revenge.patcher.instead(RowManager.prototype, "generate", function (this: any, args, original) {
      const ret = Reflect.apply(original, this, args)   // ✅ receiver preserved
      ...
  })
  ```

  The apply trap invokes your hook via `Reflect.apply(hook, receiver, [args, original])`, so the
  correct receiver *is* handed to you — an arrow just discards it. Getting this wrong ran
  Discord's `RowManager.generate` with `this === undefined` and surfaced as
  `TypeError: Cannot read property 'options' of undefined` thrown from Discord's own code,
  several frames below ours.
- **Never assume a captured `original` is callable.** A `getModules` match can fire on
  partially-populated exports; guard with `typeof original !== "function"`.
- **`onFluxEventDispatched` is a patch, not a listener — return the payload.** Whatever the
  handler returns *becomes* the dispatched payload, and a falsy return **cancels the event**.
  Merely observing an event therefore requires `return payload`. A `CONNECTION_OPEN` handler that
  returned nothing silently swallowed the event and would have broken Discord's own connection
  handling. Same shape as the `before` contract above: these APIs are transformers that look like
  callbacks.
- **Only one `instead` hook per method, repo-wide.** A second one can infinitely recurse
  depending on what else is patched — this is an upstream bug, see below.

When a patch throws about spreading `undefined` or a missing property on `this`, suspect a
*sibling* hook on the same method before suspecting the hook that threw.

### The two-`instead` recursion bug

`hooks/instead.ts` captures each hook node's fallback target at patch time:

```js
const target = parent[key]   // the PROXY, if any patch already exists
hookNode.target = target
```

`patchedFunctionProxyHandler.apply` correctly falls back to `state.target` (the real original),
so a lone `instead` hook is fine. But `insteadHookProxyHandler.apply` — which only runs when a
node is reached via another node's `next.proxy`, i.e. only with two or more hooks — falls back
to `hookNode.target`. For any hook registered after a proxy already existed, that *is* the
proxy, so the tail of the chain calls back into the head:

| Step | Result |
| --- | --- |
| Plugin A `before()` | creates `proxy1`, `state1.target = origFn` |
| Plugin A `instead()` | captures `hookNodeA.target = proxy1` ⚠️ |
| Plugin B `instead()` | becomes chain head; A becomes tail |
| call | `proxy1` → B's hook → `hookNodeA.proxy` → A's hook → `hookNodeA.target` = `proxy1` → ∞ |

Symptom is `RangeError: Maximum call stack size exceeded`, with the stack alternating between
two plugin frames and two different `apply (Revenge:…)` offsets.

**The precondition is narrower than "two `instead` hooks".** At equal priority a new hook becomes
the chain *head*, so the tail is the first-registered `instead` — and only the tail's captured
target is ever used. Two `instead` hooks and nothing else are therefore fine: the first was
registered while `parent[key]` was still the raw function. The bug needs the first `instead` to
have been registered against an **already-proxied** function, i.e. a `before` or `after` hook
came first (exactly what Custom Timestamps does). A later, lower-priority `instead` sorting to
the tail triggers it too.

That precondition is easy to lose track of across plugins, so the rule above stays absolute:
one `instead` per method, repo-wide.

`before` and `after` chains are plain linked lists with no per-node target capture, so they
compose safely and any number of them can coexist. When a method already has an `instead` hook
somewhere in this repo, use `before` + `after` instead — stash what you need from the args in
`before` and apply it in `after`. `generate` is never re-entered, so a single module-scoped
"pending" slot between the two is safe. `show-tag/src/patches/rowManager.ts` does exactly this
because `custom-timestamps` already owns the `instead` on `RowManager.prototype.generate`.

Worth reporting upstream; not fixed as of revenge-bundle-next `0f75551`.

## 3. Module lookups

- `lookupModule`/`lookupModules` are one-shot: they see only what is initialized when they run,
  and a chat or member-list module often isn't, even from `start()`. Pair them with
  `waitForModules`, or use `getModules` — but read the `max` note below before reaching for
  `getModules`.
  A miss is cached permanently only for **full-scope** filters (`cacheFilterNotFound` sits behind
  `if (includeAll)` in `lib/modules/src/finders/lookup.ts`). `withProps`/`withName` default to
  `FilterScopes.Initialized` and never reach it; `withDependencies` and the keyed lazy proxies in
  rule 1 do, which is where the poisoning in rule 1 actually comes from.
- A hand-built filter must implement a `.scope(...)` **method**, not just a `.scopes` property.
  `getModules`/`lookupModule` call it as a function internally, and a filter missing it throws
  immediately, silently, every time.
- `React.memo()`-wrapped components can never be matched by `filters.withName` — memo wrappers
  have no `.name` of their own. The member-list patch (`staff-tags/src/patches/details.tsx`)
  needed a hand-built filter to catch `UserRow` for this reason.

### The export is usually on `default`, not on the exports object

`withProps('getName')` matches a module, and then `mod.getName` is `undefined` — the function is at
`mod.default.getName`. A device probe over Discord 340.9 shows the shape plainly:

```
1214.getName: exports=undefined default.getName=function
```

Always check both:

```ts
const host = typeof mod?.[key] === "function" ? mod : mod?.default
if (typeof host?.[key] !== "function") return
```

This is the most expensive bug in this repo's history. `screenshot-redactor` has claimed to hook
seven name resolvers since 0.3.0 and hooked exactly one — the only one that happens to be its own
module, caught by a different finder that does look at `.default`. Six attempts at the DM header,
plus the member list and profile sheets, were all debugging a hook that never existed. The
plugin's own Diagnostics page reported the resolvers as patched throughout, because it recorded
intent rather than outcome.

(`@mentions` were on that list too, for fifteen releases, and did **not** belong on it — they are
row data, not resolved names. See the note at the end of this rule.)

**Log the outcome of a hook, not the attempt.** One `console.log` on successful registration would
have caught this years earlier than a settings page that says "patched".

This was cause one of two. Fixing it did not make the hook install, because the *finder* was also
wrong — see the `max` note below. Both had the same signature from the outside ("the resolver list
is empty"), which is why the first fix looked like it had failed rather than like it had revealed
the next layer.

### `getModules`' `max` is shared between its lookup half and its subscription half

This was filed as "`getModules` and `lookupModules` do not agree — unresolved" for two releases.
They agree fine. What was observed was:

```
lookupModules(withProps('getName'))            -> 26 modules
getModules(withProps('getName'), cb, {max:25}) -> the module we wanted never arrives
```

`getModules` (`lib/modules/src/finders/get.ts`) is a lookup over already-initialized modules
followed by `waitForModules` for the rest, and **one `max` counter runs through both**:

```js
for (const [exports, id] of lookupModules(lookupFilter, options)) {
    handleModule(exports, id)
    if (!--max) return noop          // ← subscription never created
}
const unsub = waitForModules(filter, (exports, id) => { … }, options)
```

`getName` is an unremarkable export name; 26 initialized modules already had one at `start()`, so
the lookup spent all 25 slots and returned before subscribing. The callback *did* fire, 25 times,
on modules whose `getName` is not a function — and the plugin's callback returned silently on each,
so from the outside it was indistinguishable from a callback that never fired.

Three rules follow:

- **`max` is a budget for the whole call, not a cap on the subscription.** Raising it makes this
  more likely, not less: a bigger budget means more junk consumed before the wait is set up.
- **Log the outcome inside the callback, not just at registration.** "Called and skipped" and
  "never called" are the same picture otherwise. See rule 3's note above — this is the same
  lesson one level down, and it cost the same plugin another two releases.
- **When you need every match, use `lookupModules` + `waitForModules` yourself.** That is what
  `getModules` does, minus the shared counter:

  ```ts
  for (const [exports, id] of lookupModules(withProps(key))) onModule(exports, id)
  const unsub = waitForModules(withProps(key), onModule)
  ```

  Safe from rule 3's miss-caching: `withProps`/`withName` default to `FilterScopes.Initialized`,
  and `cacheFilterNotFound` only runs on the `FilterScopes.All` branch. The permanent-miss warning
  applies to full-scope filters (and to the keyed lazy proxies in rule 1), not to these.

### Better: ask for the module by its source path

`revenge.discord.utils.finders.getModuleWithImportedPath(path, cb)` — and its `lookupModuleWith…`
and `waitForModuleWith…` siblings — resolve a module by the path Discord's own bundle records:

```ts
revenge.discord.utils.finders.getModuleWithImportedPath('utils/UserUtils.tsx', (exports, id) => { … })
```

It is a `Map<path, id>` lookup plus a `fileFinishedImporting` subscription
(`lib/discord/src/utils/modules/finders.ts`). No filter, no result cache, no `max`, no
`cacheFilterNotFound`, it hands back the whole namespace rather than unwrapping `default`, and it
unsubscribes itself — imported paths are unique, so there is nothing to disambiguate.

Prefer it whenever the target is a Discord source file rather than a shape. The paths are visible
in the Hermes bundle as the argument to `fileFinishedImporting` at the end of each module factory
(see rule 5), so finding one is the same disassembly you were going to do anyway, and the result
is an exact name instead of a property guess. `screenshot-redactor` reaches both
`utils/UserUtils.tsx` (every display-name resolver) and `utils/AvatarUtils.tsx` (every avatar URL)
this way; the second closed the DM-header avatar leak that five releases of `withProps` guessing
had not.

**A working finder is not a fix.** The same plugin spent fifteen releases hooking name resolvers
to redact inline `@mentions`, hit both bugs above on the way, fixed both — and mentions still
showed real names, because a mention in a rendered message is row data and never calls a resolver
at all. Getting the module was the easy half. Confirm the surface you care about actually goes
through the thing you hooked, ideally before hooking it: one grep of the native `$$serializer` for
the field would have settled it in a sitting.

Paths move less often than module ids and much less often than export shapes, but they do move —
keep a prop sweep behind it as a fallback, and report which one answered.

### Native modules are not reachable through `revenge.react.ReactNative`

`revenge.react.ReactNative.NativeModules.DCDChatManager` returns nothing, at `start()` and on
every retry afterwards, even though Discord's own code calls plain
`NativeModules.DCDChatManager`. `globalThis.nativeModuleProxy` and `__turboModuleProxy` are also
empty, and `getModules(withProps('DCDChatManager'))` does not match. Still unsolved — it is why
`screenshot-redactor`'s message-list repaint does not run.

`hide-servers-drawer/src/lib/reload.ts` reaches `BundleUpdaterManager` through that same path, so
the access pattern is not wrong in general.

## 4. APIs that don't exist

Guessed by analogy with classic Revenge, and confirmed absent from revenge-bundle-next's source:

| Guessed | Reality |
| --- | --- |
| `revenge.discord.common.chroma` | Doesn't exist — self-contained brightness calc instead |
| `revenge.discord.common.moment` | Doesn't exist — self-contained date formatter (`custom-timestamps/src/lib/renderTimestamp.ts`) |
| `revenge.utils.react.findInReactTree` | Doesn't exist — local implementation (`staff-tags/src/lib/findInReactTree.ts`) |
| `filters.withStoreName` / `withTypeName` / `withPredicate` | Don't exist — Flux stores come from the `revenge.discord.flux.Stores` proxy |
| `revenge.discord.design.RawColors` | Doesn't exist — `@revenge-mod/discord/design` exports only `Design` and `FormSwitch`. Use literal hex |
| `revenge.discord.design.Tokens` | Wrong namespace — `Tokens` is on `revenge.discord.common`, and is typed `any` |
| `revenge.discord.haptics` | Doesn't exist at all. No haptics API is exposed to plugins |
| `revenge.discord.common.Constants.Permissions` | Doesn't exist — hardcode the permission bits |

### `Constants.Permissions` is the cautionary one

It broke Staff Tags in a way that looked like a *partial* failure rather than a missing API, which
is why it survived for so long. The code computed a correct permission bitmask, then mapped it
against `revenge.discord.common.Constants?.Permissions ?? {}` — an empty object — producing zero
permission names. Every permission-based tag (ADMIN, STAFF, MOD, VC Mod, Chat Mod) silently
disappeared, while OWNER and WEBHOOK kept working because those are the only two driven by a
`condition` rather than a permission.

Two lessons:

- **`?.` plus a `?? {}` fallback turns a missing API into a silent wrong answer.** The plugin had
  no way to complain: an empty permission list is indistinguishable from "this user has no
  permissions". Prefer failing loudly, or log once when a lookup that should always succeed
  doesn't — `getTag.ts` now does the latter.
- **Don't ask Discord for values that are part of its public API.** Permission bits cannot change
  without breaking every bot on the platform, so `PERMISSION_BITS` in `staff-tags/src/lib/getTag.ts`
  hardcodes the twelve it needs. No lookup, nothing to go stale.

Found by logging one line to `adb logcat` — see the note on tooling below.

The last three were found by adopting the official types (see below), not on-device — every one had
been sitting behind `?.` and a fallback, silently doing nothing.

## 5. Read the app instead of guessing

### Offline first: the APK answers most "which module / what shape" questions

Added after the DM header — six on-device attempts over as many releases, then answered in one
sitting with no device attached. Reach for these *before* writing another probe:

- **Native side.** [molangning/reversing-discord](https://github.com/molangning/reversing-discord)
  is a jadx decompile of the APK, browsable with `gh api repos/…/contents/<path>` under
  `apk/extracted/_base.apk/sources/`. Anything serialized across the JS/native bridge has a
  kotlinx `$$serializer` whose `pluginGeneratedSerialDescriptor…("field", …)` calls list **every
  JSON field name**. `com/discord/chat/bridge/Message$$serializer` gave Screenshot Redactor the
  complete message schema at once, where its own row dumps had been finding fields one at a time
  and silently missing the rest — a dump can only report fields that happened to be populated on
  the row that got dumped.
- **JS side.** Pull the APK off the device so the version matches what you are debugging —
  the copy in `Documents/android` was three releases behind the installed build, which is enough
  for function ids to move:

  ```sh
  adb shell pm path app.revenge          # Discord, repackaged by Revenge
  adb pull <path>/base.apk
  unzip -o base.apk assets/index.android.bundle
  ```

  That bundle is Hermes bytecode (v96), and `pip install hermes-dec` parses it:

  ```py
  r = HBCReader(); r.read_whole_file(open(bundle, "rb"))   # ~17s, 126k functions
  r.strings.index("BaseChannelName")                        # does this name exist at all?
  r.strings[fh.functionName] for fh in r.function_headers   # 69k named functions — a real index
  parse_hbc_bytecode(r.function_headers[fid], r)            # disassembly, with strings resolved
  ```

  Keep the file handle open — the reader seeks lazily and a closed buffer throws.

  The function-name index is the single most useful artifact: grepping it for `Header` found
  `PrivateChannelHeader` and `DMChannelName` immediately. Disassembling `DMChannelName` then
  showed the DM header resolves `RelationshipStore.getNickname(userId)` and renders it through
  `LegacyText` — so it never touches a channel title, which is why four separate attempts at
  `renderChannelTitle` and `computeChannelName` all "fired" and changed nothing.

### The decompile and the device answer different questions

The native `$$serializer` classes list every field the native side will **accept**. That is not the
same as what JS actually **puts on the object**, and treating them as interchangeable produced a
wrong fix: the schema named the server-tag fields `tagText`/`tagType`/`connectionsRoleTag` and
invented an `avatarURLs` that no real row carries, while the fields actually populated were
`clanTag`/`clanTagGuildId`/`clanBadgeUrl` — which a row dump had already found.

Use the deserializer for the wire protocol and a `console.log` row dump for what carries an
identity. The decompile is authoritative about the bridge and about component internals; it is not
authoritative about the shape of a live JS object.

### On-device, when you actually need runtime state

`console.log` reaches `adb logcat` under the `ReactNativeJS` tag. This is by far the fastest way
to answer "which module is it / what shape are these arguments / what is actually on this object",
and it was underused for a long time in favour of surfacing one fact at a time through a plugin's
settings page.

```sh
adb logcat -c                       # clear first; this device writes ~8k lines/minute
adb logcat -G 32M                   # the default ring buffer rotates in under a minute
adb logcat -s ReactNativeJS:I       # filter by tag at the source
adb reverse tcp:8087 tcp:8087       # let the phone reach `node serve.mjs` over USB
adb push dist/<id>.zip /sdcard/Download/
```

Two traps, both hit in practice:

- **Filter by tag, not by grepping for your prefix.** A multi-line `console.log` continues on
  lines that do *not* repeat the tag, so `| grep MyPlugin` silently drops everything after the
  first line.
- **Capture continuously, don't dump afterwards.** The buffer rotates fast enough to lose output
  between a repro and reading it. Also note `adb reverse` disappears when the device drops off
  USB, and the repo URL then just fails to load.

Worth building into a plugin while investigating:

- a **Metro sweep** that walks initialized module ids and prints exports matching a pattern —
  `plugins/screenshot-redactor/src/lib/probe.ts`. This is how `useName`, `renderChannelTitle` and
  the channel-name helpers were found after several releases of guessing names.
- a **shape dump** of whatever object you are rewriting, logging key names and types but never
  values. This is how Screenshot Redactor found the `clanTag` / `clanBadgeUrl` fields it had been
  leaking — nothing that checks only for fields you already know about can ever find those.

## 6. `jsonStorage.set()` merges, and a merge can never delete a key

`set(value: DeepPartial<T>)` recursively **merges** into storage; it does not replace it (there
is a separate `replace: true` overload, but that requires the whole top-level shape and applies
at the top level only, not to one nested key). A merge can add or overwrite a key. It cannot
remove one — a key that's simply absent from a patch is indistinguishable from a key nobody
touched, so omitting it is a silent no-op, not a deletion.

This broke Hide Servers 1.3.2 in a way that looked like a *plausible* bug for a while: hiding a
server persisted correctly, but un-hiding one didn't survive a relaunch. The code rebuilt its
`hidden: Record<string, true>` object fresh from an in-memory `Set` on every write, and simply
left an unhidden id out of that object. Under merge semantics that did nothing — the id's stale
`true` entry sat untouched in storage and came back on every reload. Hiding worked, because
adding a new key is exactly what a merge is good at; only removal was ever going to be broken,
because removal is the one thing this API structurally cannot express through omission.

The fix (`plugins/hide-servers-drawer/src/lib/hidden.ts`) is to never rely on omission: send an
explicit `false` for a removed key instead of dropping it from the patch, and treat `false` as a
tombstone on read (`=== true`, not "key present"). Any plugin storing a *removable* collection —
a Set of ids, a list of entries — under `jsonStorage` needs the same treatment; a plain object
keyed by presence will only ever grow.

## 7. Use the official types, not guesses

`types/next/` is the **generated** type surface from revenge-bundle-next (`bun types` ->
`dist/types`), vendored. `types/globals.d.ts` declares the two globals an external plugin gets
(`plugin()` and `revenge`), mirroring that repo's own `types/globals.consumers.ts`.

This replaced a hand-written `types/revenge.d.ts`. Adopting the real types immediately found the
three phantom APIs above plus a genuine latent crash: `jsonStorage.cache` and `use()` are both
possibly-`undefined`, because `load: true` calls `get()` **without awaiting it**. Every read now
falls back to that plugin's exported `DEFAULTS`.

Some surfaces are legitimately untyped and need `as any` — Discord's own Flux store methods
(`Stores.GuildStore.getGuild`), and finder results where `returnNamespace` isn't inferred. Cast at
the destructure point, not at each use.

## 8. A filtered store getter can feed Discord's *write* path, not just rendering

Hide Servers corrupted the account's server order account-wide (desktop and web included)
without ever writing to a Discord store. The mechanism, traced through the 337.10 bundle
with hermes-dec (rule 5):

- Drag-to-reorder ends in `performMove` → `GuildActionCreators.moveById(sourceId, targetId, …)`
  → `GUILD_MOVE_BY_ID` → `SortedGuildStore.handleMoveById`, which resolves both ids against
  the store's **internal** tree (`tree.getNode`) and calls `moveNextTo`/`convertToFolder`/
  `moveInto`. Id-based, on complete data — an `after` filter on the public getters never
  touches this. The optimistic reorder itself was never the problem.
- The persist that follows is: `persistAndAnnounce()` →
  `saveGuildFolders(SortedGuildStore.getCompatibleGuildFolders())` →
  `PreloadedUserSettingsActionCreators.updateAsync("guildFolders", …)`. The plugin filtered
  `getCompatibleGuildFolders`, so the snapshot that got persisted was missing every hidden
  guild and folder. `guildFolders` is authoritative for folder membership *and* order, so
  hidden servers fell out of the proto and were re-inserted as unsorted everywhere.
  `updateFolder` (folder rename/recolor) does the same via `getGuildFolders().map(...)`.

So before patching a store getter, map **all** its consumers — a getter whose result flows
into a persist action must stay stock. For the guild bar specifically, the render path reads
`getFastListGuildFolders`/`getFlattenedGuildFolderList`/`getGuildsTree` (safe to filter);
the persist path reads `getCompatibleGuildFolders`/`getGuildFolders` (never filter those two).

If a persist choke point is a single exported function, it can be guarded directly: the
plugin now also `before`-hooks `saveGuildFolders`
(`plugins/hide-servers-drawer/src/patches/saveGuildFolders.ts`) and splices hidden entries
back into the outgoing array, so an incomplete order can never reach the wire even if a
future build reroutes a persist caller through a filtered getter. Bail out (return the
original args) whenever anything *non-hidden* is missing from the payload — a deliberately
partial caller is not yours to repair.
