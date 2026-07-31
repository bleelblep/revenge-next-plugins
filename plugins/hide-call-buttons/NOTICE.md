## Third-party code

This plugin is a Revenge Next port of **Hide call buttons** by John
([janisslsm](https://github.com/janisslsm), Discord ID `780819226839220265`), from
[janisslsm/vdplugins](https://github.com/janisslsm/vdplugins) (`plugins/HideCallButtons`).

It is a **derivative work**, not an independent implementation: the surfaces patched, the
button-detection heuristics (asset-id comparison against `props.icon` / `props.source`, with
legacy and current asset-name fallbacks), and the child-tree walks are all from the original.

The upstream repository is licensed **BSD-3-Clause**, retained here in full at
[`THIRD_PARTY_LICENSES/BSD-3-Clause.txt`](./THIRD_PARTY_LICENSES/BSD-3-Clause.txt):

```
Copyright (c) 2024 janisslsm
Copyright (c) 2022 redstonekasi
```

BSD-3-Clause is permissive, so this port may be redistributed provided that copyright notice,
the license text, and its disclaimer are retained — which the file above does. Its third clause
also forbids using the original authors' names to endorse this port; nothing here does.
