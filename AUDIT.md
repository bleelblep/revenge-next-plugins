# Plugin Audit (Read-Only)

Repository audited: `C:\Users\bridget kawiti\Documents\android\revenge-next-plugins`
Template baseline: `https://github.com/revenge-mod/revenge-plugin-template`

## What I checked

- Root build and publish flow (`build.mjs`, `.github/workflows/deploy.yml`, `README.md`, `.gitignore`).
- All plugin folders under `plugins/`.
- Current template manifest and repo expectations from `revenge-plugin-template`.

## Main issues (simple)

1. **Manifest format mismatch with template**
   - Source plugin manifests are minimal and do not include template fields like `format`, `id`, `dependencies`, and `dist`.
   - Your custom `build.mjs` injects these at build time instead.

2. **Dependency ranges are too broad by default**
   - Build output defaults to:
     - `revenge.api: >=1`
     - `discord: *`
   - Template guidance suggests tighter tested ranges (example: `revenge.api >=1 <2`).

3. **CI reproducibility risk**
   - CI uses `pnpm install`, but there is no committed `pnpm-lock.yaml`.
   - `package-lock.json` exists locally but is ignored.

4. **README is out of date**
   - It says "Eight plugins", but plugin count has increased.
   - `who-reacted` exists in `plugins/` but is not listed in the root README plugin table.

## Per-plugin status

Published plugin folders currently visible:

- `anti-ghost-ping`
- `custom-timestamps`
- `ghost-log`
- `hide-call-buttons`
- `hide-servers-drawer`
- `relationship-notifier`
- `screenshot-redactor`
- `show-tag`
- `staff-tags`
- `who-reacted`

Local-only plugins (intentionally excluded from publish by `.gitignore` policy):

- `jump-to-top`
- `multi-scrobbler`
- `screenshot-redactor-dev`

Notes:

- License/NOTICE files are present for ported plugins reviewed.
- `anti-ghost-ping` and `relationship-notifier` are original plugins and currently have no `NOTICE.md` (not necessarily wrong, just different from your README wording that says every ported plugin carries one).

## Recommended next actions

1. Normalize `plugins/*/manifest.json` to template-style schema (especially `format`, `id`, `dependencies`, `dist`).
2. Tighten `revenge.api` version constraints to tested ranges per plugin.
3. Pick one package-manager lockfile strategy for CI and commit the lockfile used by CI.
4. Update root `README.md` plugin count/table and include `who-reacted`.
5. Optional: add `repo.config.json` if you want explicit manual channel overrides like the template.
