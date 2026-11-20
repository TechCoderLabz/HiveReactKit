// Run: npx tsx src/utils/blockedImageGuard.test.ts
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://hivesuite.app/' })
const g = globalThis as Record<string, unknown>
for (const key of ['window', 'document', 'Element', 'MutationObserver', 'Node']) {
  g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}

const { installBlockedImageGuard } = await import('./blockedImageGuard')
const { BLOCKED_IMAGE_PLACEHOLDER } = await import('./blockedImageHosts')
installBlockedImageGuard()
installBlockedImageGuard() // idempotent

const IR = 'https://s6.uplod.ir/i/00893/09bqh9kx9q7n.jpg'
const OK = 'https://files.peakd.com/a.png'
const { document } = dom.window

// setAttribute (what React uses for <img src>)
const a = document.createElement('img')
a.setAttribute('src', `https://images.hive.blog/0x0/${IR}`)
assert.equal(a.getAttribute('src'), BLOCKED_IMAGE_PLACEHOLDER)
a.setAttribute('src', OK)
assert.equal(a.getAttribute('src'), OK)
a.setAttribute('srcset', `${IR} 1x, ${OK} 2x`)
assert.equal(a.getAttribute('srcset'), `${OK} 2x`)
a.setAttribute('alt', IR) // non-URL attributes untouched
assert.equal(a.getAttribute('alt'), IR)

// Links keep their href
const link = document.createElement('a')
link.setAttribute('href', IR)
assert.equal(link.getAttribute('href'), IR)

// Property setters (new Image().src = …)
const b = new dom.window.Image()
b.src = IR
assert.equal(b.getAttribute('src'), BLOCKED_IMAGE_PLACEHOLDER)
const v = document.createElement('video')
v.poster = '//S6.UPLOD.IR./x.jpg'
assert.equal(v.getAttribute('poster'), BLOCKED_IMAGE_PLACEHOLDER)

// Inline background images
const d = document.createElement('div')
d.style.backgroundImage = `url("${IR}")`
assert.ok(!d.getAttribute('style')?.includes('uplod'), d.getAttribute('style') ?? '')
d.style.setProperty('background-image', `url(${IR})`)
assert.ok(!d.getAttribute('style')?.includes('uplod'), d.getAttribute('style') ?? '')
d.setAttribute('style', `background: url(${IR}) center`)
assert.ok(!d.getAttribute('style')?.includes('uplod'), d.getAttribute('style') ?? '')

// innerHTML is caught by the MutationObserver
const host = document.createElement('div')
document.body.appendChild(host)
host.innerHTML = `<p><img src="${IR}"><img src="${OK}"></p>`
await new Promise((r) => setTimeout(r, 0))
const imgs = host.querySelectorAll('img')
assert.equal(imgs[0].getAttribute('src'), BLOCKED_IMAGE_PLACEHOLDER)
assert.equal(imgs[1].getAttribute('src'), OK)

console.log('blockedImageGuard tests passed')
