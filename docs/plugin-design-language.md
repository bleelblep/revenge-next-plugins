# Plugin Settings Design Language

This is the cross-plugin design language for this repository.

Use it when building or refactoring any plugin settings UI so pages feel like one product family,
not unrelated tools.

This document is intentionally about both **how** and **why**.

---

## 1) Core Product Philosophy

### 1.1 Utility over decoration

Settings pages are operational surfaces. Users come to change behavior, inspect status, or run a
single action quickly.

Implication:

- Prefer `TableRowGroup` + rows/switches/radios.
- Avoid ornamental custom layouts unless they solve a real usability problem.

### 1.2 Serious but calm tone

Plugins often touch risky or confusing areas (message logging, patch side effects, platform limits).
Copy should be plain, direct, and non-dramatic.

Implication:

- Labels are short and action-oriented.
- Sub-labels explain consequences, limits, and scope.
- Warnings are explicit when risk is real.

### 1.3 Mobile-native scannability

Everything is consumed on a phone in tight vertical space.

Implication:

- Clear group boundaries.
- Predictable spacing rhythm.
- Separate advanced/debug tools from normal user controls.

---

## 2) Information Architecture Patterns

Use one of these patterns per plugin.

## 2.1 Single-page plugin (small scope)

Use when plugin has a compact, low-risk settings surface.

Structure:

1. One or more `TableRowGroup`s
2. Optional short notice row/card
3. No route index needed

Example style: `hide-call-buttons`.

## 2.2 Root index + sub-pages (default for medium/large scope)

Use when plugin has multiple concerns (behavior, logs/history, visuals, backup, debug, licensing).

Root page should be an index page, not a dump of every control.

Canonical root flow:

1. Context card (warning or neutral caveat)
2. One muted scope/limitation sentence
3. Primary data route (log/history) in its own group
4. Configuration index rows
5. Developer/debug in its own group (if present)

Examples: `ghost-log`, `anti-ghost-ping`, `relationship-notifier`.

---

## 3) Visual Grammar

## 3.1 Layout rhythm

- Use `<Stack spacing={24}>` for vertical rhythm on multi-block pages.
- Use `useBottomPadding()` for scrollable pages so gesture bars do not cover the last rows.
- Let `Page` handle horizontal page padding; avoid ad-hoc extra wrappers unless needed.

Why: keeps visual cadence consistent across plugins and prevents cramped/inset mismatches.

## 3.2 Component hierarchy

Primary primitives (in order):

1. `TableRowGroup`
2. `TableRow` / `TableSwitchRow` / `TableRadioGroup`
3. `Card` (only for context blocks or genuinely custom controls)

Why: row primitives already match Discord/Revenge settings language and reduce visual drift.

## 3.3 Typography and copy

- Labels: direct action or noun phrase (`Backup location`, `Toast when caught`).
- Sub-labels: one-line explanation of effect/constraint.
- Muted explanatory text: `text-muted`, small variants.
- Avoid jargon unless user-visible behavior depends on it.

Why: users should understand impact without reading source or docs.

## 3.4 Icon policy

- Use `rowIcon(...)` helper consistently for row-leading icons.
- Prefer semantic icon mapping (lock for security, trash for destructive, bug for debug).
- Include fallbacks where icon names vary between builds.

Why: stable icon rendering and stronger scan cues.

## 3.5 Colour follows the user's theme

Discord ships Ash, Dark, Onyx and Light, and users pick custom themes on top. A colour written as a
hex literal looks right on exactly one of them. Anything a plugin draws itself (a custom button, a
header, a floating control, a native dialog) takes its colours from Discord's theme at runtime.

**In JS**, prefer components that already carry the theme: Design `Text` with a `color` token
(`text-default`, `text-muted`; never `text-normal`, which renders black on mobile), `TableRow`,
`Card`. When a raw React Native `View`/`Text` needs a colour, resolve a token with the `token()`
helper (`plugins/<id>/js/ui/theme.ts`; the reference copy is in `hide-servers-drawer`):

