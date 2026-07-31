## Third-party code — GPL-3.0

This plugin is a Revenge Next port of **Multi Scrobbler** by
[kmmiio99o](https://github.com/kmmiio99o), from
[kmmiio99o/vd-plugins](https://github.com/kmmiio99o/vd-plugins) (`plugins/multi-scrobbler`).

It is a close derivative work — the service clients, the scrobble-to-activity mapping, the
`LOCAL_ACTIVITY_UPDATE` dispatch, and the polling logic are all from the original.

> ### ⚠️ This plugin is GPL-3.0, unlike the rest of this repository
>
> The upstream repository is licensed [GPL-3.0](./THIRD_PARTY_LICENSES/GPL-3.0.txt), which is
> copyleft, so this port is GPL-3.0 too. Everything else here is CC0.
>
> That is fine — licences apply per work, not per repository — but it does mean this directory
> can't be relicensed, and anything that copies code *out* of it inherits GPL-3.0. The only other
> GPL-3.0 file in this repo is `plugins/hide-servers-drawer/src/patches/createElementIntercept.ts`
> (also from kmmiio99o).

### Deliberately not ported

- **`sidebar.tsx`** — added a "Multi Scrobbler" row to Discord's own Settings overview by patching
  `SettingsOverviewScreen`. It's built on Bunny-specific globals (`window.bunny.metro.*`) and
  `NavigationNative`, neither of which exists in Revenge Next, and it's redundant here: Revenge
  already gives every plugin with a `SettingsComponent` its own settings route.
- **`onSettingsUpdate` / `onDiscordReconnect`** — Vendetta lifecycle hooks with no equivalent.
  Replaced with a `jsonStorage.subscribe()` and a Flux subscription respectively.
