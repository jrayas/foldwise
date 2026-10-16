import { Platform, TFile, TFolder, debounce, normalizePath, type App, type Plugin, type TAbstractFile } from 'obsidian';
import type { AssetRecord } from '../core/assetIndex';
import type { FrameDimensions } from '../core/cardMetrics';
import { Limiter } from '../core/limiter';
import { ThumbCache, fileNameOf, thumbKey, type ThumbEntry } from '../core/thumbCache';
import { previewSize, wantsPreview } from '../core/thumbSize';
import type { ThumbnailSettings } from '../core/types';

/** What a card shows: a cached preview, or the original when no preview is wanted or possible. */
export interface ThumbSource {
  url: string;
  /** True for a cached preview, false for the original file. */
  thumb: boolean;
  /** Cache key of the preview, so a broken one can be discarded. */
  key?: string;
  /** The original's real pixel dimensions, when known without loading the original. */
  width?: number;
  height?: number;
}

export interface ThumbRequest {
  result: Promise<ThumbSource>;
  /** The card went away. Work that has not started is dropped. */
  cancel: () => void;
}

/** The part of the service that cards use. */
export interface ThumbnailProvider {
  request(record: AssetRecord, frame: FrameDimensions): ThumbRequest;
  discard(key: string): void;
}

export interface ThumbStats {
  count: number;
  bytes: number;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

/** Only files this plugin wrote have names like this, so it never deletes anything else in its folder. */
const CACHE_FILE = /^[0-9a-f]{16}\.(webp|jpg|tmp)$/;
const INDEX_FILE = 'index.json';

class Cancelled extends Error {}

interface Job {
  promise: Promise<ThumbEntry>;
  refs: number;
  /** Stops the job if it is still waiting for its turn. */
  dropIfWaiting: () => void;
}

/**
 * Makes, finds and tidies cached previews. They live in the plugin's own `cache` folder, never in the vault,
 * and can be deleted at any time. Originals are only ever read.
 */
export class ThumbnailService implements ThumbnailProvider {
  private cache = new ThumbCache();
  private readonly jobs = new Map<string, Job>();
  private readonly moving = new Map<string, Promise<void>>();
  private readonly limiter = new Limiter(Platform.isMobile ? 2 : 4);
  private readonly dir: string;
  private readonly indexPath: string;
  private markReady: () => void = () => undefined;
  private readonly ready = new Promise<void>((resolve) => {
    this.markReady = resolve;
  });
  private readonly saveSoon = debounce(() => void this.save(), 2000, true);

  constructor(
    private readonly app: App,
    plugin: Plugin,
    private readonly settings: () => ThumbnailSettings,
  ) {
    const pluginDir = plugin.manifest.dir ?? `${app.vault.configDir}/plugins/${plugin.manifest.id}`;
    this.dir = normalizePath(`${pluginDir}/cache`);
    this.indexPath = `${this.dir}/${INDEX_FILE}`;
  }

  /** Read the saved index and start following the vault. Call from `onLayoutReady`. */
  async start(plugin: Plugin): Promise<void> {
    const { vault } = this.app;
    plugin.registerEvent(vault.on('rename', (item, oldPath) => this.renamed(item, oldPath)));
    plugin.registerEvent(vault.on('delete', (item) => this.deleted(item)));
    try {
      await this.load();
    } catch (error) {
      console.warn('Foldwise: could not read the thumbnail cache, starting it afresh.', error);
      this.cache = new ThumbCache();
    }
    this.markReady();
  }

  stats(): ThumbStats {
    return { count: this.cache.count, bytes: this.cache.totalBytes };
  }

  // ---- asking for a preview ----