```ts
token('CONTROL_SECONDARY_BACKGROUND_DEFAULT', '#2b2f36') // name, dark-theme fallback
```

It reads `revenge.discord.common.tokens.Tokens` (`RawColor` + `SemanticColor`) and resolves
semantic names through `ThemeStore`'s current theme. Call it at render, never at module scope
([porting rule 1](./porting-rules.md)). The fallback is the hex it replaced, so a renamed token
costs one wrong shade instead of an invisible control. Before using a new name, check it exists:
`bundle.includes('TOKEN_NAME')` on the APK's `index.android.bundle`.

Useful tokens: `TEXT_DEFAULT`, `TEXT_MUTED`, `BORDER_SUBTLE`, `BACKGROUND_MOD_SUBTLE`,
`CONTROL_SECONDARY_{BACKGROUND,TEXT}_DEFAULT` (neutral buttons),
`CONTROL_CRITICAL_PRIMARY_{BACKGROUND,TEXT}_DEFAULT` (destructive), `BACKGROUND_BRAND`.

**In Kotlin**, native views (dialogs, toasts with custom views) read the same theme from
`com.discord.theme.ThemeManager.INSTANCE.getEffectiveTheme()` by reflection through
`activity.classLoader`. The plugin isn't compiled against Discord, and a reflection miss must fall
back to the dark palette rather than throw. Getters mirror the JS token names in camel case:
`getBackgroundSurfaceHigh`, `getMobileTextHeadingPrimary`, `getTextMuted`,
`getInputBackgroundDefault`, `getInputBorderActive`, `getControlPrimaryBackgroundDefault`,
`getControlCriticalPrimaryBackgroundDefault`, `getControlSecondaryTextDefault`, and so on
(`DiscordThemeObject` in a jadx decompile has the full list). The font is Discord's own gg sans:
`Typeface.createFromAsset(activity.assets, "fonts/ggsans-<Normal|Medium|Semibold|Bold|ExtraBold>.ttf")`,
with the system font as fallback.

The reference implementation is `discordDialog` in `plugins/ai-core/src/main/kotlin/.../AiCore.kt`:
a centred heading and body, a filled rounded input, and full-width pill buttons with the action
above Cancel (red when destructive). Reuse its shape for any native dialog instead of
`AlertDialog`, whose Material styling looks foreign inside Discord.

