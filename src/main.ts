import { Notice, Plugin, TFolder } from 'obsidian';
import type { ViewFilters } from './core/types';
import { filtersFromFolder } from './core/savedViews';
import { AssetIndexer } from './obsidian/assetIndexer';
import { planPaste, savePlan } from './obsidian/paste';
import { UsageTracker } from './obsidian/usageTracker';
import { AssetActions } from './view/assetActions';
import { ThumbnailService } from './obsidian/thumbnailService';
import { SettingsStore } from './settings/store';
import { FoldwiseSettingTab } from './settings/tab';
import { AssetView, VIEW_TYPE_ASSETS } from './view/assetView';

export default class FoldwisePlugin extends Plugin {
  store = new SettingsStore(this);
  private settingTab: FoldwiseSettingTab | null = null;
  private indexer = new AssetIndexer(this.app);
  private usage = new UsageTracker(this.app, this.indexer);
  private actions = new AssetActions(this.app, {
    settings: () => this.store.settings,
    updateSettings: (next) => {
      this.store.settings = next;
      this.store.queueSave();
    },
    usage: this.usage,
  });
  private thumbnails = new ThumbnailService(this.app, this, () => this.store.settings.thumbnails);

  async onload(): Promise<void> {
    await this.store.load();
    if (this.store.warnings.length > 0) {
      console.warn('Foldwise settings:', this.store.warnings);
      new Notice('Foldwise: some saved settings were not valid and were reset. See the developer console for details.');
    }

    this.settingTab = new FoldwiseSettingTab(this.app, this, this.store, this.thumbnails);
    this.addSettingTab(this.settingTab);

    this.registerView(
      VIEW_TYPE_ASSETS,
      (leaf) =>
        new AssetView(leaf, {
          indexer: this.indexer,
          thumbnails: this.thumbnails,
          usage: this.usage,
          actions: this.actions,
          settings: () => this.store.settings,
          updateSettings: (next) => {
            this.store.settings = next;
            this.store.queueSave();
          },
          onSettingsChange: (listener) => this.store.onChange(listener),
        }),
    );
    this.addRibbonIcon('images', 'Open asset manager', () => void this.openAssetManager());
    this.addCommand({
      id: 'open-asset-manager',
      name: 'Open asset manager',
      callback: () => void this.openAssetManager(),
    });
    // Scan the vault once the workspace is ready, so Obsidian's own start-up is not slowed down.
    this.app.workspace.onLayoutReady(() => {
      this.indexer.start(this);
      this.usage.start(this);
      void this.thumbnails.start(this);
    });

    // Right-click a folder: open the asset manager already filtered to it.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFolder)) return;
        menu.addItem((item) =>
          item
            .setTitle('Open assets for this folder')
            .setIcon('images')
            .onClick(() => void this.openAssetManager(file.isRoot() ? { parent: '', subfolder: '' } : filtersFromFolder(file.path))),
        );
      }),
    );

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt, editor, info) => {
        if (evt.defaultPrevented) return;
        const plan = planPaste(this.app, this.store, evt, info);
        if (!plan) return; // not ours: Obsidian handles the paste as usual
        evt.preventDefault(); // must happen before the first await
        void savePlan(this.app, editor, plan);
      }),
    );
  }

  /** Show the asset manager: reuse the tab that is already open, otherwise open a new one. */
  async openAssetManager(filters?: Partial<ViewFilters>): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_ASSETS)[0];
    const leaf = existing ?? workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_ASSETS, active: true });
    await workspace.revealLeaf(leaf);
    // Filters are applied once the page exists, so an already-open page and a new one behave the same.
    if (filters && leaf.view instanceof AssetView) leaf.view.applyFilters(filters);
  }

  /** data.json changed on disk (for example by sync): load it again and refresh the settings page. */
  async onExternalSettingsChange(): Promise<void> {
    await this.store.load();
    this.settingTab?.update();
  }

  onunload(): void {
    void this.store.flush();
    void this.thumbnails.flush();
  }
}