  request(record: AssetRecord, frame: FrameDimensions): ThumbRequest {
    const file = this.app.vault.getFileByPath(record.path);
    if (!file) return { result: Promise.reject(new Error(`${record.path} no longer exists.`)), cancel: () => undefined };
    const original: ThumbSource = { url: this.app.vault.getResourcePath(file), thumb: false };
    if (!wantsPreview(record, this.settings())) return { result: Promise.resolve(original), cancel: () => undefined };

    const identity = { path: record.path, frame: frame.width, size: record.size, mtime: record.mtime };
    const key = thumbKey(identity);
    let cancelled = false;
    let cancelJob: () => void = () => undefined;

    const result = this.ready.then(async (): Promise<ThumbSource> => {
      if (cancelled) throw new Cancelled();
      const hit = this.cache.lookup(identity);
      if (hit) {
        await this.moving.get(fileNameOf(hit));
        this.cache.touch(hit.key, Date.now());
        this.saveSoon();
        return this.sourceFor(hit);
      }
      const job = this.job(key, record, frame);
      job.refs++;
      cancelJob = () => {
        job.refs--;
        if (job.refs === 0) job.dropIfWaiting();
      };
      if (cancelled) cancelJob();
      return this.sourceFor(await job.promise);
    });
    return {
      result,
      cancel: () => {
        cancelled = true;
        cancelJob();
      },
    };
  }

  /** A preview that failed to load: forget it, so the next request makes a new one. */
  discard(key: string): void {
    const entry = this.cache.remove(key);
    if (entry) {
      void this.removeFile(fileNameOf(entry));
      this.saveSoon();
    }
  }

  private sourceFor(entry: ThumbEntry): ThumbSource {
    return {
      url: this.app.vault.adapter.getResourcePath(`${this.dir}/${fileNameOf(entry)}`),
      thumb: true,
      key: entry.key,
      width: entry.width,
      height: entry.height,
    };
  }

  // ---- making a preview ----

  private job(key: string, record: AssetRecord, frame: FrameDimensions): Job {
    const existing = this.jobs.get(key);
    if (existing) return existing;

    const turn = this.limiter.acquire();
    const job: Job = {
      refs: 0,
      dropIfWaiting: () => {
        if (turn.cancel()) this.jobs.delete(key);
      },
      promise: turn.slot.then(async (release) => {
        try {
          return await this.generate(record, frame);
        } finally {
          release();
          this.jobs.delete(key);
        }
      }),
    };
    // A job dropped while waiting never settles, so it cannot leave an unhandled rejection behind.
    job.promise.catch(() => undefined);
    this.jobs.set(key, job);
    return job;
  }

