// Run: npx tsx src/utils/blockedImageHosts.test.ts
import assert from 'node:assert/strict'
import {
  BLOCKED_IMAGE_PLACEHOLDER,
  collectUrlHosts,
  filterBlockedCssUrls,
  filterBlockedImageUrl,
  filterBlockedSrcset,
  isBlockedHostname,
  isBlockedImageUrl,
  stripBlockedImagesFromHtml,
} from './blockedImageHosts'
import { legacyIpfsImageProxyFn, proxyLegacyIpfsImageUrl } from './ipfsImageProxy'
import { formatThumbnailUrl } from './thumbnail'
import { createHiveRenderer } from './safeHiveRenderer'

const IR = 'https://s6.uplod.ir/i/00885/b7de9gumvkde.jpg'

// Host names
for (const h of ['s6.uplod.ir', 'UPLOD.IR', 'uplod.ir.', 'a.b.cu', 'x.kp', 'img.sy', 'ir', 'xn--mgba3a4f16a', 'site.ایران']) {
  assert.equal(isBlockedHostname(h), true, h)
}
for (const h of ['images.hive.blog', 'iran.com', 'uplod.irx', 'ir.example.com', 'cuba.travel', 'sy.org', 'kp.net', 'files.peakd.com', '']) {
  assert.equal(isBlockedHostname(h), false, h)
}

// Direct, case, trailing dot, port, userinfo, protocol-relative
for (const u of [
  IR,
  'https://S6.UPLOD.IR/i/00893/09bqh9kx9q7n.jpg',
  'https://s6.uplod.ir./i/x.jpg',
  'https://s6.uplod.ir:443/i/x.jpg',
  'https://user:pw@s6.uplod.ir/x.jpg',
  'http://cdn.example.cu/a.png',
  '//s6.uplod.ir/i/x.jpg',
  'https://example.kp',
  'https://img.example.sy?x=1',
]) assert.equal(isBlockedImageUrl(u), true, u)

// Proxied and encoded forms
for (const u of [
  `https://images.hive.blog/0x0/${IR}`,
  `https://images.hive.blog/768x0/${IR}`,
  `https://images.ecency.com/p/${IR}`,
  'https://images.hive.blog/0x0/https:/s6.uplod.ir/i/x.jpg', // collapsed slashes
  `https://proxy.example.com/?url=${encodeURIComponent(IR)}`,
  `https://proxy.example.com/?url=${encodeURIComponent(encodeURIComponent(IR))}`,
  'https://images.hive.blog/0x0/https://s6.uplod.ir/i/x.jpg&amp;w=1',
]) assert.equal(isBlockedImageUrl(u), true, u)

// Not blocked: no substring false positives
for (const u of [
  'https://images.hive.blog/0x0/https://files.peakd.com/file/peakd-hive/x/abc.jpg',
  'https://example.com/photos/trip.ir/me.jpg', // .ir in the path, not the host
  'https://example.com/?caption=visited.ir',
  'https://example.com/img.irx/a.png',
  'https://ir.example.com/a.png',
  'https://iran.com/a.png',
  'data:image/png;base64,iVBORw0KGgo=',
  'blob:https://hivesuite.app/123',
  '',
  '/relative/s6.uplod.ir.png',
]) assert.equal(isBlockedImageUrl(u), false, u)
assert.equal(isBlockedImageUrl(undefined), false)
assert.equal(isBlockedImageUrl(42), false)

assert.deepEqual(collectUrlHosts(`https://images.hive.blog/0x0/${IR}`), ['images.hive.blog', 's6.uplod.ir'])

// Filters
assert.equal(filterBlockedImageUrl(IR), BLOCKED_IMAGE_PLACEHOLDER)
assert.equal(filterBlockedImageUrl('https://a.com/x.png'), 'https://a.com/x.png')
assert.ok(BLOCKED_IMAGE_PLACEHOLDER.startsWith('data:image/svg+xml,'))
assert.ok(!/['"()\s]/.test(BLOCKED_IMAGE_PLACEHOLDER), 'placeholder is safe in attributes and url()')
assert.equal(filterBlockedSrcset(`${IR} 1x, https://a.com/x.png 2x`), 'https://a.com/x.png 2x')
assert.equal(filterBlockedSrcset(`${IR} 1x`), BLOCKED_IMAGE_PLACEHOLDER)
assert.equal(filterBlockedCssUrls(`url("${IR}")`), `url(${BLOCKED_IMAGE_PLACEHOLDER})`)
assert.equal(filterBlockedCssUrls('url(https://a.com/x.png)'), 'url(https://a.com/x.png)')

// HTML
const html = `<p>hi</p><img src="${IR}" alt="x"><img src='https://a.com/ok.png'>` +
  `<a href="${IR}">link</a><img srcset="${IR} 1x, https://a.com/2.png 2x">` +
  `<div style="background-image: url(&quot;${IR}&quot;)"></div>`
const out = stripBlockedImagesFromHtml(html)
assert.ok(!out.includes(`src="${IR}"`))
assert.ok(out.includes(`<img src="${BLOCKED_IMAGE_PLACEHOLDER}" alt="x">`))
assert.ok(out.includes("src='https://a.com/ok.png'"))
assert.ok(out.includes(`<a href="${IR}">`), 'plain links are left alone')
assert.ok(out.includes('srcset="https://a.com/2.png 2x"'))
assert.ok(!/style="[^"]*uplod/.test(out), 'background url replaced')
assert.equal(stripBlockedImagesFromHtml('<p>no images</p>'), '<p>no images</p>')

// Helpers that build image URLs
assert.equal(proxyLegacyIpfsImageUrl(IR), BLOCKED_IMAGE_PLACEHOLDER)
assert.equal(formatThumbnailUrl(`https://images.hive.blog/0x0/${IR}`), BLOCKED_IMAGE_PLACEHOLDER)
assert.equal(formatThumbnailUrl('https://a.com/x.png'), 'https://a.com/x.png')

// Rendered post bodies
const render = createHiveRenderer()
for (const body of [
  `Hello ![pic](${IR})`,
  `Hello <img src="${IR}">`,
  `Hello ${IR}`,
  `Hello <center>![pic](https://images.hive.blog/0x0/${IR})</center>`,
]) {
  const rendered = render(body)
  assert.ok(!/<img[^>]+uplod\.ir/i.test(rendered), `no blocked img in: ${rendered}`)
}
// With the kit's imageProxyFn (as HiveDetailPost/SnapsFeedCard use it) the
// blocked image becomes the placeholder, not the renderer's "brokenimg.jpg".
const renderWithProxy = createHiveRenderer({ imageProxyFn: legacyIpfsImageProxyFn })
const proxied = renderWithProxy(`A ![pic](${IR}) B`)
assert.ok(proxied.includes(`src="${BLOCKED_IMAGE_PLACEHOLDER}"`), proxied)
assert.ok(!proxied.includes('brokenimg'), proxied)
assert.ok(render('![ok](https://files.peakd.com/a.png)').includes('files.peakd.com'))

console.log('blockedImageHosts tests passed')
