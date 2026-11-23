/**
 * Pure helpers for the composer's per-image edits (crop + blur areas).
 *
 * The crop/blur popup works on the image as currently shown (which may
 * already be cropped), but the uploader always re-renders from the original
 * file. These helpers turn a popup result into rectangles relative to the
 * original image, so repeated crops compose correctly and the image can be
 * re-rendered at any time (e.g. when the watermark is switched on or off).
 */
import type { BlurRect, CropRect } from './imageProcessor';

export interface ImageEdit {
  /** Crop, normalised to the original image (0..1). */
  rect: CropRect;
  /** Blur areas, normalised to the original image (0..1). */
  blurRects: BlurRect[];
}

export const FULL_FRAME: CropRect = { x: 0, y: 0, width: 1, height: 1 };

function mapRect<T extends CropRect>(inner: T, outer: CropRect): T {
  return {
    ...inner,
    x: outer.x + inner.x * outer.width,
    y: outer.y + inner.y * outer.height,
    width: inner.width * outer.width,
    height: inner.height * outer.height,
  };
}

/**
 * Combine the previous edit (or none) with a new popup result whose
 * rectangles are relative to the previously cropped image.
 */
export function composeImageEdit(
  previous: ImageEdit | undefined,
  rect: CropRect,
  blurRects: BlurRect[] = [],
): ImageEdit {
  const outer = previous?.rect ?? FULL_FRAME;
  return {
    rect: mapRect(rect, outer),
    blurRects: [...(previous?.blurRects ?? []), ...blurRects.map((b) => mapRect(b, outer))],
  };
}
