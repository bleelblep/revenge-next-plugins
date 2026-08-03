# Ghost Log Settings Bible

This document is the source of truth for Ghost Log's settings UX and visual language.
If code and this file disagree, update one immediately so they match.

Scope:

- Plugin: `plugins/ghost-log`
- UI routes under `src/ui/pages`
- Settings index and sub-pages only

## 1) Design Intent

Ghost Log should read as:

- Serious and safety-conscious (message logger risk is explicit).
- Utility-first (rows, cards, grouped controls; no decorative clutter).
- Native to Revenge/Discord settings surfaces (TableRow and TableRowGroup patterns first).
- Calm and scannable (one responsibility per page; clear section titles).

The UI language is built around card/list primitives, not custom layouts.

## 2) Settings IA (Information Architecture)

Root settings page is an index plus warning context.

Current route map (`src/ui/routes.tsx`):

- `Deleted messages` (`LOG_ROUTE`) - captured entries list.
- `Settings` (`OPTIONS_ROUTE`) - logging behavior toggles.
- `Backup` (`BACKUP_ROUTE`) - backup/restore actions and backup location.
- `Visual style` (`VISUALS_ROUTE`) - deleted-message in-chat style.
- `Licence` (`LICENSE_ROUTE`) - attribution and licensing.
- `Debug` (`DEBUG_ROUTE`) - developer/testing tools.

Root page grouping (`src/ui/pages/Settings.tsx`):

1. Warning card (yellow tinted, explicit risk text).
2. Short muted caption about cache limitations.
3. Single-row group for `Deleted messages`.
4. Main configuration index group (`Settings`, `Backup`, `Visual style`, `Licence`).
5. Separate `Developer` group containing `Debug` row.

Rule: debug/dev entry must stay isolated from user-facing primary settings.

## 3) Visual System Rules

### 3.1 Spacing and page rhythm

- Every page uses `<Stack spacing={24}>` as the vertical rhythm.
- Every scroll page uses `contentContainerStyle={{ paddingBottom: useBottomPadding() }}`.
- Do not add ad-hoc page side padding; rely on `Page` defaults.

### 3.2 Typography and tone

- Explanatory text uses muted variants (`text-muted`, `text-sm/normal`).
- Row labels are short action-oriented phrases.
- Row sublabels explain consequence, scope, or side effects.
- Keep copy concrete; avoid vague helper text.

### 3.3 Cards and rows

- Primary interaction units are `TableRowGroup`, `TableRow`, `TableSwitchRow`, `TableRadioGroup`.
- Custom card styling is only used when standard row group semantics are insufficient.
- Warning card is the only intentionally tinted card on root page.

### 3.4 Icons

- Use `rowIcon(...)` helper for all settings rows.
- Provide multiple icon fallbacks where practical.
- Icons should reinforce category (trash/delete, lock/security, bug/debug).

## 4) Root Warning Pattern

The warning card in `Settings.tsx` is mandatory and must include:

- Visual warning treatment (`#f0b232` family tint/border).
- Direct statement that Ghost Log is a message logger.
- Risk language about ToS and account action risk.
- Local storage/backup behavior summary.

Do not bury this warning in subpages.

## 5) Per-Page Contracts

## 5.1 Deleted Messages page (`Log.tsx`)

Purpose:

- Browse captured deleted messages by origin (guild/DM grouping).
- Manage log clearing.

Rules:

- Group entries by origin, show origin header with guild avatar + uppercase label.
- Render row subtitle as message preview + channel + relative time.
- Clip long body preview (currently 280 chars).
- Empty state must be explicit and friendly.

Pagination:

- Page size is 50.
- Pager appears only when `totalPages > 1`.
- Pager is a 3-slot horizontal row: `Prev | Page x/y | Next`.
- Disabled nav states must be visibly dimmed.

Manage:

- `Clear log` row with destructive confirmation alert.

## 5.2 Settings page (`Options.tsx`)

Purpose:

- Core behavior toggles only.

Current groups:

- Logging (`Log deletions`).
- Notifications (`Toast when caught`).
- Limits (`Encrypted auto backup`, `Unlimited entries`).

Rule: keep experimental/developer controls out of this page.

## 5.3 Backup page (`Backup.tsx`)

Purpose:

- User-facing backup operations and destination selection.

Action rows:

- `Create encrypted backup` (disabled until at least one logged entry exists).
- `Restore from encrypted backup` (always available).
- `Backup location` (opens alert chooser flow).
- `Last backup` metadata.

Informational rows:

- Notes group includes overwrite semantics and Android storage caveat.

Backup location flow details:

- First popup: `Plugin folder (default)` and `More locations`.
- More-locations popup: `App docs (private)`, `App cache (private)`, `Shared Download / SD card`.

Important platform constraint:

- Android alert UIs may cap visible actions; this is why location choices are split across popups.

## 5.4 Visual style page (`Visuals.tsx`)

Purpose:

- Select in-chat deleted message styling.

Rules:

- Single `TableRadioGroup` with clear, plain-language options.
- Include persistence/session behavior in group description.

## 5.5 Licence page (`License.tsx`)

Purpose:

- Attribution and license visibility.

Rules:

- Keep concise and factual.
- No behavior toggles here.

## 5.6 Debug page (`Debug.tsx`)

Purpose:

- Developer/tester tools only.

Current rows:

- `Count my own messages` toggle.
- `Resolved backup target path` display.
- `Fill log with 200 fake entries` action.

Rule: any tool that can alter test data or expose internals belongs here, not in user pages.

## 6) Interaction Rules

- Destructive actions must use confirmation alerts.
- Backup location changes must toast confirmation with chosen path.
- Backup create/restore actions must toast success/failure outcome.
- Disabled actions must explain why in subLabel.

## 7) Data-to-UI Binding Rules

- Always read storage with fallback merge: `{ ...DEFAULTS, ...(storage?.use() ?? {}) }`.
- Never access `revenge.*` at module scope for render-dependent modules.
- Navigator pages (without direct plugin API prop) must use `getStorage()` from `lib/state`.

## 8) Consistency Rules for Future Changes

When adding or changing settings UI:

1. Place it in the correct page by responsibility (user setting vs developer tool).
2. Use existing row/card primitives before creating custom controls.
3. Preserve 24px vertical rhythm and safe-area bottom padding.
4. Write sublabels that explain impact, not implementation.
5. Keep root index readable: one row per destination, predictable labels.
6. Update this document in the same change set.

## 9) Known Quirks (Must Remember)

- Android alert action limits can hide extra buttons.
- Shared storage (`/storage/emulated/0/...`) may fail on scoped-storage builds.
- Backup destination UX must account for both constraints above.

## 10) Canonical File Map

- Root index page: `plugins/ghost-log/src/ui/pages/Settings.tsx`
- Deleted messages page: `plugins/ghost-log/src/ui/pages/Log.tsx`
- Core settings page: `plugins/ghost-log/src/ui/pages/Options.tsx`
- Backup page: `plugins/ghost-log/src/ui/pages/Backup.tsx`
- Visual style page: `plugins/ghost-log/src/ui/pages/Visuals.tsx`
- Licence page: `plugins/ghost-log/src/ui/pages/License.tsx`
- Debug page: `plugins/ghost-log/src/ui/pages/Debug.tsx`
- Route registry: `plugins/ghost-log/src/ui/routes.tsx`
- Icon strategy: `plugins/ghost-log/src/ui/icon.tsx`
- Safe-area padding helper: `plugins/ghost-log/src/ui/safeArea.ts`

---

Maintainer note: this bible documents current behavior and intended structure as of Ghost Log `1.2.0`.
