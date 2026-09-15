# Development and publishing

This repository follows the official
[Revenge plugin template](https://github.com/revenge-mod/revenge-plugin-template). Its README is
the reference for the manifest, version ordering, channels and the pool; this page only records what
is specific to this repository.

## Layout

```
plugins/<name>/
├── manifest.json            # id, version, dist.script, dist.android
├── js/index.ts              # JS entry -> index.js
└── src/main/kotlin/...      # native plugins only -> plugin.jar
```

A folder with `src/main` is a native plugin and gets a Gradle module. Everything else is JS-only.
`ghost-log-native-beta` is the only native plugin here. Its `plugin.jar` is built from source by
Gradle, never committed.

## Prerequisites

- JDK 25 and the Android SDK (`sdk.dir` in `local.properties`, or `ANDROID_HOME`).
- Bun.
- The Revenge plugin API in Maven Local. It is not on any public repository:

  ```sh
  .github/scripts/publish-revenge-api.sh     # clones revenge-xposed at the pinned tag and publishes it
  ```

## Build

```sh
bun install
bun run build                                  # every JS bundle -> plugins/<name>/build/js/index.js
./gradlew packageAllPlugins -x buildJs         # zips -> build/dist/<id>@<version>.zip
```

On Windows, Gradle's `buildJs` step cannot find Bun (it probes for an extensionless `bun` file),
so it silently skips the JS and packages zips without `index.js`. Run `bun run build` yourself and
pass `-x buildJs` as above. CI runs on Linux and is unaffected.

## Test on a device

```sh
./gradlew packageAllPlugins -x buildJs
bun run serve                                  # http://<lan-ip>:8080
```

Add the printed URL as a repository in Revenge Next.

## Releasing

Push to `main`. `.github/workflows/release.yml` checks out the pool on `gh-pages`, releases every
plugin whose manifest version is not in `pool/` yet, regenerates `index.json`, and tags each release.

- **Bump the manifest version** to release. An unchanged version is skipped, so a code change
  without a bump ships nothing.
- **A version may never go below the newest published version of that plugin id.** The release
  fails otherwise.
- `latest` is the newest unlabeled version and `beta` the newest overall. Override either in
  `repo.config.json`, then run the *Publish repository index* workflow.

### Version numbers

Use SemVer meaning — `MAJOR.MINOR.PATCH` — inside Revenge's stricter format:

| Change | Bump | Example |
| --- | --- | --- |
| Bug fix, no behaviour or settings change | PATCH | `1.2.4` → `1.2.5` |
| New feature or setting, old data still loads | MINOR | `1.2.5` → `1.3.0` |
| Breaking: storage/backup format change, removed setting, needs a reinstall | MAJOR | `1.3.0` → `2.0.0` |
| Test build on the way to a release | `-betaN` on the **upcoming** version | `0.6.0-beta1`, `0.6.0-beta2`, … |

Rules that are Revenge's, not SemVer's:

- **Exactly one label, lowercase letters and digits only.** `1.2.0-beta3` is valid;
  SemVer's dotted `1.2.0-beta.3` and `1.2.0-rc.1` are **rejected** by the index generator.
- Digit runs in a label compare numerically, so `beta10` > `beta9`. No zero-padding needed.
- A labeled version sorts **below** its bare version: `0.6.0-beta4` < `0.6.0`, so promoting a beta
  to stable is just dropping the label.
- **Never reuse or lower a number** — not even for a build you only side-loaded from a local zip.
  A phone that has `0.5.0-beta2` installed will never be offered `0.5.0-beta1`, and two different
  builds sharing one number can't be told apart in a bug report. Check what's installed on test
  devices before picking the next number.
- `0.x` means "still unstable"; move a plugin to `1.0.0` once its settings and storage format are
  something you're prepared to keep compatible.

### Screenshot Redactor's two folders

`plugins/screenshot-redactor` (stable, `0.19.x`) and `plugins/screenshot-redactor-dev` (beta,
`0.25.x-betaN`) share the id `bleelblep.screenshot-redactor`. The downgrade rule compares against
the newest published version of the **id**, so once `0.25.2-beta2` is published, a stable
`0.19.3` would be refused. Promote a stable release from the `0.25` line instead, or pin it
through a channel override.

## Local-only plugins

`jump-to-top`, `multi-scrobbler` and `who-reacted` are gitignored. Local builds package them;
releases run from a clean CI checkout, so they can never be published.

## Device logs

```sh
adb logcat -s ReactNativeJS:V
```

For a live JS console without adb, see `revenge-next-native-plugins/dbg.mjs` (devtools protocol
v5). See [porting rule 5](./porting-rules.md#5-read-the-app-instead-of-guessing) for the full
debugging workflow.
