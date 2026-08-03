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

---

## 10) Relationship to Plugin-Specific Bibles

This file is the **global language spec** for this repository.

Plugin-specific docs (for example `docs/ghost-log-settings-bible.md`) may add tighter constraints
for one plugin, but they must not contradict this shared document unless there is a documented,
intentional exception.
