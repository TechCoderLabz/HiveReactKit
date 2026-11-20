/**
 * Blocks images hosted under embargoed country-code TLDs.
 *
 * Hive posts, snaps, comments and profiles are user content, so any of them
 * can embed an image from anywhere. HiveSuite must never request images from
 * hosts under these TLDs. Every image URL we render goes through
 * `isBlockedImageUrl`, and blocked images are swapped for a neutral
 * placeholder that is an inline data URI (so nothing is fetched).
 *
 * The check is on parsed host names, not a substring match, and it also looks
 * inside proxied URLs such as
 * `https://images.hive.blog/0x0/https://s6.uplod.ir/i/x.jpg` or
 * `https://proxy.example/?url=https%3A%2F%2Fs6.uplod.ir%2Fx.jpg`.
 *
 * Note: no regex lookbehind in this file. iOS 15 WebViews cannot parse it,
 * and a syntax error here would break the whole bundle.
 */

/** Country-code TLDs (ASCII and punycode IDN forms) whose hosts we never load images from. */
export const BLOCKED_IMAGE_TLDS: readonly string[] = [
  'ir', // Iran
  'xn--mgba3a4f16a', // .ایران (Iran)
  'xn--mgba3a4fra', // .ايران (Iran, Arabic yeh variant)
  'cu', // Cuba
  'kp', // North Korea
  'sy', // Syria
  'xn--ogbpf8fl', // .سورية (Syria)
  'xn--mgbtf8fl', // .سوريا (Syria)
]

const BLOCKED_TLD_SET = new Set(BLOCKED_IMAGE_TLDS)

/**
 * Neutral placeholder: a flat grey tile with a faint picture glyph and no
 * text. Quotes and parentheses are percent-encoded so the value can sit
 * inside a single- or double-quoted attribute or an unquoted CSS `url()`.
 */
const PLACEHOLDER_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'>" +
  "<rect width='320' height='180' fill='#9ca3af' fill-opacity='0.18'/>" +
  "<g fill='none' stroke='#9ca3af' stroke-width='6' stroke-linejoin='round' stroke-linecap='round' opacity='0.7'>" +
  "<rect x='130' y='62' width='60' height='48' rx='6'/>" +
  "<path d='M136 104l16-18 12 12 8-8 12 14'/>" +
  '</g>' +
  "<circle cx='174' cy='76' r='5' fill='#9ca3af' opacity='0.7'/>" +
  '</svg>'

export const BLOCKED_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(PLACEHOLDER_SVG)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')

/**
 * Cheap pre-filter. A blocked host must contain ".<tld>" (or "%2E<tld>")
 * where the TLD is not followed by another host-name character, or an IDN
 * label. Strings that fail this cannot contain a blocked host.
 */
const MAYBE_BLOCKED =
  /(?:\.|%2e)(?:ir|cu|kp|sy)(?![a-z0-9-])|xn--|[\u0080-\uffff]/i

