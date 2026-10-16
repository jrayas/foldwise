import { describe, expect, it } from 'vitest';
import { FRAMES } from '../../src/core/cardMetrics';
import { ThumbCache, fileNameOf, hashText, thumbKey, type ThumbEntry, type ThumbIdentity } from '../../src/core/thumbCache';
import { canPreview, previewSize, wantsPreview } from '../../src/core/thumbSize';

const identity = (patch: Partial<ThumbIdentity> = {}): ThumbIdentity => ({ path: 'Maths/Assets/a.png', frame: 240, size: 500_000, mtime: 1000, ...patch });

const entry = (patch: Partial<ThumbEntry> = {}): ThumbEntry => {
  const id = identity(patch);
  return { ...id, key: thumbKey(id), width: 1920, height: 1080, bytes: 30_000, ext: 'webp', lastUsed: 1, ...patch };
};

describe('hashText and thumbKey', () => {
  it('is stable and 16 hex characters', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when anything about the original changes', () => {
    const base = thumbKey(identity());
    expect(thumbKey(identity({ path: 'Maths/Assets/b.png' }))).not.toBe(base);
    expect(thumbKey(identity({ frame: 360 }))).not.toBe(base);
    expect(thumbKey(identity({ size: 500_001 }))).not.toBe(base);
    expect(thumbKey(identity({ mtime: 1001 }))).not.toBe(base);
  });

  it('gives different keys to many different paths', () => {
    const keys = new Set(Array.from({ length: 5000 }, (_, i) => thumbKey(identity({ path: `Folder/Screenshot ${i}.png` }))));
    expect(keys.size).toBe(5000);
  });
});

describe('previewSize', () => {
  const medium = FRAMES.medium;

  it('fits inside twice the frame, keeping the shape', () => {
    expect(previewSize({ width: 1920, height: 1080 }, medium)).toEqual({ width: 480, height: 270 });
    expect(previewSize({ width: 1000, height: 2000 }, medium)).toEqual({ width: 160, height: 320 });
  });

  it('never enlarges a small image', () => {
    expect(previewSize({ width: 200, height: 100 }, medium)).toEqual({ width: 200, height: 100 });
    expect(previewSize({ width: 480, height: 320 }, medium)).toEqual({ width: 480, height: 320 });
  });

  it('scales with the frame', () => {
    expect(previewSize({ width: 4000, height: 2000 }, FRAMES.large).width).toBe(720);
    expect(previewSize({ width: 4000, height: 2000 }, FRAMES.small).width).toBe(320);
  });

  it('copes with zero or tiny sizes', () => {
    expect(previewSize({ width: 0, height: 0 }, medium)).toEqual({ width: 1, height: 1 });
    expect(previewSize({ width: 1, height: 5000 }, medium).width).toBe(1);
  });
});

describe('wantsPreview', () => {
  const on = { enabled: true, directBelowKb: 100 };

  it('previews big pictures only', () => {
    expect(wantsPreview({ ext: 'png', size: 100 * 1024 }, on)).toBe(true);
    expect(wantsPreview({ ext: 'png', size: 100 * 1024 - 1 }, on)).toBe(false);
  });

  it('shows animated and vector images directly', () => {
    expect(canPreview('gif')).toBe(false);
    expect(canPreview('svg')).toBe(false);
    expect(canPreview('PNG')).toBe(true);
  });

  it('does nothing when switched off, or for a threshold of 0 it previews everything', () => {
    expect(wantsPreview({ ext: 'png', size: 10_000_000 }, { enabled: false, directBelowKb: 100 })).toBe(false);
    expect(wantsPreview({ ext: 'png', size: 1 }, { enabled: true, directBelowKb: 0 })).toBe(true);
  });
});

