// Sizes for cached previews. Pure.
import type { FrameDimensions } from './cardMetrics';

/** Previews are drawn at twice the frame, so they stay sharp on high-density screens. */
export const PREVIEW_SCALE = 2;

export interface PixelSize {
  width: number;
  height: number;
}

/** Image types a preview can be made from. GIF (may be animated) and SVG (already small, scalable) are shown directly. */
const PREVIEWABLE = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'avif']);

export function canPreview(ext: string): boolean {
  return PREVIEWABLE.has(ext.toLowerCase());
}

/**
 * Whether a file should get a cached preview: previews are on, it is a picture type we can shrink, and it
 * is big enough for a preview to be worth having.
 */
export function wantsPreview(file: { ext: string; size: number }, settings: { enabled: boolean; directBelowKb: number }): boolean {
  return settings.enabled && canPreview(file.ext) && file.size >= settings.directBelowKb * 1024;
}

/**
 * The size to draw a preview at: the biggest that fits inside twice the frame, keeping the shape, and never
 * larger than the original (a small image is never enlarged). Whole pixels, at least 1 × 1.
 */
export function previewSize(natural: PixelSize, frame: FrameDimensions, scale = PREVIEW_SCALE): PixelSize {
  const width = Math.max(1, natural.width);
  const height = Math.max(1, natural.height);
  const ratio = Math.min(1, (frame.width * scale) / width, (frame.height * scale) / height);
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
