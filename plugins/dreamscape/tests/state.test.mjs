import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { DEFAULTS } from '../js/core/scenes.ts'

// Load the standalone state module without Discord or a Metro runtime.
const source = (await readFile(new URL('../js/core/state.ts', import.meta.url), 'utf8'))
  .replace("'./scenes'", JSON.stringify(new URL('../js/core/scenes.ts', import.meta.url).href))
const { start, settings, update, previewScene } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

function fixture(saved, loaded = true) {
  const subscribers = new Set()
  const calls = []
  let reads = 0, writes = 0
  const handle = {
    loaded, cache: loaded ? structuredClone(saved) : undefined,
    async get() {
      reads++
      await Promise.resolve()
      this.cache = structuredClone(saved)
      this.loaded = true
      for (const notify of subscribers) notify()
      return this.cache
    },
    async set(value, replace) {
      writes++
      assert.equal(replace, true)
      this.cache = structuredClone(value)
      await Promise.resolve()
      for (const notify of subscribers) notify()
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
  }
  globalThis.revenge = {
    modules: { native: { async callNativeMethod(name, args) { calls.push({ name, args }); return true } } },
    discord: { flux: { Stores: {} } },
  }
  return { handle, calls, subscribers, get reads() { return reads }, get writes() { return writes } }
}

test('toggles read the cached value and reach the native engine in both directions', async () => {
  const f = fixture({ ...DEFAULTS, hologram: true })
  const stop = start({ jsonStorage: f.handle })
  try {
    assert.equal(settings().hologram, true)
    await update({ enabled: true, demo: true })
    assert.equal(settings().enabled, true)
    assert.equal(settings().hologram, true)
    assert.equal(f.calls.at(-1).args[0].enabled, true)
    assert.equal(f.calls.at(-1).args[0].demo, true)
    await update({ enabled: false })
    assert.equal(settings().enabled, false)
    assert.equal(f.calls.at(-1).args[0].enabled, false)
    assert.equal(f.reads, 0, 'render/sync must not start asynchronous disk reads')
  } finally { stop() }
  assert.equal(f.subscribers.size, 0)
})

test('startup preserves asynchronously loaded preferences instead of writing defaults', async () => {
  const f = fixture({ ...DEFAULTS, enabled: true, strength: .75, sceneId: 'ocean' }, false)
  const stop = start({ jsonStorage: f.handle })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settings().enabled, true)
    assert.equal(settings().strength, .75)
    assert.equal(settings().sceneId, 'ocean')
    assert.equal(f.writes, 0)
    assert.equal(f.calls.at(-1).args[0].scene.id, 'ocean')
  } finally { stop() }
})

test('removing a channel assignment replaces its persisted map', async () => {
  const f = fixture({ ...DEFAULTS, channels: { '123456789': 'space' } })
  const stop = start({ jsonStorage: f.handle })
  try {
    await update({ channels: {} })
    assert.deepEqual(f.handle.cache.channels, {})
    assert.deepEqual(settings().channels, {})
  } finally { stop() }
})

test('preview enables and configures the engine before requesting the selected scene', async () => {
  const f = fixture({ ...DEFAULTS, enabled: false, dreams: false })
  const stop = start({ jsonStorage: f.handle })
  try {
    await previewScene()
    assert.equal(settings().enabled, true)
    assert.equal(settings().dreams, true)
    const preview = f.calls.at(-1)
    assert.equal(preview.name, 'bleelblep.dreamscape.preview')
    assert.equal(preview.args[0].id, 'space')
    assert.equal(f.calls.at(-2).name, 'bleelblep.dreamscape.configure')
    assert.equal(f.calls.at(-2).args[0].enabled, true)
  } finally { stop() }
})
