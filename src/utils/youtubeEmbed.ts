/**
 * YouTube iframe URL for in-feed embeds.
 *
 * The HiveSuite app has the same helper at `src/utils/youtubeEmbed.ts` and
 * serves the wrapper from `public/yt-embed.html`. Keep the query contract
 * (`v`, `autoplay`, `rel`, `playsinline`) the same in all three places.
 *
 * YouTube error 153 ("Video player configuration error") means the embed
 * request had no HTTP Referer YouTube accepts. See
 * https://developers.google.com/youtube/iframe_api_revision_history (9 Jul 2025)
 * and https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity
 *
 * On https://hivesuite.app the browser sends Referer on its own, so the
 * player URL stays the direct youtube-nocookie embed. Capacitor does not:
 * iOS is `capacitor://localhost` (not an HTTP referrer, so WebKit sends
 * none) and Android's WebView leaves Referer empty unless the player
 * document itself is an https page. Both shells load
 * `https://hivesuite.app/yt-embed.html`, whose nested iframe is a normal
 * https document and therefore sends `Referer: https://hivesuite.app/`.
 */

export const YOUTUBE_HOSTED_EMBED_PAGE = 'https://hivesuite.app/yt-embed.html'

/** YouTube's recommended policy. Explicit so a page-level no-referrer cannot strip it. */
export const YOUTUBE_IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin' as const

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

export interface YoutubePlayerParams {
  autoplay?: boolean
  /** Pass `1` to show related videos. Every current embed uses `0`. */
  rel?: 0 | 1
  /** Defaults to true (`playsinline=1`), required for inline playback on iOS. */
  playsinline?: boolean
}

export interface YoutubeEmbedEnv {
  /** `window.location.protocol`, including the colon (`"https:"`, `"capacitor:"`). */
  protocol: string
  /**
   * `Capacitor.isNativePlatform()`. True for the iOS and Android shells,
   * false on the website and in local dev.
   */
  nativePlatform: boolean
}

export function currentYoutubeEmbedEnv(): YoutubeEmbedEnv {
  if (typeof window === 'undefined') {
    return { protocol: 'https:', nativePlatform: false }
  }
  const cap = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean }
  }).Capacitor
  let nativePlatform = false
  try {
    nativePlatform = cap?.isNativePlatform?.() === true
  } catch {
    nativePlatform = false
  }
  return { protocol: window.location.protocol || '', nativePlatform }
}

/** Direct youtube.com/youtube-nocookie iframes from this origin get Error 153. */
export function youtubeEmbedNeedsHostedPage(env: YoutubeEmbedEnv): boolean {
  if (env.nativePlatform) return true
  const protocol = (env.protocol || '').replace(/:$/, '').toLowerCase()
  // Non-HTTP schemes never produce an HTTP Referer. `file` covers a
  // WebView opened from a bundled document without a base URL.
  return protocol === 'capacitor' || protocol === 'ionic' || protocol === 'file'
}

function playerQuery(params: YoutubePlayerParams): URLSearchParams {
  const q = new URLSearchParams()
  if (params.autoplay) q.set('autoplay', '1')
  q.set('rel', params.rel === 1 ? '1' : '0')
  if (params.playsinline !== false) q.set('playsinline', '1')
  return q
}

function normalizeYoutubeId(videoId: string): string | null {
  // Body parsers sometimes keep `?rel=0` glued to an embed id. Only the
  // id itself may reach the URL.
  const bare = videoId.trim().split(/[?#/&]/)[0]
  return YOUTUBE_ID_RE.test(bare) ? bare : null
}

/** Iframe `src`. Website: direct youtube-nocookie URL. Native shells: hosted wrapper. */
export function youtubeEmbedSrc(
  videoId: string,
  params: YoutubePlayerParams = {},
  env: YoutubeEmbedEnv = currentYoutubeEmbedEnv(),
): string {
  const id = normalizeYoutubeId(videoId)
  if (!id) return 'about:blank'
  const player = playerQuery(params)
  if (!youtubeEmbedNeedsHostedPage(env)) {
    return `https://www.youtube-nocookie.com/embed/${id}?${player.toString()}`
  }
  const hosted = new URLSearchParams()
  hosted.set('v', id)
  player.forEach((value, key) => hosted.set(key, value))
  return `${YOUTUBE_HOSTED_EMBED_PAGE}?${hosted.toString()}`
}
