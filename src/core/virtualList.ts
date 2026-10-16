// Virtual scrolling arithmetic: which rows are on screen. Works because every card has the same height.
// Pure: the view gives it numbers and draws what it returns.

export interface ListGeometry {
  count: number;
  /** Cards per row (1 in List view). */
  columns: number;
  /** Height of one card, in pixels. */
  cardHeight: number;
  /** Space between rows and between columns, in pixels. */
  gap: number;
}

export interface VisibleWindow {
  /** Index of the first card to draw, always the start of a row. */
  start: number;
  /** One past the last card to draw. */
  end: number;
  /** Distance from the top of the scroll area to the first drawn row. */
  offsetTop: number;
  /** Height of the whole list, so the scrollbar is the right size. */
  totalHeight: number;
}

/** How many columns fit in `width`, given a minimum card width. At least one. */
export function columnsFor(width: number, minCardWidth: number, gap: number): number {
  if (width <= 0 || minCardWidth <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
}

export function rowCount(count: number, columns: number): number {
  return count <= 0 ? 0 : Math.ceil(count / Math.max(1, columns));
}

export function totalHeight(geometry: ListGeometry): number {
  const rows = rowCount(geometry.count, geometry.columns);
  return rows === 0 ? 0 : rows * geometry.cardHeight + (rows - 1) * geometry.gap;
}

/**
 * The cards to draw for a scroll position. `bufferRows` extra rows above and below stop blank gaps showing
 * during fast scrolling.
 */
export function visibleWindow(geometry: ListGeometry, scrollTop: number, viewportHeight: number, bufferRows = 2): VisibleWindow {
  const columns = Math.max(1, geometry.columns);
  const rows = rowCount(geometry.count, columns);
  const total = totalHeight(geometry);
  if (rows === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };

  const rowStride = geometry.cardHeight + geometry.gap;
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, total - viewportHeight)));
  const firstVisible = Math.floor(top / rowStride);
  const lastVisible = Math.floor((top + Math.max(0, viewportHeight)) / rowStride);
  const firstRow = Math.max(0, firstVisible - bufferRows);
  const lastRow = Math.min(rows - 1, lastVisible + bufferRows);

  return {
    start: firstRow * columns,
    end: Math.min(geometry.count, (lastRow + 1) * columns),
    offsetTop: firstRow * rowStride,
    totalHeight: total,
  };
}
