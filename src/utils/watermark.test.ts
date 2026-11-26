// Run: npx tsx src/utils/watermark.test.ts
import assert from 'node:assert/strict'
import {
  computeWatermarkRect,
  effectiveWatermark,
  normaliseWatermarkMode,
  watermarkDefaultFor,
  watermarkNoteVisible,
  watermarkToggleVisible,
  WATERMARK_MAX_WIDTH,
  WATERMARK_MIN_WIDTH,
} from './watermark'

const ASPECT = 341 / 88

// Too small → no mark
assert.equal(computeWatermarkRect(199, 1000, ASPECT), null)
assert.equal(computeWatermarkRect(1000, 150, ASPECT), null)
assert.equal(computeWatermarkRect(NaN, 500, ASPECT), null)
assert.equal(computeWatermarkRect(500, 500, 0), null)

// Typical landscape photo (1920x1080): 14% of width = 268.8 → 269px, bottom-right with 2% of 1080 ≈ 22px margin
{
  const r = computeWatermarkRect(1920, 1080, ASPECT)!
  assert.equal(r.width, 269)
  assert.equal(r.height, Math.round(269 / ASPECT))
  assert.equal(r.x, 1920 - 22 - 269)
  assert.equal(r.y, 1080 - 22 - r.height)
}

// Very wide image: clamped to the max width
{
  const r = computeWatermarkRect(4000, 1000, ASPECT)!
  assert.equal(r.width, WATERMARK_MAX_WIDTH)
}

// Small image: min width, but never more than 40% of the image width
{
  const r = computeWatermarkRect(300, 300, ASPECT)!
  assert.equal(r.width, WATERMARK_MIN_WIDTH)
  const tiny = computeWatermarkRect(200, 600, ASPECT)!
  assert.ok(tiny.width <= 80)
}

// Always fully inside the image
for (const [w, h] of [[200, 200], [720, 1280], [1080, 1920], [1920, 1920], [3000, 400]]) {
  const r = computeWatermarkRect(w, h, ASPECT)!
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h, `${w}x${h}`)
}

// Mode → state and visibility
assert.equal(normaliseWatermarkMode('forced'), 'forced')
assert.equal(normaliseWatermarkMode('default-on'), 'default-on')
assert.equal(normaliseWatermarkMode('off'), 'off')
assert.equal(normaliseWatermarkMode(undefined), 'off')
assert.equal(normaliseWatermarkMode('yes'), 'off')

assert.equal(watermarkDefaultFor('forced'), true)
assert.equal(watermarkDefaultFor('default-on'), true)
assert.equal(watermarkDefaultFor('off'), false)

assert.equal(effectiveWatermark('forced', false), true)
assert.equal(effectiveWatermark('off', true), false)
assert.equal(effectiveWatermark('default-on'), true)
assert.equal(effectiveWatermark('default-on', false), false)

assert.equal(watermarkToggleVisible('default-on'), true)
assert.equal(watermarkToggleVisible('forced'), false)
assert.equal(watermarkToggleVisible('off'), false)
assert.equal(watermarkNoteVisible('forced'), true)
assert.equal(watermarkNoteVisible('default-on'), false)
assert.equal(watermarkNoteVisible('off'), false)

console.log('watermark tests passed')
