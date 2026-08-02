## Third-party code

The technique for keeping deleted messages visible in the chat with a visual indicator
(`__vml_deleted` flag, `RowManager.prototype.generate` styling, `MessageRecordUtils` and
`MessageRecord` patching) comes from **redstonekasi's message-logger** in
[redstonekasi/vendetta-plugins](https://github.com/redstonekasi/vendetta-plugins/tree/main/plugins/message-logger),
licensed **BSD-3-Clause** (see [`THIRD_PARTY_LICENSES/BSD-3-Clause.txt`](./THIRD_PARTY_LICENSES/BSD-3-Clause.txt)).

The broader plugin architecture (delete interception, jsonStorage persistence, settings
pages) is adapted from bleelblep's own **Anti Ghost Ping**, which is CC0-1.0.

Ghost Log itself is **CC0-1.0**, except the visual indicator approach retained from
redstonekasi's work under BSD-3-Clause above.
