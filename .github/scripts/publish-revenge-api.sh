#!/usr/bin/env bash
# Publishes io.github.revenge:api from revenge-xposed into Maven Local.
#
# Native plugins compile against that artifact, and it is not published to any public repository.
# Pin REVENGE_XPOSED_REF to the release the plugins are tested against. Bump it together with
# `revengeApi` in gradle/libs.versions.toml when the API version changes.

set -euo pipefail

REVENGE_XPOSED_REF="${REVENGE_XPOSED_REF:-1603}"
checkout="${RUNNER_TEMP:-/tmp}/revenge-xposed"

rm -rf "$checkout"
git clone --depth 1 --branch "$REVENGE_XPOSED_REF" https://github.com/revenge-mod/revenge-xposed.git "$checkout"
(cd "$checkout" && ./gradlew --no-daemon :api:publishToMavenLocal)
