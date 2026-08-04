# revenge-next-plugins

Plugins for [Revenge Next](https://github.com/revenge-mod/revenge-bundle-next). This repository
contains original plugins and ports of Vendetta and classic Revenge plugins.

## Install

Add this URL as a plugin repository in Revenge Next:

```text
https://bleelblep.github.io/revenge-next-plugins/
```

## Original plugins

| Plugin | Description |
| --- | --- |
| **Anti Ghost Ping** | Saves messages that pinged you and were then deleted. |
| **Ghost Log** | Saves deleted messages and can keep them visible in chat. |
| **Hide Servers** | Locally hides servers or server folders from the server list. |
| **Relationship Notifier** | Records friend removals, lost mutual servers, and closed group DMs. |
| **Screenshot Redactor** | Replaces names and avatars with placeholders for safer screenshots. |

## Ports

| Plugin | Original author | Description |
| --- | --- | --- |
| **Custom Timestamps** | Fiery | Changes how timestamps appear in chat. |
| **Hide Call Buttons** | John (`janisslsm`) | Hides call and video buttons on selected screens. |
| **Show Tag** | Cynosphere | Shows usernames or legacy Discord tags in message headers. |
| **Staff Tags** | Fiery, シグマ siguma | Adds staff and permission tags in chat and the member list. |

## Channels

Plugins use `latest` for stable releases. A plugin may also provide a `beta` channel for testing
newer versions.

Screenshot Redactor currently provides:

- `latest`: `0.19.1`
- `beta`: `0.25.2-beta1`

Ghost Log Native Beta has moved to
[bleelblep/revenge-next-native-plugins](https://github.com/bleelblep/revenge-next-native-plugins)
and is no longer published from this repository.

## Important

Anti Ghost Ping and Ghost Log store deleted message text unencrypted on your device. Nothing is
sent outside your device, but message loggers may increase the risk of Discord taking action
against your account.

Screenshot Redactor does not change message text. A person's name can still appear if somebody
typed it directly into a message.

## Documentation

- [Development and publishing](./docs/development.md)
- [Plugin status and technical notes](./docs/plugin-notes.md)
- [Licensing and attribution](./docs/licensing.md)
- [Porting rules](./docs/porting-rules.md)
- [Known issues](./docs/known-issues.md)
