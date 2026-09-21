# Second Thoughts Settings Bible

Source of truth for Second Thoughts' and AI Core's settings UX. If code and this file disagree,
update one immediately so they match.

Subordinate to [`plugin-design-language.md`](plugin-design-language.md); nothing here contradicts
it.

Scope:

- Plugins: `plugins/second-thoughts`, `plugins/ai-core`
- UI routes under `js/ui/pages`
- Settings index and sub-pages only

## 1) Design Intent

Second Thoughts should read as:

- **Free first.** The pattern checks are the product. They need no key, no network and no
  dependency. Every surface states this before it mentions AI.
- **Quiet.** The plugin is invisible on the overwhelming majority of sends. The settings pages
  should feel the same: no nagging, no upsell toward the optional half.
- **Honest about what leaves the device.** This is the question a reasonable person asks before
  installing something that reads everything they type. It gets a first-class destination.

AI Core should read as:

- **Infrastructure.** It has no behaviour. Its root page says so in the first card.

## 2) Settings IA

### Second Thoughts (`js/ui/routes.tsx`)

- `Checks` (`CHECKS_ROUTE`) — every toggle, plus sensitivity.
- `Try a draft` (`TRY_ROUTE`) — score a message without sending it.
- `What leaves the device` (`PRIVACY_ROUTE`) — the privacy contract.
- `Debug` (`DEBUG_ROUTE`) — developer tools.

Root page grouping (`js/ui/pages/Settings.tsx`):

1. Neutral notice card: "Patterns are free. Judgement is optional."
2. Short muted line: nothing is held silently.
3. `Enabled` switch, plus the snooze row when a snooze is active.
4. Configuration index group (`Checks`, `Try a draft`, `What leaves the device`).
5. Separate `Developer` group containing `Debug`.

The card is **neutral, not warning-tinted**. Second Thoughts stores nothing and logs nothing;
reserving the yellow treatment for genuine risk is what keeps it meaning something (design
language §4.2).

### AI Core (`js/ui/routes.tsx`)

- `Provider` (`PROVIDER_ROUTE`) — key, base URL, model, timeout.
- `Usage and limits` (`USAGE_ROUTE`) — daily cap, today's spend, per-plugin attribution, queue.
- `Debug` (`DEBUG_ROUTE`) — logging, connection test, resolved configuration.

Root grouping: neutral card ("does nothing on its own") → muted key-storage caveat → index →
`Developer` group.

## 3) The optional-dependency contract

Second Thoughts declares AI Core as `{ "version": ">=1 <2", "optional": true }`. This is the
single most important structural fact about both plugins.

- `api.ai` is `undefined` whenever AI Core is absent, disabled, or failed to start. All three are
  ordinary states, not errors.
- `lib/state.ts` exposes `aiStatus()` returning `absent | unconfigured | exhausted | ready`.
  **Every judgement-related surface must render from this, not from a boolean.** "Not installed",
  "no key set" and "cap spent" are three different problems with three different fixes, and
  collapsing them into "unavailable" makes the plugin unfixable by the user.
- Judgement toggles stay **on** by default and are rendered `disabled` when not `ready`, with the
  reason given in the group's trailing muted text. They are not hidden: a control that appears
  only after an unrelated install is worse than one that plainly says what it needs.

## 4) Copy Rules

- Never describe the plugin as an AI plugin. It is a pattern matcher with an optional second
  opinion, and the root card says so first.
- Never imply the pattern checks send anything. They cannot, and saying so plainly is the whole
  trust argument.
- The distress carve-out gets stated wherever the checks are explained. A draft that reads as
  reaching out about the author's own wellbeing is passed ahead of every other check and is never
  held or sent. This is non-negotiable behaviour, not a setting, and it is never presented as one.

## 5) Per-Page Contracts

### 5.1 Checks (`Checks.tsx`)

- Two groups, deliberately unequal: "Patterns — free, nothing else needed" then
  "Judgement — needs AI Core".
- `Personal details in DMs too` is `disabled` unless `Personal details` is on.
- Sensitivity is a `Slider` (1–8) inside its own group whose title carries the live value.
- The judgement group is followed by one muted line explaining the current `aiStatus()`.

