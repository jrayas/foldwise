// Sizes for the Asset Manager cards. Pure. The same numbers feed the CSS variables and the virtual list.
import type { FrameSize, ViewMode } from './types';

export interface FrameDimensions {
  width: number;
  height: number;
}

/** The standard photo frames from the specification. */
export const FRAMES: Record<FrameSize, FrameDimensions> = {
  small: { width: 160, height: 107 },
  medium: { width: 240, height: 160 },
  large: { width: 360, height: 240 },
};

export interface CardMetrics {
  frame: FrameDimensions;
  cardHeight: number;
  /** Narrowest a card may get before another column no longer fits. */
  minCardWidth: number;
  gap: number;
}

/** Height of the breadcrumb strip across the top of a grid card. */
const STRIP_HEIGHT = 30;
const PADDING = 12;
const GAP = 12;
const DETAILS_WIDTH = 150;
const ACTIONS_WIDTH = 104;

/**
 * Grid cards hold a breadcrumb strip, then details, frame and actions side by side. List rows are one
 * compact line with a small frame. Both heights are fixed, which is what makes virtual scrolling exact.
 */
export function cardMetrics(mode: ViewMode, size: FrameSize): CardMetrics {
  if (mode === 'list') {
    const frame = { width: 96, height: 64 };
    return { frame, cardHeight: 84, minCardWidth: 0, gap: 6 };
  }
  const frame = FRAMES[size];
  return {
    frame,
    cardHeight: STRIP_HEIGHT + frame.height + PADDING * 2,
    minCardWidth: DETAILS_WIDTH + frame.width + ACTIONS_WIDTH + PADDING * 4,
    gap: GAP,
  };
}
