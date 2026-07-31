# Porting rules

Rules for writing or debugging plugin code in this repo. Every one of them cost at least one
on-device crash to find, and none of them are documented upstream — they were traced through
[revenge-bundle-next](https://github.com/revenge-mod/revenge-bundle-next)'s own source and
confirmed against [PalmDevs](https://github.com/PalmDevs)' working plugins.

Read this before touching a plugin.

## 1. Never touch `revenge.*` at module scope

The single most important rule here. It was the real cause of the "settings pages crash the
whole Settings screen" bug that this repo spent a long time misdiagnosing.

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
four working plugins, with no change to how `SettingsComponent` is registered.

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

- `lookupModule`/`lookupModules` are one-shot and permanently cache a miss if the target
  module hasn't loaded yet — very possible from `preInit`, and even from `start()` for
  chat/member-list UI modules that only initialize once their screen renders. Use `getModules`
  (subscribes, calls back whenever a match actually loads) for anything UI-related.
- A hand-built filter must implement a `.scope(...)` **method**, not just a `.scopes` property.
  `getModules`/`lookupModule` call it as a function internally, and a filter missing it throws
  immediately, silently, every time.
- `React.memo()`-wrapped components can never be matched by `filters.withName` — memo wrappers
  have no `.name` of their own. The member-list patch (`staff-tags/src/patches/details.tsx`)
  needed a hand-built filter to catch `UserRow` for this reason.

## 4. APIs that don't exist

Guessed by analogy with classic Revenge, and confirmed absent from revenge-bundle-next's source:

| Guessed | Reality |
| --- | --- |
| `revenge.discord.common.chroma` | Doesn't exist — self-contained brightness calc instead |
| `revenge.discord.common.moment` | Doesn't exist — self-contained date formatter (`custom-timestamps/src/lib/renderTimestamp.ts`) |
| `revenge.utils.react.findInReactTree` | Doesn't exist — local implementation (`staff-tags/src/lib/findInReactTree.ts`) |
| `filters.withStoreName` / `withTypeName` / `withPredicate` | Don't exist — Flux stores come from the `revenge.discord.flux.Stores` proxy |
