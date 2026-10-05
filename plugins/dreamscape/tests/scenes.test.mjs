import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, PRESETS, normalize, parseScene } from '../js/core/scenes.ts'

test('AI recipes reject unsupported types, nonfinite numbers and executable content', () => {
  for (const patch of [{ world: 'javascript' }, { color: 'url(example)' }, { speed: NaN },
    { intensity: Infinity }, { particles: 49 }, { name: '' }, { version: 2 }]) {
    assert.equal(parseScene({ ...PRESETS[0], ...patch }), undefined)
  }
  const scene = parseScene({ ...PRESETS[0], script: 'never retain code', particles: 4.4 }, 'saved_1')
  assert.equal(scene.id, 'saved_1')
  assert.equal(scene.particles, 4)
  assert.equal('script' in scene, false)
})

test('deleting a scene clears dangling channel assignments and selected scene', () => {
  const saved = { ...PRESETS[1], id: 'custom' }
  const before = normalize({ scenes: [saved], sceneId: 'custom', channels: { '123456789': 'custom' } })
  assert.equal(before.channels['123456789'], 'custom')
  const after = normalize({ ...before, scenes: [] })
  assert.equal(after.sceneId, 'space')
  assert.deepEqual(after.channels, {})
})

test('normalization cannot mutate defaults, reuse channel maps or keep invalid bindings', () => {
  const a = normalize({ channels: { '123456789': 'space' }, bindings: { circle: 'frost', zigzag: 'bad', v: 'prism' } })
  const b = normalize()
  assert.deepEqual(DEFAULTS.channels, {})
  assert.deepEqual(b.channels, {})
  assert.equal(a.bindings.circle, 'frost')
  assert.equal(a.bindings.zigzag, 'meteor')
  assert.equal(b.bindings.circle, 'portal')
})

test('corrupt and oversized saved libraries are bounded', () => {
  const s = normalize({ scenes: Array.from({ length: 60 }, (_, i) => ({ ...PRESETS[0], id: `s_${i}` })),
    strength: NaN, fps: 600, glassStyle: 'invalid', channels: { '../x': 'space' } })
  assert.equal(s.scenes.length, 40)
  assert.equal(s.strength, .5)
  assert.equal(s.fps, 60)
  assert.equal(s.glassStyle, 'clear')
  assert.deepEqual(s.channels, {})
})

test('frame targets and global playback survive normalization', () => {
  for (const fps of [15, 30, 60, 90]) assert.equal(normalize({ fps }).fps, fps)
  assert.equal(normalize({ fps: 144 }).fps, 60)
  assert.equal(normalize({ playEverywhere: true }).playEverywhere, true)
  assert.equal(normalize().playEverywhere, false)
})
