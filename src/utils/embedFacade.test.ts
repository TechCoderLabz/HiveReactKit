import assert from 'node:assert/strict'
import {
  nextEmbedActiveState,
  odyseeTitleFromUrl,
  spotifyKindFromUrl,
  withOdyseeAutoplay,
  youtubeThumbnailUrl,
} from './embedFacade'

// YouTube thumbnails go through the Hive image proxy
assert.equal(
  youtubeThumbnailUrl('dQw4w9WgXcQ'),
  'https://images.hive.blog/640x0/https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
)
assert.equal(youtubeThumbnailUrl('bad id'), null)
assert.equal(youtubeThumbnailUrl('dQw4w9WgXcQ', 320)?.startsWith('https://images.hive.blog/320x0/'), true)

// Odysee
assert.equal(
  withOdyseeAutoplay('https://odysee.com/$/embed/my-video/abc123'),
  'https://odysee.com/$/embed/my-video/abc123?autoplay=true',
)
assert.equal(
  withOdyseeAutoplay('https://odysee.com/$/embed/v/a?autoplay=false'),
  'https://odysee.com/$/embed/v/a?autoplay=false',
)
assert.equal(withOdyseeAutoplay('not a url'), 'not a url')
assert.equal(odyseeTitleFromUrl('https://odysee.com/@chan:1/my-cool_video:a'), 'my cool video')
assert.equal(odyseeTitleFromUrl('https://odysee.com/@chan:1'), null)

// Spotify
assert.equal(spotifyKindFromUrl('https://open.spotify.com/track/abc'), 'track')
assert.equal(spotifyKindFromUrl('https://open.spotify.com/embed/album/abc'), 'album')
assert.equal(spotifyKindFromUrl('https://example.com/x'), null)

// Active player only drops back to the facade when it leaves the enlarged viewport
assert.equal(nextEmbedActiveState(true, true), true)
assert.equal(nextEmbedActiveState(true, false), false)
assert.equal(nextEmbedActiveState(false, true), false)

console.log('embedFacade tests passed')
