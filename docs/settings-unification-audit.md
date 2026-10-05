# Settings unification audit

A sweep of every plugin's settings UI, done on 2026-09-27, to bring them all onto one design.
The target layout is Ghost Log Native Beta's, as described in
[`plugin-design-language.md`](./plugin-design-language.md) §2.2. Send Tweaks 0.3.0 was already
moved onto it in the same session and serves as the second reference.

This is a work list, not a spec. Tick items off or delete them as they land. When a pattern is
settled here, move it into `plugin-design-language.md` and remove it from this file.

**How it was done:** grep across `plugins/*/js` for the signals below, plus a structural outline
of every root `Settings.tsx`. The outline script was a throwaway; re-derive it if needed. Sub-pages
were only spot-checked, so each plugin still needs a read of its sub-pages when it is worked on.
Nothing has been checked on-device.

---

## 1. Shared helpers have drifted

Each plugin is a separate bundle and carries its own copy of the UI helpers. The copies no longer
match.

### 1.1 `rowIcon` — 6 variants, 2 behaviours (bug)

The memory note "rowIcon must try each name as asset then component before moving on" applies
here. The "all assets first" order lets a generic asset fallback beat a real component icon listed
earlier: Plugin Hub hit this with `PuzzlePieceIcon`.

| Behaviour | Plugins |
| --- | --- |
| **Correct:** per name, asset then component | ai-core, catch-up, tldr, veil, plugin-hub |
| **Buggy:** every name as asset first, then every name as component | anti-ghost-ping, focus-bubble, ghost-log, ghost-log-native-beta, hide-servers-drawer, night-light, relationship-notifier, screen-effects, screenshot-redactor, screenshot-redactor-dev, second-thoughts, send-tweaks, tilt-physics, translate |
| **Neither:** `revenge.components.TableRowAssetIcon`, assets only | hide-call-buttons |
| **No icons at all** | auto-quest, custom-timestamps, show-tag |