### 5.2 Try a draft (`TryDraft.tsx`)

Calls the same `scanPatterns` / `scoreDraft` / `isReachingOut` the send path calls. It may never
reimplement them.

Required verdicts, in order:

1. Held by patterns as configured.
2. **Would be held, but the switch is off.** Runs the scan a second time with everything enabled
   and names the switch to turn on. Omitting this made a correctly-detected address look
   undetectable, which cost real debugging time.
3. Reaching out — always passes.
4. Judgement unavailable, naming which `aiStatus()` applies.
5. No judgement categories on.
6. Below `minLength`.
7. Gate score against threshold, with the signal names.

Always scored as though in a server, and the page says so.

### 5.3 What leaves the device (`Privacy.tsx`)

Two groups: "Never leaves this device" then "Sent, when it happens". Informational rows only, no
toggles. The endpoint row reads from `aiStatus()` so it can say "Nowhere" when AI Core is absent.

### 5.4 Debug (`Debug.tsx`)

- Debug logging switch.
- **Send hook status** — whether `instead` actually installed, and on which module id.
- **AI Core status** — the `aiStatus()` line in full.
- **Draft restore route** — which of `saveDraft` / `dispatch` / `clipboard` answered last.

Rule, from porting rule 3: these report **outcomes, not intentions**. A page that says "patched"
while nothing is patched is how this repository lost six releases on Screenshot Redactor.

### 5.5 AI Core Usage (`Usage.tsx`)

- Daily cap slider (0–200, step 5). Zero is documented as the off switch.
- Today's calls and tokens, plus a destructive-confirmed `Reset the count`.
- Per-plugin attribution, rendered only for entries with a count above zero — zeroes are
  tombstones, see §7.

## 6) Interaction Rules

- The hold modal's default action is `Let me edit`, and dismissing by tapping away does the same.
  The safe outcome must be the one you get by doing nothing.
- `Send, and hush for an hour` is offered **only** for judgement holds, never for credential or
  personal-detail holds. Nobody ever wants to mute the credential check.
- `Reset the count` in AI Core requires a destructive confirmation alert.

## 7) Data-to-UI Binding Rules

- Always read storage with fallback merge: `{ ...DEFAULTS, ...(storage?.use() ?? {}) }`.
- Never access `revenge.*` at module scope (porting rule 1).
- Navigator pages have no `api` prop and must use `getStorage()` from `lib/state`.
- AI Core's `usageByPlugin` is a removable collection under `jsonStorage`, so a day roll writes
  an explicit `0` for every known plugin rather than omitting it. A merge cannot delete a key
  (porting rule 6), and readers filter `count > 0`.

## 8) Known Quirks

- **The input box clears before `sendMessage` is called.** Discord's chat input clears in its own
  submit handler, so holding a message means the user's text is already gone from screen.
  `lib/draft.ts` recovers it through three routes in order and records which answered. The
  clipboard fallback always works, so text is never lost — but `clipboard` showing on the Debug
  page means the first two routes missed on that Discord build.
- **One `instead` per method, repo-wide.** Second Thoughts owns `sendMessage`. Anything else in
  this repository wanting that method must use `before`/`after` instead (porting rule 2).

## 9) Canonical File Map

| Concern | File |
| --- | --- |
| Pattern checks | `plugins/second-thoughts/js/lib/secrets.ts` |
| Local gate | `plugins/second-thoughts/js/lib/gate.ts` |
| Typo detection | `plugins/second-thoughts/js/lib/typos.ts` |
| Orchestration and prompt | `plugins/second-thoughts/js/lib/judge.ts` |
| Draft recovery | `plugins/second-thoughts/js/lib/draft.ts` |
| Send interception | `plugins/second-thoughts/js/patches/sendMessage.ts` |
| Hold modal | `plugins/second-thoughts/js/ui/components/HoldAlert.tsx` |
| Model client | `plugins/ai-core/js/lib/client.ts` |
| Decorated api | `plugins/ai-core/js/index.ts` |

---

Maintainer note: documents Second Thoughts `0.2.0` and AI Core `1.0.0`.