Keep a native dialog native when it guards something. A confirmation that stops other plugins
(raising AI Core's cap, removing it) must not be drawn in JS, because any plugin can draw, or skip,
a JS modal.

**Fixed colours that are fine:** content colours the user chose or Discord assigns (role and tag
colours), white text or glyphs on a saturated fill (badges, the armed red toggle), and
low-opacity washes of a feedback hue that read on both themes (the yellow warning card in §4.1,
message highlights). A fixed dark-grey surface or a light-grey text colour is never fine.

## 3.6 Text fields sit in a row

A text field on a settings page goes inside a real settings row, so it has the same background,
corners and spacing as the row groups around it. Use `FieldGroup` / `FieldRow` (`shared/ui/fieldGroup.tsx`,
re-exported from each plugin's `js/ui/fieldGroup.tsx`):

```tsx
<FieldGroup
	title="Encryption"                       // optional group heading
	label="Passphrase"                       // the row's label: names the field
	description="Backups are encrypted with it on this phone…"   // muted text, inside the row
>
	<TextInput placeholder="Choose a passphrase" value={…} onChange={…} />
</FieldGroup>
```

- The field is the row's `subLabel` (typed `ReactNode`), so the row paints it. Don't pass `label`
  or `description` to the `TextInput` as well; `FieldGroup` has them. Error text stays on the
  `TextInput` (`status` + `errorMessage`), and `trailingText`, `isClearable` etc. are unchanged.
- Several related fields share one group: `<TableRowGroup title="Endpoint">` with a `FieldRow`
  per field (same props as `FieldGroup`, minus `title`).
- Buttons or rows that act on the field (Add, Generate, Import) go in a row group right after it.
- **Exceptions, left bare:** a search or filter box at the top of a list, and a field inside an
  alert dialog (`AlertModal` `extraContent`), which already has the dialog's surface.

Why: confirmed on the phone (Cloud Backup, 2026-09-30). A plain `View` inside a `TableRowGroup`
has no background at all, because a group paints nothing and each `TableRow` paints itself. A
`Card` matched on Discord's own themes but drifted to another shade under custom themes, which
recolour rows and cards through different tokens. A row is the only surface that always matches.

## 3.7 Use Discord's own component before drawing one

Anything a plugin shows outside a settings list (a review row, a composer bar, a profile card, an
avatar, a tag) uses the component Discord itself uses for that job, when the app has one. Draw a
`View` by hand only when Discord has no JS component for it (message reactions, for example, are
drawn natively, so there is none).

Where to look, beyond the Design namespace (`Button`, `IconButton`, `TextInput`, `TextArea`,
`ActionSheet`, `AlertModal`, ...):

| Job | Module path (348.5) | Props |
| --- | --- | --- |
| Avatar | `design/void/Avatar/native/Avatar.tsx` (`default`, `AvatarSizes`) | `user` or `source`, `size` (an `AvatarSizes` value), `guildId`, `animate` |
| Overlapping avatars | `design/components/Pile/native/AvatarPile.native.tsx` (`AvatarPile`) | `size`, `totalCount`, `names`, avatars as children |
| APP / SYSTEM tag | `modules/applications/native/BotTag.tsx` (`default`, `Types`) | `type` (a `Types` value), `verified` |
| Empty list | `design/void/EmptyState/native/EmptyState.tsx` | `title`, `body`, `style` |

Rules:

- **Read the props, don't guess them.** Find the module's path in the APK's
  `index.android.bundle`, then disassemble it with `hermes-dec` (`HBCReader` + `parse_hbc_bytecode`;
  the component reads its props as `GetById` on param 1, and the module's exports are the
  `PutByIdStrict` names). Untyped props fail silently, so a guessed name is a blank or a crash.
- **Look it up at render, never at module scope** ([porting rule 1](./porting-rules.md)), through
  the imported-path finder (`discord.utils.modules.finders`). It only finds modules Discord has
  already loaded.
- **Always keep the hand-drawn version as the fallback**, and wrap Discord's component in an error
  boundary that renders it. A missing module, a missing enum value or a throw then costs the look,
  never the screen. The reference is `plugins/review-db/js/ui/native.tsx` (`Native`, `UserAvatar`,
  `ReviewerPile`, `Tag`, `Empty`); copy its shape.
- Icons for `IconButton` are asset ids (`revenge.assets.getAssetIdByName`); bail to the fallback
  when one comes back undefined.

Why: the user asked for it (ReviewDB 0.1.8, 2026-10-02). Discord's own components pick up the
theme, avatar decorations, accessibility labels and future redesigns for free; a hand-drawn copy
drifts the first time Discord changes its look.

## 3.8 Destructive rows: red text and a red icon

A row that deletes, clears, removes, resets saved data or signs out is a danger row:
`variant="danger"` on the row, and `dangerIcon(...)` (`shared/ui/icon.tsx`, re-exported from each
plugin's `js/ui/icon.tsx`) for its icon, never `rowIcon(...)`.

```tsx
<TableRow label="Delete review" variant="danger" icon={dangerIcon('TrashIcon')} onPress={confirmDelete} />
```

- The row's `variant="danger"` only turns its label and sub-label red (`text-feedback-critical`);
  it changes no background and never reaches the icon. Stock Discord tells the icon separately:
  `icon={<TableRow.Icon IconComponent={X} variant="danger" />}` (348.5, e.g. ModeratorActionRow).
  `dangerIcon` builds exactly that, for asset icons (`source`) and generated components
  (`IconComponent`) alike. A `rowIcon` on a danger row renders white next to red text.
- The action still asks first (§9 item 6): Discord's alert with a `destructive` button.
- Not danger: switches that merely turn something off ("Remove tracking from links"), re-numbering
  or refresh actions that lose nothing, and resets on a Developer/Debug page.

Why: Report and Delete in ReviewDB's sheet showed white icons beside red labels (2026-10-02); the
user called it a bug, and an audit found the same on every plugin's destructive rows.

---

## 4) Context Cards: Warning vs Neutral

Use a context card only when the page needs framing.

## 4.1 Warning card (yellow tint)

Use for real risk categories (e.g., message loggers).

Card should include:

- Explicit warning title.
- Why risk exists.
- What is stored and who can see it.

## 4.2 Neutral notice card

Use when behavior is non-dangerous but easy to misread (e.g., event ambiguity).

Card should include:

- Limitation explanation.
- Scope statement (what is and is not captured).

Why this split: warning styling should retain meaning; overuse weakens trust.

---

## 5) Control Placement Rules

## 5.1 User-facing pages

Keep only normal controls users need routinely:

- Behavior toggles
- Notifications
- Visual style
- Data/history browsing
- Backup/restore actions

## 5.2 Developer/Debug page

Put all diagnostic/test-only controls here:

- Synthetic data generation
- Internal path/status displays
- Self-test toggles
- Experimental/temporary tooling

Keep debug behind a dedicated route and isolated group on root index.

Why: avoids contaminating normal UX with maintenance tools.

---

## 6) Interaction Rules

- Destructive actions require confirmation alerts (`Clear log`, reset operations).
- Important async actions should toast success/failure with useful context.
- Disabled actions must explain why via sub-label.
- If platform UI limits choices (Android alert action limits), use staged pickers/popups.

Why: reduces accidental loss, improves trust, and keeps behavior legible on-device.

---

## 7) Data + Rendering Discipline

- Read storage with defaults merged each render (`{ ...DEFAULTS, ...(storage?.use() ?? {}) }`).
- Never read `revenge.*` at module scope for render-time APIs.
- For plain route pages without `api` prop, use shared storage handle (`getStorage()`).
- Keep route pages responsibility-focused; avoid unrelated controls on one screen.

Why: prevents lifecycle crashes and keeps settings pages robust during load races.

---

## 8) Navigation and Naming Conventions

- Route titles should be plain nouns (`Settings`, `Backup`, `Visual style`, `Debug`, `Licence`).
- Root index row labels should match destination title or intent exactly.
- `LOG_ROUTE`/history-like pages are first-class destinations, not buried actions.

Why: predictable navigation lowers cognitive load across all plugins.

---

## 9) New Plugin Checklist (Required)

Before shipping a new plugin settings UI, verify:

1. Chosen IA pattern (single page vs index + sub-pages) fits feature scope.
2. Root page (if multi-page) has context -> scope note -> primary route -> settings index.
3. Debug tools are isolated from user settings.
4. Warnings/notes match actual risk and storage behavior.
5. Spacing rhythm and safe-area padding match repo conventions.
6. Destructive actions are confirmed.
7. Async actions provide clear toasts.
8. Labels and sub-labels explain behavior plainly.
9. Nothing the plugin draws itself uses a fixed surface or text colour; it looks right on the
   Light theme as well as Dark (§3.5).
10. Every text field except search boxes and dialog fields is in a `FieldGroup` row (§3.6).
11. Avatars, tags, inputs and empty states use Discord's own component, with the hand-drawn
    version as the fallback (§3.7).
12. Every destructive row has `variant="danger"` and a `dangerIcon(...)` icon (§3.8).

---

## 10) Relationship to Plugin-Specific Bibles

This file is the **global language spec** for this repository.

Plugin-specific docs (for example `docs/ghost-log-settings-bible.md`) may add tighter constraints
for one plugin, but they must not contradict this shared document unless there is a documented,
intentional exception.