- [x] **Fixed 2026-09-27:** every plugin's `js/ui/icon.tsx` now re-exports `shared/ui/icon.tsx`
  (per-name order, Plugin Hub's aliases, `TableRow.Icon ?? TableRowIcon`). Superseded note:
  copy `ai-core/js/ui/icon.tsx` over every buggy variant. The only extra worth
  keeping from the send-tweaks and second-thoughts copies is the `TableRow.Icon ?? TableRowIcon`
  fallback; fold it into the ai-core version first.

### 1.2 `safeArea.ts` — 2 copies, same behaviour

The two copies differed only in quote style. **Done:** every copy now re-exports `shared/ui/safeArea.ts`.

### 1.3 `theme.ts` (`token()`) exists in only 6 plugins

anti-ghost-ping, ghost-log, ghost-log-native-beta, hide-servers-drawer, screen-effects and
screenshot-redactor have it. Any plugin that draws its own `View` or `Text` with a colour needs it
(design language §3.5).

### 1.4 Proposal: one shared UI kit

- [ ] Put `icon.tsx`, `safeArea.ts`, `theme.ts`, `refreshSettingsUI` (duplicated in every
  `routes.tsx`) and a `confirm()` helper (see §3) in one place, such as `shared/ui/`.
- [x] **Verified:** the bundler (rolldown + swc) compiles any file outside `node_modules`, so
  plugins import `shared/` by relative path. `tsconfig.json` includes `shared`. No sync script needed.
- [x] `icon.tsx` and `safeArea.ts` moved (each plugin keeps a one-line re-export at its old path).
- [ ] Still to move: `theme.ts` `token()`, `refreshSettingsUI`, and a `confirm()` helper (with §3).

---

## 2. Root page layout, per plugin

The target, from GLNB and design language §2.2:

1. Context card
2. One muted scope line
3. The main destination in a group of its own
4. An untitled index group
5. A `Developer` group holding Debug

Small plugins may stay on a single page (§2.1), but should still use icons, `Stack spacing={24}`
and `useBottomPadding()`.

| Plugin | Layout now | Gaps against the target |
| --- | --- | --- |
| ghost-log-native-beta | Reference | Uses RN `Alert.alert` (§3) |
| ghost-log | Matches GLNB | `Alert.alert` (§3) |
| send-tweaks | Matches (0.3.0) | Buggy `rowIcon` (§1.1) |
| anti-ghost-ping | Matches | `Alert.alert` |
| relationship-notifier | Card, scope line, History, Settings | No Developer/Debug. Card title `Text` has no `color` |
| second-thoughts | Card, switch group, index, Developer | Index is fine. The master "Enabled" switch on the root is a reasonable exception; write it down as the pattern for plugins with a master switch |
| ai-core | Card, index, dependents list, Developer | Matches. (The two "Plugins using AI Core" groups are a list and its empty state, never both on screen.) Only the shared-kit items apply |
| catch-up | Card, index, Developer | The "AI Core" status row sits in the index group with no arrow; move it to a status group or make it navigate |
| tldr | Card, AI Core row, group titled "Settings", Developer | The index group is titled "Settings"; GLNB leaves it untitled. Same AI Core status row issue as catch-up |
| translate | Card, index, switch mixed into index, Developer | "Translate automatically" switch is in the index group; move it to a Settings sub-page or its own group |
| veil | Card, master switch, "What to blur", "Long-press menu" switches, "Settings", Developer | The long-press switches belong on a sub-page. The index group is titled "Settings" |
| screenshot-redactor | Card, switch, index, Developer (+ Reload Discord) | Uses a **warning** card for reassurance ("Message text is never touched"). §4 reserves yellow for real risk; make it neutral like the dev build's. `Alert.alert` |
| screenshot-redactor-dev | Neutral card, switches, index, Developer (+ Reload) | Card title `Text` has no `color`. `Alert.alert` |
| hide-servers-drawer | Card, Servers, Developer (+ Reload) | Card title `Text` has no `color` |
| screen-effects (VFX) | **Redone 0.11.0** on GLNB's layout: context card, red status card when hooks fail, scope line, Try effects alone, one untitled index, Licence page | Spacing now 24 on Try effects (chip rows keep 8 inside). Still no Debug page; decide |
| plugin-hub | Custom Hub-management surface | No context card. Special-purpose; decide whether it is exempt |
| staff-tags | Tag list, switch, note | No icons on the switch. Hex colours are tag content, which is allowed (§3.5) |
| hide-call-buttons | Single page, titled groups | Asset-only icons (§1.1); no `useBottomPadding` |
| night-light, tilt-physics, text-brightness | Single page with sliders | Slider value lives in the group title ("Strength — 40%"). Consistent among these three; document it as the slider pattern. text-brightness: no icons |
| focus-bubble | Single page | A muted `Text` sits *inside* a `TableRowGroup`; move it above the group |
| auto-quest, custom-timestamps, show-tag | Single page, bare | No icons and no `useBottomPadding`. show-tag has no `Stack` |

### Naming to settle

- [ ] **Sub-page for appearance.** It is called "Visual style" (ghost-log, GLNB,
  screenshot-redactor), "Appearance" (translate, veil's route), and "How it looks" (veil's row
  label). Pick one name. "Visual style" is what §8 lists.
- [ ] **Toggles sub-page.** Most plugins call it "Settings". Second Thoughts calls it "Checks" and
  tldr "When to offer it". Those names are more specific, which is fine, but say in §8 when a
  specific name beats "Settings".
- [ ] **Row label matches page title.** Veil's row "How it looks" opens a page titled
  "Appearance". §8 requires the row label to match the destination title.
- [ ] **"Reload Discord".** It sits in the Developer group in three plugins. Decide whether it
  belongs there or next to the setting that needs the reload.

---

## 3. Confirmation dialogs: two styles

| Style | Where |
| --- | --- |
| React Native `Alert.alert` (Material look, foreign in Discord) | anti-ghost-ping Log; ghost-log and GLNB Log, Backup and Debug; relationship-notifier Log; screenshot-redactor and -dev Visuals and Debug |
| Discord `AlertModal` via `AlertActionCreators` | plugin-hub, screen-effects, second-thoughts, send-tweaks, staff-tags, tldr |

- [ ] Move everything to `AlertModal`, through the shared `confirm()` helper.
- [ ] Watch the ghost-log **backup-location picker**: the bible splits it across two popups because
  of Android's alert action limit. With `AlertModal` that limit may not apply, so re-test before
  merging the two popups.
- [ ] Leave native (Kotlin) dialogs that guard something as they are, such as AI Core's key
  removal (design language §3.5).
- [ ] Spot-check whether translate's Debug "Clear cooldowns" needs a confirm. It is harmless, so
  probably not; decide and note it.

---

## 4. Smaller consistency items

- **Card titles:** use `text-default` for a neutral card title and `text-feedback-warning` for a
  warning card. Three plugins leave `color` unset (relationship-notifier, screenshot-redactor-dev,
  hide-servers-drawer). The default might render fine, but set it explicitly.
- **Hex colours:** apart from the allowed cases, none were found:
  - GLNB's warning and critical washes
  - staff-tags' tag content and white-on-fill
  - plugin-hub's Cornhub, which is local-only
- **`text-normal`:** not used anywhere; only a comment in plugin-hub mentions it.
- **Licence row:** only ghost-log and GLNB have one. Every plugin with mixed licences needs one:
  screen-effects (GPL file) and anything ported under GPL.
- **Debug pages:** these plugins have no Debug page: relationship-notifier, screen-effects,
  staff-tags, plugin-hub, and every single-page plugin. That is fine for the single-page ones.
  Decide for the rest.

---

## 5. Suggested order of work

1. Shared kit (§1.4). Fix `rowIcon` everywhere first: it is the only real bug in this audit.
2. Confirm dialogs to `AlertModal` (§3).
3. Root-page fixes, smallest first: card colours, focus-bubble, the bare single-page plugins.
4. Structural moves: veil's long-press switches, translate's switch, the tldr and veil group titles,
   screenshot-redactor's warning card.
5. Naming (§2, "Naming to settle"). Then update `plugin-design-language.md` §8 and delete the
   settled parts of this file.

Each plugin touched needs a version bump. Use a plain version, not `-betaN`: the phone only
installs the `latest` channel. Batch the releases per the staged-push approach rather than
releasing all of them at once.
