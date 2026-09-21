# revenge-next-plugins

Plugins for [Revenge Next](https://github.com/revenge-mod/revenge-bundle-next). This repository
contains original plugins and ports of Vendetta and classic Revenge plugins.

Last checked against Discord **348.0** (Android).

## Install

Add this URL as a plugin repository in Revenge Next:

```text
https://bleelblep.github.io/revenge-next-plugins/
```

## Original plugins

| Plugin | Description |
| --- | --- |
| **Screenshot Redactor** | Replaces names and avatars with stable placeholders for safer screenshots, and can blank emails, phone numbers, addresses, card numbers and API keys typed into messages. |
| **Screenshot Redactor (legacy)** | The `0.19.x` line for Discord builds before 347. Separate plugin id. |
| **Ghost Log Native Beta** | Saves deleted messages, encrypted on your device, and can keep them visible in chat across reloads. |
| **Hide Servers** | Locally hides servers or server folders from the server list. |
| **Translate** | Long-press a message to translate it in place, or translate incoming messages automatically. No key or account. |
| **Send Tweaks** | Removes link tracking, lets replies skip the ping, and applies your own find-and-replace rules. |
| **Second Thoughts** | Stops credentials and card numbers from being sent. With AI Core it also flags angry or oversharing drafts. |
| **Plugin Hub** | A Plugin Hub section in settings with shortcuts into the plugins you use most, plus an AI Hub for AI Core's plugins. |

### AI plugins

| Plugin | Description |
| --- | --- |
| **AI Core** | Shared API key, daily spending cap and request queue for the plugins below. Does nothing on its own. |
| **Catch Up** | `/catchup` summarises what you missed in a channel, visible only to you. Requires AI Core. |
| **Second Thoughts** | Works without AI Core; uses it, if installed, for judgement calls on drafts already flagged locally. |

## Ports

| Plugin | Original author | Description |
| --- | --- | --- |
| **Custom Timestamps** | Fiery | Changes how timestamps appear in chat. |
| **Hide Call Buttons** | John (`janisslsm`) | Hides call and video buttons on selected screens. |
| **Show Tag** | Cynosphere | Shows usernames or legacy Discord tags in message headers. |
| **Staff Tags** | Fiery, シグマ siguma | Adds staff and permission tags in chat and the member list. |

Anti Ghost Ping, Ghost Log and Relationship Notifier are no longer published. Installed copies keep
working but will not receive updates.

## Channels

Plugins use `latest` for stable releases. A plugin may also provide a `beta` channel for testing
newer versions. Channels are computed automatically: `latest` is the newest version without a label,
`beta` is the newest version overall.

Screenshot Redactor (`bleelblep.screenshot-redactor`, `0.27.x`) is for Discord 347 and newer.
Screenshot Redactor (legacy) (`bleelblep.screenshot-redactor-legacy`, `0.19.x`) is for older builds.

Ghost Log Native Beta is its own plugin id (`bleelblep.ghost-log-native-beta`) and publishes
`0.x.y-betaN` versions to both `latest` and `beta`.

Artifacts live in `pool/<id>@<version>.zip` on the `gh-pages` branch, next to `index.json`. The
repository URL above does not change.

## Important

- **Ghost Log Native Beta** is a message logger. It stores deleted message text on your device,
  encrypted with AES-GCM, and sends nothing anywhere. Message loggers may still increase the risk
  of Discord taking action against your account.
- **Catch Up** sends the messages it summarises (author ids and text, not attachments) to the AI
  provider configured in AI Core. **Second Thoughts** sends a draft to that provider only when AI
  Core is installed and a local check has already flagged the draft.
- **Translate** sends the text of messages you translate to Google, Bing, Yandex or MyMemory.
- **Screenshot Redactor** only blanks the personal details it can recognise in message text. A
  name typed into a message is still visible.

## Documentation

- [Development and publishing](./docs/development.md)
- [Plugin status and technical notes](./docs/plugin-notes.md)
- [Licensing and attribution](./docs/licensing.md)
- [Porting rules](./docs/porting-rules.md)
- [Known issues](./docs/known-issues.md)
