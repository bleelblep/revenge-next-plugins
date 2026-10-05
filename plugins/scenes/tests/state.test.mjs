import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { DEFAULTS, ATMOSPHERES, normalize } from '../js/model.ts'

const source = (await readFile(new URL('../js/state.ts', import.meta.url), 'utf8'))
  .replace("'./model'", JSON.stringify(new URL('../js/model.ts', import.meta.url).href))
const { start, update, settings } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('built-in choices and high frame rates survive normalization; invalid data is bounded', () => {
  for (const scene of ATMOSPHERES) assert.equal(normalize({ scene: scene.id }).scene, scene.id)
  for (const fps of [30, 60, 90]) assert.equal(normalize({ fps }).fps, fps)
  assert.deepEqual(normalize({ scene: 'custom-code', intensity: NaN, speed: Infinity, fps: 240 }), DEFAULTS)
  assert.equal(normalize({ intensity: 10, speed: -5 }).intensity, 1)
  assert.equal(normalize({ speed: -5 }).speed, .1)
})

function fixture(saved, loaded = true) {
  const subscribers = new Set(), calls = []
  let writes = 0
  const handle = {
    loaded, cache: loaded ? structuredClone(saved) : undefined,
    async get() { await Promise.resolve(); this.cache = structuredClone(saved); this.loaded = true; return this.cache },
    async set(value, replace) {
      assert.equal(replace, true)
      writes++
      this.cache = structuredClone(value)
      await Promise.resolve()
      for (const notify of subscribers) notify()
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
  }
  globalThis.revenge = { modules: { native: { async callNativeMethod(name, args) { calls.push({ name, args }); return { message: 'Applied' } } } } }
  return { handle, subscribers, calls, get writes() { return writes } }
}

test('async startup preserves preferences and rapid selections are applied in order', async () => {
  const f = fixture({ ...DEFAULTS, scene: 'ocean', intensity: .35 }, false)
  const stop = start(f.handle)
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.writes, 0)
    assert.equal(settings().scene, 'ocean')
    await Promise.all([update({ enabled: true, scene: 'rain' }), update({ fps: 90 }), update({ speed: 1 })])
    assert.equal(settings().scene, 'rain')
    assert.equal(settings().intensity, .35)
    assert.equal(settings().fps, 90)
    assert.equal(settings().speed, 1)
    assert.equal(f.calls.at(-1).args[0].enabled, true)
    await update({ enabled: false })
    assert.equal(f.calls.at(-1).args[0].enabled, false)
  } finally { stop() }
  assert.equal(f.subscribers.size, 0)
})

test('stopping before loading finishes cannot re-enable the shader', async () => {
  const f = fixture({ ...DEFAULTS, enabled: true }, false)
  const stop = start(f.handle)
  stop()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.calls.some(c => c.name.endsWith('.configure')), false)
  assert.equal(f.calls.at(-1).name, 'bleelblep.scenes.disable')
})

test('manifest is standalone with no AI dependency', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['discord', 'revenge.api'])
})
