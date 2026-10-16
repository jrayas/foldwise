import { TFile, TFolder, debounce, type App, type Plugin, type TAbstractFile } from 'obsidian';
import { AssetIndex, makeRecord, type AssetRecord } from '../core/assetIndex';
import { classifyFile } from '../core/fileKinds';

/** Hidden folders (".obsidian", ".trash", a plugin's cache) are never assets. */
const isHidden = (path: string): boolean => path.split('/').some((part) => part.startsWith('.'));

/** An index record for a file, or null when Foldwise does not manage that kind of file. */
export function recordFor(file: TFile): AssetRecord | null {
  if (isHidden(file.path)) return null;
  const kind = classifyFile({ name: file.name, type: '' });
  return kind ? makeRecord(file.path, kind.ext, kind.kind, file.stat.size, file.stat.mtime) : null;
}

/**
 * Keeps an AssetIndex in step with the vault. It reads names, sizes and dates only, never file contents.
 * Start it from `workspace.onLayoutReady`, so the first scan does not slow Obsidian's start-up.
 */
export class AssetIndexer {
  readonly index = new AssetIndex();
  ready = false;
  private readonly listeners = new Set<() => void>();
  private readonly notifyLater = debounce(() => this.notify(), 100, true);

  constructor(private readonly app: App) {}

  start(plugin: Plugin): void {
    const { vault } = this.app;
    this.rebuild();

    plugin.registerEvent(
      vault.on('create', (item) => {
        if (item instanceof TFile) this.add(item);
      }),
    );
    plugin.registerEvent(
      vault.on('modify', (item) => {
        if (item instanceof TFile) this.add(item);
      }),
    );
    plugin.registerEvent(
      vault.on('delete', (item) => {
        if (item instanceof TFolder) this.index.removeFolder(item.path);
        else this.index.remove(item.path);
        this.notifyLater();
      }),
    );
    plugin.registerEvent(
      vault.on('rename', (item, oldPath) => {
        this.renamed(item, oldPath);
        this.notifyLater();
      }),
    );
  }

  /** Scan the whole vault again. */
  rebuild(): void {
    const records: AssetRecord[] = [];
    for (const file of this.app.vault.getFiles()) {
      const record = recordFor(file);
      if (record) records.push(record);
    }
    this.index.clear();
    this.index.load(records);
    this.ready = true;
    this.notify();
  }

  /** Runs when the index changes. Returns a function that stops listening. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private add(file: TFile): void {
    const record = recordFor(file);
    if (!record) return;
    const before = this.index.get(record.path);
    if (before && before.size === record.size && before.mtime === record.mtime) return;
    this.index.upsert(record);
    this.notifyLater();
  }

  private renamed(item: TAbstractFile, oldPath: string): void {
    if (item instanceof TFolder) {
      this.index.renameFolder(oldPath, item.path);
      return;
    }
    if (!(item instanceof TFile)) return;
    const record = recordFor(item);
    if (record) this.index.rename(oldPath, record);
    else this.index.remove(oldPath);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
