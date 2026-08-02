# Development and publishing

## Setup

```sh
pnpm install
pnpm run build
node serve.mjs --watch
```

`serve.mjs` builds the plugins, serves `dist/` over the local network, and prints a repository URL
that can be added to Revenge Next. With `--watch`, it rebuilds when plugin files change.

For device logs, use:

```sh
adb logcat -s ReactNativeJS:V
```

See [porting rule 5](./porting-rules.md#5-read-the-app-instead-of-guessing) for the full debugging
workflow and its known traps.

## Debug websocket

```sh
node devtools.mjs
```

Point Revenge Next's Debugger URL at the address printed by the script. The `ws` package is only
needed for this local tool and is intentionally not a project dependency. Install it without
saving when needed:

```sh
pnpm add ws --save-dev=false
```

## Manifest requirements

Every `plugins/<name>/manifest.json` is a complete format-1 plugin manifest. `build.mjs` validates
the manifests and fails the build when required fields are missing.

Required fields:

- `format: 1`
- `id`, `name`, `description`, `author`, and `version`
- `dependencies.revenge.api.version`
- `dependencies.discord.version`
- `dist.script`, currently required to be `index.js`

Example:

```json
{
  "format": 1,
  "id": "bleelblep.example-plugin",
  "name": "Example Plugin",
  "description": "What it does",
  "author": "Your Name",
  "version": "1.0.0",
  "dependencies": {
    "revenge.api": { "version": ">=1 <2" },
    "discord": { "version": "*" }
  },
  "dist": {
    "script": "index.js"
  }
}
```

## Channels

`build.mjs` automatically points `latest` at the newest stable version and `beta` at the newest
prerelease when it is newer than `latest`.

`repo.config.json` can override those pointers or add custom channels. An override must reference
a version present in the generated repository index or the build fails.

Current Screenshot Redactor configuration:

```json
{
  "channels": {
    "bleelblep.screenshot-redactor": {
      "latest": "0.19.1",
      "beta": "0.25.2-beta1"
    }
  }
}
```

## Build output

Each version is written to `dist/<plugin-id>-<version>.zip`. Each ZIP contains `manifest.json` and
`index.js`.

The builder also writes `dist/<plugin-id>.zip` as a compatibility alias for the current `latest`
channel. `dist/index.json` contains repository metadata, versions, channels, artifact URLs, sizes,
and SHA-256 hashes.

Version history is inherited from the previous deployed `index.json`. The deployment workflow
fetches that file from the `gh-pages` branch before building.

## Local-only plugins

These folders are ignored by Git and therefore do not exist in a clean CI checkout:

- `plugins/jump-to-top/`
- `plugins/multi-scrobbler/`

Local builds still include them because `build.mjs` builds every folder present under `plugins/`.

## CI and lockfile

CI installs dependencies with pnpm. Commit `pnpm-lock.yaml` whenever dependencies change so local
and CI builds resolve the same dependency versions.

## Types

`types/next/` is the generated type surface from `revenge-bundle-next` (`bun types` to
`dist/types`). `types/globals.d.ts` declares the `plugin()` and `revenge` globals supplied to an
external plugin.

Regenerate the vendored types when the upstream API changes. More context is in
[porting rule 7](./porting-rules.md#7-use-the-official-types-not-guesses).