/** Absolute URLs with a scheme. Single slashes are accepted because some proxies collapse `//`. */
const SCHEMED_HOST = /\b(?:https?|ftp|wss?):\/+([^/\s?#"'<>\\()]+)/gi

/** Protocol-relative URL at the start of the string. */
const PROTOCOL_RELATIVE_HOST = /^\/\/([^/\s?#"'<>\\()]+)/

function normalizeHost(rawHost: string): string {
  let host = rawHost.trim()
  const at = host.lastIndexOf('@')
  if (at !== -1) host = host.slice(at + 1)
  if (host.startsWith('[')) return '' // IPv6 literal, never a ccTLD
  host = host.replace(/:\d*$/, '')
  // Let the URL parser apply IDN -> punycode and lower-casing.
  try {
    host = new URL(`http://${host}/`).hostname
  } catch {
    host = host.toLowerCase()
  }
  return host.replace(/\.+$/, '')
}

/** True when a host name (any case, optional trailing dot, IDN or punycode) is under a blocked TLD. */
export function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return false
  const host = normalizeHost(hostname)
  if (!host) return false
  const tld = host.slice(host.lastIndexOf('.') + 1)
  return BLOCKED_TLD_SET.has(tld)
}

function decodedVariants(value: string): string[] {
  const out = [value]
  let current = value
  for (let i = 0; i < 3 && current.includes('%'); i++) {
    try {
      const next = decodeURIComponent(current)
      if (next === current) break
      out.push(next)
      current = next
    } catch {
      break
    }
  }
  return out
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;|&#47;|&sol;/gi, '/')
    .replace(/&#x3a;|&#58;|&colon;/gi, ':')
    .replace(/&period;|&#46;|&#x2e;/gi, '.')
}

/** Every host name referenced by a URL, including URLs nested inside proxy URLs. */
export function collectUrlHosts(url: string): string[] {
  const hosts: string[] = []
  const trimmed = url.trim()
  if (!trimmed) return hosts
  for (const variant of decodedVariants(decodeHtmlEntities(trimmed))) {
    const rel = PROTOCOL_RELATIVE_HOST.exec(variant)
    if (rel) hosts.push(rel[1])
    SCHEMED_HOST.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SCHEMED_HOST.exec(variant)) !== null) hosts.push(m[1])
  }
  return hosts
}

/**
 * True when the URL itself, or any URL nested inside it (proxy paths,
 * encoded query parameters), points at a blocked host.
 */
export function isBlockedImageUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false
  const trimmed = url.trim()
  if (/^(?:data|blob):/i.test(trimmed)) return false
  if (!MAYBE_BLOCKED.test(trimmed)) return false
  return collectUrlHosts(trimmed).some(isBlockedHostname)
}

/** Returns the placeholder for a blocked URL, otherwise the URL unchanged. */
export function filterBlockedImageUrl<T>(url: T, placeholder: string = BLOCKED_IMAGE_PLACEHOLDER): T | string {
  return isBlockedImageUrl(url) ? placeholder : url
}

/** Drops blocked candidates from a `srcset` value; returns the placeholder if none remain. */
export function filterBlockedSrcset(srcset: string, placeholder: string = BLOCKED_IMAGE_PLACEHOLDER): string {
  if (!srcset || !MAYBE_BLOCKED.test(srcset)) return srcset
  const parts = srcset.split(',').map((p) => p.trim()).filter(Boolean)
  const kept = parts.filter((p) => !isBlockedImageUrl(p.split(/\s+/)[0]))
  if (kept.length === parts.length) return srcset
  return kept.length > 0 ? kept.join(', ') : placeholder
}

/** Replaces blocked `url(...)` references inside a CSS value. */
export function filterBlockedCssUrls(css: string, placeholder: string = BLOCKED_IMAGE_PLACEHOLDER): string {
  if (!css || !MAYBE_BLOCKED.test(css)) return css
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _q: string, inner: string) =>
    isBlockedImageUrl(inner) ? `url(${placeholder})` : match,
  )
}

const URL_ATTR = /(\s(?:src|data-src|poster|background|xlink:href|href)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi
const SRCSET_ATTR = /(\s(?:srcset|data-srcset)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi
const STYLE_ATTR = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi
const IMAGE_TAG = /<(?:img|source|video|image|picture|div|span|figure|a|td|table|section)\b[^>]*>/gi

/**
 * Rewrites rendered post HTML so no image-bearing attribute points at a
 * blocked host. `href` is only rewritten on SVG `<image>` tags; ordinary
 * links stay intact (clicking a link is the user's choice, not an image load).
 */
export function stripBlockedImagesFromHtml(html: string, placeholder: string = BLOCKED_IMAGE_PLACEHOLDER): string {
  if (!html || !MAYBE_BLOCKED.test(html)) return html
  return html.replace(IMAGE_TAG, (tag) => {
    if (!MAYBE_BLOCKED.test(tag)) return tag
    const isSvgImage = /^<image\b/i.test(tag)
    let out = tag.replace(URL_ATTR, (match, prefix: string, dq?: string, sq?: string) => {
      const name = prefix.trim().replace(/\s*=$/, '').toLowerCase()
      if ((name === 'href' || name === 'xlink:href') && !isSvgImage) return match
      const value = dq ?? sq ?? ''
      return isBlockedImageUrl(value) ? `${prefix}"${placeholder}"` : match
    })
    out = out.replace(SRCSET_ATTR, (match, prefix: string, dq?: string, sq?: string) => {
      const value = dq ?? sq ?? ''
      const next = filterBlockedSrcset(decodeHtmlEntities(value), placeholder)
      return next === decodeHtmlEntities(value) ? match : `${prefix}"${next.replace(/"/g, '&quot;')}"`
    })
    out = out.replace(STYLE_ATTR, (match, prefix: string, dq?: string, sq?: string) => {
      const value = dq ?? sq ?? ''
      const next = filterBlockedCssUrls(value.replace(/&quot;/g, '"'), placeholder)
      return next === value.replace(/&quot;/g, '"') ? match : `${prefix}"${next.replace(/"/g, '&quot;')}"`
    })
    return out
  })
}
