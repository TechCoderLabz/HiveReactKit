// Run: npx tsx src/utils/youtubeEmbed.test.ts
import assert from 'node:assert/strict'
import {
  youtubeEmbedNeedsHostedPage,
  youtubeEmbedSrc,
} from './youtubeEmbed'

const WEB = { protocol: 'https:', nativePlatform: false }
const IOS = { protocol: 'capacitor:', nativePlatform: true }
const ANDROID = { protocol: 'https:', nativePlatform: true }
const ID = 'bDk6YnbtAHQ'

assert.equal(youtubeEmbedNeedsHostedPage(WEB), false)
assert.equal(youtubeEmbedNeedsHostedPage(IOS), true)
assert.equal(youtubeEmbedNeedsHostedPage(ANDROID), true)
assert.equal(youtubeEmbedNeedsHostedPage({ protocol: 'capacitor:', nativePlatform: false }), true)
assert.equal(youtubeEmbedNeedsHostedPage({ protocol: 'ionic:', nativePlatform: false }), true)
assert.equal(youtubeEmbedNeedsHostedPage({ protocol: 'file:', nativePlatform: false }), true)
assert.equal(youtubeEmbedNeedsHostedPage({ protocol: 'http:', nativePlatform: false }), false)

assert.equal(
  youtubeEmbedSrc(ID, { autoplay: true }, WEB),
  `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&playsinline=1`,
)
assert.equal(
  youtubeEmbedSrc(ID, {}, WEB),
  `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1`,
)

for (const env of [IOS, ANDROID]) {
  assert.equal(
    youtubeEmbedSrc(ID, {}, env),
    `https://hivesuite.app/yt-embed.html?v=${ID}&rel=0&playsinline=1`,
  )
  assert.equal(
    youtubeEmbedSrc(ID, { autoplay: true }, env),
    `https://hivesuite.app/yt-embed.html?v=${ID}&autoplay=1&rel=0&playsinline=1`,
  )
}

assert.equal(youtubeEmbedSrc('not an id', {}, WEB), 'about:blank')
assert.equal(
  youtubeEmbedSrc(`${ID}?autoplay=1`, { autoplay: true }, IOS),
  `https://hivesuite.app/yt-embed.html?v=${ID}&autoplay=1&rel=0&playsinline=1`,
)
assert.equal(youtubeEmbedSrc('../etc/passwd', {}, ANDROID), 'about:blank')

const hosted = new URL(youtubeEmbedSrc(ID, { autoplay: true }, IOS))
assert.equal(hosted.origin + hosted.pathname, 'https://hivesuite.app/yt-embed.html')
assert.equal(hosted.searchParams.get('v'), ID)
assert.equal(hosted.searchParams.has('origin'), false)

console.log('youtubeEmbed: ok')
