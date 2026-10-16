import { debounce, type App, type Plugin } from 'obsidian';
import { UsageMap } from '../core/usage';
import type { AssetIndexer } from './assetIndexer';

/**
 * Keeps a UsageMap (which notes use which asset) in step with Obsidian's link data. Built after layout is
 * ready and again, a second after the last change, whenever Obsidian re-reads links.
 */
export class UsageTracker {
  readonly map = new UsageMap();
  private readonly listeners = new Set<() => void>();
  private readonly rebuildSoon = debounce(() => this.rebuild(), 1000, true);

  constructor(
    private readonly app: App,
    private readonly indexer: AssetIndexer,
  ) {}

  start(plugin: Plugin): void {
    this.rebuild();
    plugin.registerEvent(this.app.metadataCache.on('resolved', () => this.rebuildSoon()));
    plugin.register(this.indexer.onChange(() => this.rebuildSoon()));
  }

  rebuild(): void {
    const { metadataCache, vault } = this.app;
    this.map.rebuild(metadataCache.resolvedLinks, (path) => this.indexer.index.get(path) !== undefined);
    // At start-up Obsidian may not have read any links yet. An empty answer then means "not known yet", not
    // "nothing is used", and a 'resolved' event follows.
    if (Object.keys(metadataCache.resolvedLinks).length === 0 && vault.getMarkdownFiles().length > 0) this.map.ready = false;
    for (const listener of [...this.listeners]) listener();
  }

  /** Runs after the map is rebuilt. Returns a function that stops listening. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
