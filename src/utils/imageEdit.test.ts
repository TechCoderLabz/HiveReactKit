// Run: npx tsx src/utils/imageEdit.test.ts
import assert from 'node:assert/strict'
import { composeImageEdit } from './imageEdit'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

// First edit: relative to the original as-is
{
  const e = composeImageEdit(undefined, { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, [{ x: 0, y: 0, width: 0.1, height: 0.1, style: 'blackout' }])
  assert.deepEqual(e.rect, { x: 0.1, y: 0.2, width: 0.5, height: 0.5 })
  assert.equal(e.blurRects.length, 1)
  assert.equal(e.blurRects[0].style, 'blackout')
}

// Second crop is relative to the first crop
{
  const first = composeImageEdit(undefined, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, [{ x: 0, y: 0, width: 0.2, height: 0.2 }])
  const second = composeImageEdit(first, { x: 0.5, y: 0, width: 0.5, height: 1 }, [{ x: 0, y: 0, width: 1, height: 0.5 }])
  close(second.rect.x, 0.75); close(second.rect.y, 0.5); close(second.rect.width, 0.25); close(second.rect.height, 0.5)
  // previous blur kept as-is, new blur mapped through the first crop
  assert.equal(second.blurRects.length, 2)
  assert.deepEqual(second.blurRects[0], first.blurRects[0])
  close(second.blurRects[1].x, 0.5); close(second.blurRects[1].y, 0.5); close(second.blurRects[1].width, 0.5); close(second.blurRects[1].height, 0.25)
}

// Full-frame apply (e.g. only the watermark switch changed) keeps the edit
{
  const first = composeImageEdit(undefined, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 })
  const again = composeImageEdit(first, { x: 0, y: 0, width: 1, height: 1 })
  assert.deepEqual(again.rect, first.rect)
}

console.log('imageEdit tests passed')
