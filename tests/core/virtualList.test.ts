import { describe, expect, it } from 'vitest';
import { columnsFor, rowCount, totalHeight, visibleWindow, type ListGeometry } from '../../src/core/virtualList';
import { Limiter } from '../../src/core/limiter';

const geometry = (patch: Partial<ListGeometry> = {}): ListGeometry => ({
  count: 1000,
  columns: 1,
  cardHeight: 100,
  gap: 10,
  ...patch,
});

describe('columnsFor', () => {
  it('fits as many columns as there is room for, counting gaps', () => {
    expect(columnsFor(1200, 500, 12)).toBe(2);
    expect(columnsFor(1012, 500, 12)).toBe(2);
    expect(columnsFor(1011, 500, 12)).toBe(1);
  });

  it('is at least one, even for tiny or unknown widths', () => {
    expect(columnsFor(100, 500, 12)).toBe(1);
    expect(columnsFor(0, 500, 12)).toBe(1);
    expect(columnsFor(500, 0, 12)).toBe(1);
  });
});

describe('totalHeight and rowCount', () => {
  it('counts rows and gaps between rows only', () => {
    expect(rowCount(10, 3)).toBe(4);
    expect(totalHeight(geometry({ count: 3 }))).toBe(3 * 100 + 2 * 10);
    expect(totalHeight(geometry({ count: 0 }))).toBe(0);
    expect(totalHeight(geometry({ count: 7, columns: 3 }))).toBe(3 * 100 + 2 * 10);
  });
});

describe('visibleWindow', () => {
  it('is empty with no items', () => {
    expect(visibleWindow(geometry({ count: 0 }), 0, 500)).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });

  it('draws from the top, with a buffer below', () => {
    const win = visibleWindow(geometry(), 0, 330, 2);
    expect(win.start).toBe(0);
    expect(win.offsetTop).toBe(0);
    // rows 0..3 are visible (stride 110, 330/110 = 3), plus 2 buffer rows
    expect(win.end).toBe(6);
  });

  it('starts at the right row mid-list and offsets it', () => {
    const win = visibleWindow(geometry(), 5500, 330, 0);
    expect(win.start).toBe(50);
    expect(win.offsetTop).toBe(50 * 110);
  });

  it('works in whole rows with several columns', () => {
    const win = visibleWindow(geometry({ columns: 3 }), 1100, 220, 1);
    expect(win.start % 3).toBe(0);
    expect(win.start).toBe(9 * 3);
    expect(win.end).toBe(Math.min(1000, (13 + 1) * 3));
  });

  it('stops at the end of the list', () => {
    const g = geometry({ count: 25, columns: 3 });
    const win = visibleWindow(g, totalHeight(g) - 300, 300, 2);
    expect(win.end).toBe(25);
  });

  it('copes with scrolling past the end or above the top', () => {
    const g = geometry({ count: 10 });
    expect(visibleWindow(g, 1_000_000, 300).end).toBe(10);
    expect(visibleWindow(g, -50, 300).start).toBe(0);
  });

  it('draws only a small, constant number of cards however long the list is', () => {
    const win = visibleWindow(geometry({ count: 10_000 }), 400_000, 800, 2);
    expect(win.end - win.start).toBeLessThan(20);
    expect(win.totalHeight).toBe(10_000 * 100 + 9_999 * 10);
  });

  it('always covers every visible card', () => {
    const g = geometry({ count: 500, columns: 2, cardHeight: 97, gap: 7 });
    for (let top = 0; top < totalHeight(g); top += 53) {
      const win = visibleWindow(g, top, 600, 1);
      const firstVisible = Math.floor(top / 104) * 2;
      const lastVisible = Math.min(499, (Math.floor((top + 600) / 104) + 1) * 2 - 1);
      expect(win.start).toBeLessThanOrEqual(firstVisible);
      expect(win.end - 1).toBeGreaterThanOrEqual(Math.min(lastVisible, win.end - 1));
    }
  });
});

describe('Limiter', () => {
  it('runs only `limit` at once and starts the next when one finishes', async () => {
    const limiter = new Limiter(2);
    const a = limiter.acquire();
    const b = limiter.acquire();
    const c = limiter.acquire();
    expect(limiter.active).toBe(2);
    expect(limiter.queued).toBe(1);
    const releaseA = await a.slot;
    await b.slot;
    releaseA();
    await c.slot;
    expect(limiter.active).toBe(2);
    expect(limiter.queued).toBe(0);
  });

  it('lets a waiting request be cancelled', async () => {
    const limiter = new Limiter(1);
    const first = limiter.acquire();
    const second = limiter.acquire();
    expect(second.cancel()).toBe(true);
    const release = await first.slot;
    expect(first.cancel()).toBe(false); // it already has its slot
    release();
    expect(limiter.queued).toBe(0);
    expect(limiter.active).toBe(0);
  });

  it('ignores a second release', async () => {
    const limiter = new Limiter(1);
    const first = limiter.acquire();
    const release = await first.slot;
    release();
    release();
    expect(limiter.active).toBe(0);
  });

  it('starts waiting work when the limit is raised', async () => {
    const limiter = new Limiter(1);
    limiter.acquire();
    const second = limiter.acquire();
    limiter.setLimit(2);
    await second.slot;
    expect(limiter.active).toBe(2);
  });
});
