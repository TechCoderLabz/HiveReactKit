/**
 * Display helper for images that were published to 3Speak's IPFS gateway.
 * That gateway no longer serves image bytes. Video manifests stay on their
 * original URL — the 3Speak player resolves those itself.
 */
import { BLOCKED_IMAGE_PLACEHOLDER, isBlockedImageUrl } from './blockedImageHosts'

const HIVE_IMAGE_PROXY = 'https://images.hive.blog'
const PUBLIC_IPFS_GATEWAY = 'https://ipfs.io'

const VIDEO_PATH = /\.(?:mp4|webm|ogv|mov|m4v|m3u8)(?:$|\?)/i

const THREESPEAK_IPFS_HOSTS = new Set([
  'ipfs.3speak.tv',
  'ipfs-3speak.b-cdn.net',
  'hotipfs-3speak-1.b-cdn.net',
])

/** CID plus any trailing path (`Qm…/poster.png`), without a query string. */
export function extractIpfsCidPath(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed.startsWith('ipfs://')) {
    const rest = trimmed.replace(/^ipfs:\/\/(?:ipfs\/)?/, '').split(/[?#]/)[0]
    return rest || null
  }
  const marker = '/ipfs/'
  const idx = trimmed.indexOf(marker)
  if (idx === -1) return null
  const rest = trimmed.slice(idx + marker.length).split(/[?#]/)[0]
  return rest || null
}

export function isIpfsVideoUrl(url: string): boolean {
  if (VIDEO_PATH.test(url)) return true
  const cidPath = extractIpfsCidPath(url)
  return Boolean(cidPath && VIDEO_PATH.test(cidPath))
}

function isLegacyThreeSpeakIpfsImage(url: string): boolean {
  if (url.startsWith('ipfs://')) return !isIpfsVideoUrl(url)
  try {
    return THREESPEAK_IPFS_HOSTS.has(new URL(url).hostname) && !isIpfsVideoUrl(url)
  } catch {
    return false
  }
}

/**
 * Route a legacy 3Speak IPFS image (or a bare `ipfs://` image link) through
 * images.hive.blog, which fetches the bytes from a public IPFS gateway.
 * Non-image URLs and video assets are returned unchanged.
 */
export function proxyLegacyIpfsImageUrl(url: string): string {
  if (!url) return url
  const trimmed = url.trim()
  if (isBlockedImageUrl(trimmed)) return BLOCKED_IMAGE_PLACEHOLDER
  if (!trimmed || !isLegacyThreeSpeakIpfsImage(trimmed)) return trimmed
  const cidPath = extractIpfsCidPath(trimmed)
  if (!cidPath) return trimmed
  const direct = `${PUBLIC_IPFS_GATEWAY}/ipfs/${cidPath}`
  return `${HIVE_IMAGE_PROXY}/0x0/${direct}`
}

/** `imageProxyFn` for the markdown renderer. */
export function legacyIpfsImageProxyFn(url: string): string {
  if (!url) return url
  return proxyLegacyIpfsImageUrl(url)
}