  private async generate(record: AssetRecord, frame: FrameDimensions): Promise<ThumbEntry> {
    const { vault, vault: { adapter } } = this.app;
    const file = vault.getFileByPath(record.path);
    if (!file) throw new Error(`${record.path} no longer exists.`);

    const bytes = await vault.readBinary(file);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: MIME[record.ext] ?? 'image/png' }));
    const natural = { width: bitmap.width, height: bitmap.height };
    const size = previewSize(natural, frame);

    const canvas = createEl('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Canvas is not available.');
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();

    let ext: 'webp' | 'jpg' = 'webp';
    let blob = await toBlob(canvas, 'image/webp', 0.8);
    if (blob?.type !== 'image/webp') {
      ext = 'jpg';
      blob = await toBlob(canvas, 'image/jpeg', 0.82);
    }
    if (!blob) throw new Error('Could not encode the preview.');
    const data = await blob.arrayBuffer();

    const identity = { path: record.path, frame: frame.width, size: record.size, mtime: record.mtime };
    const entry: ThumbEntry = {
      ...identity,
      key: thumbKey(identity),
      width: natural.width,
      height: natural.height,
      bytes: data.byteLength,
      ext,
      lastUsed: Date.now(),
    };

    await this.ensureDir();
    // Write to a temporary name first, so a crash never leaves a half-written preview under a real name.
    const temporary = `${this.dir}/${entry.key}.tmp`;
    const finalPath = `${this.dir}/${fileNameOf(entry)}`;
    await adapter.writeBinary(temporary, data);
    try {
      await adapter.rename(temporary, finalPath);
    } catch (error) {
      // The rename fails if the preview already exists (an identical request finished first). Either way the
      // temporary file must not be left behind.
      await this.removeFile(`${entry.key}.tmp`);
      if (!(await adapter.exists(finalPath))) throw error;
    }

    for (const stale of this.cache.put(entry)) void this.removeFile(fileNameOf(stale));
    this.trim();
    this.saveSoon();
    return entry;
  }

  // ---- tidying ----

  /** Remove the least recently used previews until the cache is within its limit. */
  trim(): void {
    for (const entry of this.cache.trim(this.settings().limitMb * 1024 * 1024)) void this.removeFile(fileNameOf(entry));
    this.saveSoon();
  }

  /** Delete every preview. Only files inside the cache folder, named like previews, are touched. */
  async clear(): Promise<void> {
    this.cache.clear();
    await this.removeStrays(new Set());
    await this.save();
  }

  /** Save the index now (the plugin is closing). */
  async flush(): Promise<void> {
    await this.save();
  }

  private renamed(item: TAbstractFile, oldPath: string): void {
    const moves = item instanceof TFolder ? this.cache.rekeyFolder(oldPath, item.path) : item instanceof TFile ? this.cache.rekeyPath(oldPath, item.path) : [];
    for (const move of moves) {
      const done = this.moveFile(move.from, move.to).finally(() => this.moving.delete(move.to));
      this.moving.set(move.to, done);
    }
    if (moves.length > 0) this.saveSoon();
  }

  private deleted(item: TAbstractFile): void {
    const removed = item instanceof TFolder ? this.cache.removeFolder(item.path) : this.cache.removePath(item.path);
    for (const entry of removed) void this.removeFile(fileNameOf(entry));
    if (removed.length > 0) this.saveSoon();
  }

  private async moveFile(from: string, to: string): Promise<void> {
    if (!safeName(from) || !safeName(to)) return;
    try {
      await this.app.vault.adapter.rename(`${this.dir}/${from}`, `${this.dir}/${to}`);
    } catch {
      // The preview file is gone or could not move: forget it, and it is made again when next needed.
      const key = to.replace(/\.[a-z]+$/, '');
      this.cache.remove(key);
    }
  }

  private async removeFile(name: string): Promise<void> {
    if (!safeName(name)) return;
    try {
      await this.app.vault.adapter.remove(`${this.dir}/${name}`);
    } catch {
      // Already gone: nothing to do.
    }
  }

  /** Delete preview-shaped files in the cache folder that the index does not know about. */
  private async removeStrays(known: Set<string>): Promise<void> {
    const { adapter } = this.app.vault;
    if (!(await adapter.exists(this.dir))) return;
    const listing = await adapter.list(this.dir);
    for (const path of listing.files) {
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (CACHE_FILE.test(name) && !known.has(name)) await this.removeFile(name);
    }
  }

  private async ensureDir(): Promise<void> {
    const { adapter } = this.app.vault;
    if (!(await adapter.exists(this.dir))) await adapter.mkdir(this.dir);
  }

  private async load(): Promise<void> {
    const { adapter } = this.app.vault;
    if (!(await adapter.exists(this.indexPath))) {
      await this.removeStrays(new Set());
      return;
    }
    this.cache = ThumbCache.fromJSON(JSON.parse(await adapter.read(this.indexPath)));
    const known = new Set(this.cache.toJSON().entries.map(fileNameOf));
    await this.removeStrays(known);
    this.trim();
  }

  private async save(): Promise<void> {
    try {
      await this.ensureDir();
      await this.app.vault.adapter.write(this.indexPath, JSON.stringify(this.cache));
    } catch (error) {
      console.warn('Foldwise: could not save the thumbnail index.', error);
    }
  }
}

/** A cache file name has no folder parts, so it can only ever name a file inside the cache folder. */
function safeName(name: string): boolean {
  return CACHE_FILE.test(name);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
