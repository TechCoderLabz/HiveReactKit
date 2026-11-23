/**
 * HiveSuite image watermark: placement maths and mode rules.
 *
 * Pure functions only (no DOM), so they can be unit-tested and shared by
 * imageProcessor (drawing) and the composer UI (toggle visibility).
 */

/**
 * Who gets the watermark, decided by the host app:
 * - `forced`: always applied, no toggle (free plan).
 * - `default-on`: applied by default, user can switch it off per image in the
 *   crop/blur popup (paid plans).
 * - `off`: never applied (default, keeps the old behaviour).
 */
export type ImageWatermarkMode = 'forced' | 'default-on' | 'off';

export interface WatermarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Images whose shorter edge is below this get no watermark. */
export const WATERMARK_MIN_IMAGE_EDGE = 200;
/** Watermark width as a share of the image width (before clamping). */
export const WATERMARK_WIDTH_RATIO = 0.14;
export const WATERMARK_MIN_WIDTH = 64;
export const WATERMARK_MAX_WIDTH = 280;
/** Never cover more than this share of the image width (small images). */
export const WATERMARK_MAX_WIDTH_SHARE = 0.4;
/** Margin from the bottom-right corner as a share of the shorter edge. */
export const WATERMARK_MARGIN_RATIO = 0.02;
export const WATERMARK_OPACITY = 0.4;

/**
 * Where to draw the watermark on an output image of `imageWidth` x
 * `imageHeight` pixels, for artwork with the given width/height `aspect`.
 * Returns null when the image is too small to carry a mark.
 */
export function computeWatermarkRect(
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): WatermarkRect | null {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || !(aspect > 0)) return null;
  const shorter = Math.min(imageWidth, imageHeight);
  if (shorter < WATERMARK_MIN_IMAGE_EDGE) return null;

  const ideal = imageWidth * WATERMARK_WIDTH_RATIO;
  const clamped = Math.min(WATERMARK_MAX_WIDTH, Math.max(WATERMARK_MIN_WIDTH, ideal));
  const width = Math.round(Math.min(clamped, imageWidth * WATERMARK_MAX_WIDTH_SHARE));
  const height = Math.max(1, Math.round(width / aspect));
  const margin = Math.max(4, Math.round(shorter * WATERMARK_MARGIN_RATIO));

  return {
    x: Math.round(imageWidth - margin - width),
    y: Math.round(imageHeight - margin - height),
    width,
    height,
  };
}

/** Normalise any incoming value to a known mode (unknown → `off`). */
export function normaliseWatermarkMode(mode: unknown): ImageWatermarkMode {
  return mode === 'forced' || mode === 'default-on' ? mode : 'off';
}

/** Initial per-image watermark state for a mode. */
export function watermarkDefaultFor(mode: ImageWatermarkMode): boolean {
  return mode !== 'off';
}

/** Whether the image gets the mark, given the mode and the user's per-image choice. */
export function effectiveWatermark(mode: ImageWatermarkMode, userChoice?: boolean): boolean {
  if (mode === 'forced') return true;
  if (mode === 'off') return false;
  return userChoice ?? true;
}

/** The crop/blur popup shows the on/off switch only in `default-on` mode. */
export function watermarkToggleVisible(mode: ImageWatermarkMode): boolean {
  return mode === 'default-on';
}

/** The crop/blur popup shows the "free plan" note (no switch) only in `forced` mode. */
export function watermarkNoteVisible(mode: ImageWatermarkMode): boolean {
  return mode === 'forced';
}
