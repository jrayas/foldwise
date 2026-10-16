// Bookkeeping for the thumbnail cache: which previews exist, how big they are and which to drop first.
// Pure: it never touches files. The Obsidian side does the reading and writing and follows what this says.
//
// A preview's key is made from the file's path, the frame width it was made for, and the original's size and
// modified time. If the original changes the key changes, so a stale preview is never shown.

export interface ThumbEntry {
  /** Cache key, also the base of the preview's file name. */
  key: string;
  /** Vault path of the original. */
  path: string;
  /** Frame width the preview was made for. */
  frame: number;
  /** The original's size in bytes and modified time when the preview was made. */
  size: number;
  mtime: number;
  /** The original's real pixel dimensions, so a card can show them without loading the original. */
  width: number;
  height: number;
  /** The preview file's size in bytes. */
  bytes: number;
  /** File extension of the preview ("webp" or "jpg"). */
  ext: string;
  /** Last time it was shown, in milliseconds. The oldest are removed first. */
  lastUsed: number;
}

export interface ThumbIdentity {
  path: string;
  frame: number;
  size: number;
  mtime: number;
}

/** A short, stable text hash (two 32-bit FNV-1a runs), used only to name files. Collisions are checked by path. */
export function hashText(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
    b = ((b << 13) | (b >>> 19)) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function thumbKey(identity: ThumbIdentity): string {
  return hashText(`${identity.path}\n${identity.frame}\n${identity.size}\n${identity.mtime}`);
}

export const fileNameOf = (entry: Pick<ThumbEntry, 'key' | 'ext'>): string => `${entry.key}.${entry.ext}`;

export interface RekeyMove {
  /** File name before and after, so the files can be renamed on disk. */
  from: string;
  to: string;
}

export class ThumbCache {
  private readonly entries = new Map<string, ThumbEntry>();

  get count(): number {
    return this.entries.size;
  }

  get totalBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.bytes;
    return total;
  }

  /** The preview for exactly this file at this time, or undefined. Checks the path too, in case of a hash clash. */
  lookup(identity: ThumbIdentity): ThumbEntry | undefined {
    const entry = this.entries.get(thumbKey(identity));
    return entry && entry.path === identity.path ? entry : undefined;
  }

  /** Mark a preview as just used, so it is the last to be removed. */
  touch(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (entry) entry.lastUsed = now;
  }

  /** Add a preview. Older previews of the same file at the same frame (a changed original) are returned for deletion. */
  put(entry: ThumbEntry): ThumbEntry[] {
    const stale = [...this.entries.values()].filter(
      (other) => other.path === entry.path && other.frame === entry.frame && other.key !== entry.key,
    );
    for (const old of stale) this.entries.delete(old.key);
    this.entries.set(entry.key, entry);
    return stale;
  }

  remove(key: string): ThumbEntry | undefined {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    return entry;
  }

  /** Remove every preview of one file (the file was deleted or changed in a way that voids them). */
  removePath(path: string): ThumbEntry[] {
    return this.removeWhere((entry) => entry.path === path);
  }

  /** Remove every preview of every file under a folder. */
  removeFolder(folder: string): ThumbEntry[] {
    const prefix = `${folder}/`;
    return this.removeWhere((entry) => entry.path.startsWith(prefix));
  }

  private removeWhere(test: (entry: ThumbEntry) => boolean): ThumbEntry[] {
    const removed = [...this.entries.values()].filter(test);
    for (const entry of removed) this.entries.delete(entry.key);
    return removed;
  }

  /**
   * A file was renamed or moved: give its previews their new key, so nothing has to be regenerated.
   * Returns the file renames to carry out on disk.
   */
  rekeyPath(oldPath: string, newPath: string): RekeyMove[] {
    return this.rekey((entry) => (entry.path === oldPath ? newPath : null));
  }

  /** A folder was renamed or moved: re-key everything under it. */
  rekeyFolder(oldFolder: string, newFolder: string): RekeyMove[] {
    const prefix = `${oldFolder}/`;
    return this.rekey((entry) => (entry.path.startsWith(prefix) ? `${newFolder}/${entry.path.slice(prefix.length)}` : null));
  }

  private rekey(newPathFor: (entry: ThumbEntry) => string | null): RekeyMove[] {
    const moves: RekeyMove[] = [];
    for (const entry of [...this.entries.values()]) {
      const path = newPathFor(entry);
      if (path === null) continue;
      this.entries.delete(entry.key);
      const next: ThumbEntry = { ...entry, path, key: thumbKey({ path, frame: entry.frame, size: entry.size, mtime: entry.mtime }) };
      this.entries.set(next.key, next);
      moves.push({ from: fileNameOf(entry), to: fileNameOf(next) });
    }
    return moves;
  }

  /** Drop the least recently used previews until the total is within the limit. Returns what was removed. */
  trim(limitBytes: number): ThumbEntry[] {
    let total = this.totalBytes;
    if (total <= limitBytes) return [];
    const oldestFirst = [...this.entries.values()].sort((a, b) => a.lastUsed - b.lastUsed || a.key.localeCompare(b.key));
    const removed: ThumbEntry[] = [];
    for (const entry of oldestFirst) {
      if (total <= limitBytes) break;
      this.entries.delete(entry.key);
      total -= entry.bytes;
      removed.push(entry);
    }
    return removed;
  }

  clear(): ThumbEntry[] {
    const all = [...this.entries.values()];
    this.entries.clear();
    return all;
  }

  toJSON(): { version: 1; entries: ThumbEntry[] } {
    return { version: 1, entries: [...this.entries.values()] };
  }

  /** Read a saved index leniently: anything that is not a well-formed entry is skipped, never fatal. */
  static fromJSON(raw: unknown): ThumbCache {
    const cache = new ThumbCache();
    const list = typeof raw === 'object' && raw !== null ? (raw as { entries?: unknown }).entries : undefined;
    if (!Array.isArray(list)) return cache;
    for (const item of list as unknown[]) {
      const entry = parseEntry(item);
      if (entry) cache.entries.set(entry.key, entry);
    }
    return cache;
  }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parseEntry(item: unknown): ThumbEntry | null {
  if (typeof item !== 'object' || item === null) return null;
  const e = item as Record<string, unknown>;
  if (typeof e.key !== 'string' || !/^[0-9a-f]{16}$/.test(e.key)) return null;
  if (typeof e.path !== 'string' || e.path === '') return null;
  if (e.ext !== 'webp' && e.ext !== 'jpg') return null;
  if (![e.frame, e.size, e.mtime, e.width, e.height, e.bytes, e.lastUsed].every(isNumber)) return null;
  const entry = e as unknown as ThumbEntry;
  if (entry.bytes < 0) return null;
  // The key must match what it names, or the entry is untrustworthy.
  if (thumbKey(entry) !== entry.key) return null;
  return {
    key: entry.key, path: entry.path, frame: entry.frame, size: entry.size, mtime: entry.mtime,
    width: entry.width, height: entry.height, bytes: entry.bytes, ext: entry.ext, lastUsed: entry.lastUsed,
  };
}
