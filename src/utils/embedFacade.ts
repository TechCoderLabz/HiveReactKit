/**
 * Pure helpers for the click-to-load embed facades in the feed strip
 * (`components/feed/ClickToLoadEmbed.tsx`, used by `AttachmentStrip`).
 *
 * A feed card shows a lightweight thumbnail/card for YouTube, 3Speak,
 * Odysee, Spotify, X/Twitter and 3Speak audio. The cross-origin iframe is
 * only created when the viewer taps it, and is dropped again once the card
 * scrolls far out of view, so a long Snaps session never holds dozens of
 * live players.
 */

/** How far outside the viewport an active player may be before it is
 *  unmounted back to its facade. Generous so a small scroll never kills a
 *  playing video. */
export const EMBED_UNMOUNT_ROOT_MARGIN = '1500px 0px';

/** Proxied YouTube thumbnail (images.hive.blog), so viewers' IPs are not
 *  sent to img.youtube.com. Returns null for a malformed id. */
export function youtubeThumbnailUrl(videoId: string, width = 640): string | null {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return `https://images.hive.blog/${width}x0/https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/** Odysee embed URL with autoplay, for use after the viewer tapped play. */
export function withOdyseeAutoplay(embedUrl: string): string {
  try {
    const u = new URL(embedUrl);
    if (!u.searchParams.has('autoplay')) u.searchParams.set('autoplay', 'true');
    return u.toString();
  } catch {
    return embedUrl;
  }
}

/** Human title for an Odysee/LBRY URL: last path segment, claim id and
 *  dashes stripped ("@chan:1/my-video:a" -> "my video"). */
export function odyseeTitleFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const last = parts.filter((p) => !p.startsWith('@') && p !== '$' && p !== 'embed').pop();
    if (!last) return null;
    const name = decodeURIComponent(last).split(':')[0].replace(/[-_]+/g, ' ').trim();
    return name || null;
  } catch {
    return null;
  }
}

/** "track" | "album" | "playlist" | … for a Spotify URL, or null. */
export function spotifyKindFromUrl(url: string): string | null {
  const m = url.match(/spotify\.com\/(?:embed\/)?(track|playlist|album|artist|episode|show)\//i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Next "active" state for a mounted player given an IntersectionObserver
 * entry (observer uses EMBED_UNMOUNT_ROOT_MARGIN). A player only ever goes
 * back to its facade when it has left the enlarged viewport; it is never
 * re-activated automatically (that needs a tap).
 */
export function nextEmbedActiveState(active: boolean, isIntersecting: boolean): boolean {
  return active && isIntersecting;
}