describe('ThumbCache', () => {
  it('finds a preview only for the exact same original', () => {
    const cache = new ThumbCache();
    cache.put(entry());
    expect(cache.lookup(identity())).toBeDefined();
    expect(cache.lookup(identity({ mtime: 2000 }))).toBeUndefined();
    expect(cache.lookup(identity({ frame: 360 }))).toBeUndefined();
  });

  it('replaces older previews of a changed original and says which to delete', () => {
    const cache = new ThumbCache();
    const old = entry({ mtime: 1000 });
    cache.put(old);
    const stale = cache.put(entry({ mtime: 2000 }));
    expect(stale.map((s) => s.key)).toEqual([old.key]);
    expect(cache.count).toBe(1);
  });

  it('keeps previews for different frame sizes of the same file', () => {
    const cache = new ThumbCache();
    cache.put(entry({ frame: 240 }));
    expect(cache.put(entry({ frame: 360 }))).toEqual([]);
    expect(cache.count).toBe(2);
  });

  it('adds up bytes and removes the least recently used first when over the limit', () => {
    const cache = new ThumbCache();
    cache.put(entry({ path: 'a.png', bytes: 100, lastUsed: 30 }));
    cache.put(entry({ path: 'b.png', bytes: 100, lastUsed: 10 }));
    cache.put(entry({ path: 'c.png', bytes: 100, lastUsed: 20 }));
    expect(cache.totalBytes).toBe(300);
    expect(cache.trim(300)).toEqual([]);
    const removed = cache.trim(150);
    expect(removed.map((r) => r.path)).toEqual(['b.png', 'c.png']);
    expect(cache.totalBytes).toBe(100);
  });

  it('counts a preview as used when touched', () => {
    const cache = new ThumbCache();
    const a = entry({ path: 'a.png', bytes: 100, lastUsed: 1 });
    const b = entry({ path: 'b.png', bytes: 100, lastUsed: 2 });
    cache.put(a);
    cache.put(b);
    cache.touch(a.key, 99);
    expect(cache.trim(100).map((r) => r.path)).toEqual(['b.png']);
  });

  it('follows a file rename without losing the preview, and reports the file renames', () => {
    const cache = new ThumbCache();
    const original = entry({ path: 'A/old.png' });
    cache.put(original);
    const moves = cache.rekeyPath('A/old.png', 'B/new.png');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.from).toBe(fileNameOf(original));
    expect(cache.lookup(identity({ path: 'A/old.png' }))).toBeUndefined();
    const found = cache.lookup(identity({ path: 'B/new.png' }));
    expect(found).toBeDefined();
    expect(moves[0]?.to).toBe(fileNameOf(found as ThumbEntry));
  });

  it('follows a folder rename and leaves similarly named folders alone', () => {
    const cache = new ThumbCache();
    cache.put(entry({ path: 'Maths/Assets/a.png' }));
    cache.put(entry({ path: 'Maths2/Assets/b.png' }));
    expect(cache.rekeyFolder('Maths', 'Science')).toHaveLength(1);
    expect(cache.lookup(identity({ path: 'Science/Assets/a.png' }))).toBeDefined();
    expect(cache.lookup(identity({ path: 'Maths2/Assets/b.png' }))).toBeDefined();
  });

  it('removes previews of a deleted file or folder', () => {
    const cache = new ThumbCache();
    cache.put(entry({ path: 'A/x.png' }));
    cache.put(entry({ path: 'A/B/y.png' }));
    cache.put(entry({ path: 'AB/z.png' }));
    expect(cache.removePath('A/x.png')).toHaveLength(1);
    expect(cache.removeFolder('A')).toHaveLength(1);
    expect(cache.count).toBe(1);
  });

  it('clears everything and reports it', () => {
    const cache = new ThumbCache();
    cache.put(entry({ path: 'a.png' }));
    cache.put(entry({ path: 'b.png' }));
    expect(cache.clear()).toHaveLength(2);
    expect(cache.count).toBe(0);
    expect(cache.totalBytes).toBe(0);
  });

  it('round-trips through JSON', () => {
    const cache = new ThumbCache();
    cache.put(entry({ path: 'a.png' }));
    cache.put(entry({ path: 'b.png', ext: 'jpg' }));
    const copy = ThumbCache.fromJSON(JSON.parse(JSON.stringify(cache)));
    expect(copy.count).toBe(2);
    expect(copy.totalBytes).toBe(cache.totalBytes);
    expect(copy.lookup(identity({ path: 'b.png' }))?.ext).toBe('jpg');
  });

  it('loads a damaged index leniently, skipping bad entries', () => {
    const good = entry({ path: 'good.png' });
    const forged = { ...entry({ path: 'forged.png' }), key: '0000000000000000' };
    const raw = {
      entries: [good, forged, null, 'x', { ...good, bytes: 'many' }, { ...good, ext: 'exe' }, { ...entry({ path: '' }) }, { ...good, key: '../../etc' }],
    };
    const cache = ThumbCache.fromJSON(raw);
    expect(cache.count).toBe(1);
    expect(cache.lookup(identity({ path: 'good.png' }))).toBeDefined();
  });

  it('starts empty from anything that is not an index', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { entries: 'no' }]) {
      expect(ThumbCache.fromJSON(raw).count).toBe(0);
    }
  });
});
