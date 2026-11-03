/**
 * Video aspect-ratio helpers shared by every 3Speak upload path.
 *
 * `normalizeVideoAspectRatio` turns real pixel dimensions (read from the
 * picked file's <video> `videoWidth`/`videoHeight`) into the `"w/h"` string
 * stored in `json_metadata.video.aspectRatio`. Common shapes snap to a
 * bucket (16/9, 9/16, 1/1, 4/3, 3/4, 4/5, 21/9); anything else is the
 * reduced w/h. Unknown dimensions fall back to `"16/9"`.
 *
 * Upload components call `rememberVideoAspectRatio(embedUrl, ratio)` once an
 * upload finishes so any metadata builder that only sees the post body (the
 * 3Speak embed URL) can look the ratio up with `getVideoAspectRatioForUrl`.
 */
export const DEFAULT_VIDEO_ASPECT_RATIO = '16/9';

const BUCKETS: Array<[number, number]> = [
  [16, 9], [9, 16], [1, 1], [4, 3], [3, 4], [4, 5], [5, 4], [21, 9],
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function normalizeVideoAspectRatio(width?: number | null, height?: number | null): string {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w <= 0 || h <= 0) return DEFAULT_VIDEO_ASPECT_RATIO;
  const r = w / h;
  for (const [bw, bh] of BUCKETS) {
    if (Math.abs(r - bw / bh) / (bw / bh) < 0.03) return `${bw}/${bh}`;
  }
  const g = gcd(w, h);
  return `${w / g}/${h / g}`;
}

/** Parses `"9/16"`, `"9:16"`, `"9 / 16"` or `"0.5625"` into a number, else null. */
export function parseVideoAspectRatio(value?: string | number | null): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const n = Number(m[1]) / Number(m[2]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const uploadedRatios = new Map<string, string>();

/** `author/permlink` key from a 3Speak embed/watch URL, else the trimmed URL. */
function keyFor(url: string): string {
  const m = url.match(/[?&]v=([^&\s]+)/);
  return (m ? decodeURIComponent(m[1]) : url).trim().toLowerCase();
}

export function rememberVideoAspectRatio(embedUrl: string | null | undefined, ratio: string | null | undefined): void {
  if (!embedUrl || !ratio) return;
  uploadedRatios.set(keyFor(embedUrl), ratio);
}

export function getVideoAspectRatioForUrl(embedUrl: string | null | undefined): string | undefined {
  if (!embedUrl) return undefined;
  return uploadedRatios.get(keyFor(embedUrl));
}
