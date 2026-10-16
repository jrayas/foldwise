import { setIcon, DropdownComponent, ExtraButtonComponent, ItemView, Menu, Notice, Platform, SearchComponent, debounce, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { parentOptions, queryAssets, subfolderOptions, DEFAULT_QUERY, VAULT_ROOT, type AssetQuery, type SortKey, type UsedFilter } from '../core/assetFilter';
import type { AssetRecord } from '../core/assetIndex';
import { cardMetrics } from '../core/cardMetrics';
import { formatCount } from '../core/format';
import { Limiter } from '../core/limiter';
import type { UsageMap } from '../core/usage';
import { activeTab, addView, deleteView, filtersOf, renameView, suggestViewName, tabsFor, type Tab } from '../core/savedViews';
import type { FileKind, FoldwiseSettings, FrameSize, ViewFilters, ViewMode } from '../core/types';
import { columnsFor, visibleWindow } from '../core/virtualList';
import type { AssetIndexer } from '../obsidian/assetIndexer';
import type { ThumbnailProvider } from '../obsidian/thumbnailService';
import { PromptModal } from '../obsidian/promptModal';
import type { UsageTracker } from '../obsidian/usageTracker';
import type { ActionResult, AssetActions } from './assetActions';
import { AssetCard, type CardHost, type Dimensions } from './card';

export const VIEW_TYPE_ASSETS = 'foldwise-assets';

/** What the page needs from the plugin. */
export interface AssetViewContext {
  indexer: AssetIndexer;
  thumbnails: ThumbnailProvider;
  usage: UsageTracker;
  actions: AssetActions;
  settings: () => FoldwiseSettings;
  updateSettings: (next: FoldwiseSettings) => void;
  /** Runs when the settings change (rules, presets or saved views edited). Returns a function that stops listening. */
  onSettingsChange: (listener: () => void) => () => void;
}

type SavedState = {
  query?: Partial<AssetQuery>;
  mode?: ViewMode;
  frame?: FrameSize;
};

const SORT_LABELS: Record<SortKey, string> = { modified: 'Date modified', name: 'Name', size: 'Size' };
const USED_LABELS: Record<UsedFilter, string> = { '': 'Any', used: 'Used', unused: 'Unused' };
const KIND_LABELS: Record<FileKind | '', string> = { '': 'All types', image: 'Images', pdf: 'PDFs' };
const FRAME_LABELS: Record<FrameSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

const isKind = (value: unknown): value is FileKind => value === 'image' || value === 'pdf';
const isUsed = (value: unknown): value is UsedFilter => value === '' || value === 'used' || value === 'unused';
const isSort = (value: unknown): value is SortKey => value === 'modified' || value === 'name' || value === 'size';

/** One adaptive page for every saved asset: toolbar, then a virtual list of fixed-height cards. */
export class AssetView extends ItemView implements CardHost {
  limiter = new Limiter(Platform.isMobile ? 2 : 4);
  dimensions = new Map<string, Dimensions>();

  get thumbnails(): ThumbnailProvider {
    return this.context.thumbnails;
  }

  get usage(): UsageMap {
    return this.context.usage.map;
  }

  private readonly selected = new Set<string>();
  private lastClicked: string | null = null;
  private selectionBar!: HTMLElement;
  private selectionText!: HTMLElement;

  private query: AssetQuery = { ...DEFAULT_QUERY };
  private mode: ViewMode;
  private frame: FrameSize;

  private results: AssetRecord[] = [];
  private cards = new Map<string, { card: AssetCard; signature: string }>();

  private parentSelect!: DropdownComponent;
  private subfolderSelect!: DropdownComponent;
  private kindSelect!: DropdownComponent;
  private usedSelect!: DropdownComponent;
  private tabsEl!: HTMLElement;
  private sortSelect!: DropdownComponent;
  private frameSelect!: DropdownComponent;
  private searchBox!: SearchComponent;
  private directionButton!: ExtraButtonComponent;
  private gridButton!: ExtraButtonComponent;
  private listButton!: ExtraButtonComponent;
  private countEl!: HTMLElement;
  private frameField!: HTMLElement;
  private scroller!: HTMLElement;
  private sizer!: HTMLElement;
  private windowEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private framePending = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly context: AssetViewContext,
  ) {
    super(leaf);
    const defaults = context.settings().assetManager;
    this.mode = defaults.defaultView;
    this.frame = defaults.frameSize;
  }

  getViewType(): string {
    return VIEW_TYPE_ASSETS;
  }

  getDisplayText(): string {
    return 'Assets';
  }

  getIcon(): string {
    return 'images';
  }

  getState(): SavedState {
    return { query: { ...this.query }, mode: this.mode, frame: this.frame };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const saved = (state ?? {}) as SavedState;
    const query = saved.query ?? {};
    this.query = {
      ...DEFAULT_QUERY,
      parent: typeof query.parent === 'string' ? query.parent : '',
      subfolder: typeof query.subfolder === 'string' ? query.subfolder : '',
      kind: isKind(query.kind) ? query.kind : '',
      used: isUsed(query.used) ? query.used : '',
      search: typeof query.search === 'string' ? query.search : '',
      sort: isSort(query.sort) ? query.sort : DEFAULT_QUERY.sort,
      direction: query.direction === 'asc' ? 'asc' : 'desc',
    };
    if (saved.mode === 'grid' || saved.mode === 'list') this.mode = saved.mode;
    if (saved.frame === 'small' || saved.frame === 'medium' || saved.frame === 'large') this.frame = saved.frame;
    if (this.scroller) this.syncToolbar();
    await super.setState(state, result);
    if (this.scroller) this.refresh();
  }

  /** Called by the page's own breadcrumbs: show only this folder. */
  filterTo(parent: string, subfolder: string): void {
    this.query = { ...this.query, parent, subfolder };
    this.changed(true);
  }

  protected onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('foldwise-assets');

    this.buildTabs(root);
    this.buildToolbar(root);
    this.buildSelectionBar(root);

    this.scroller = root.createDiv({ cls: 'foldwise-scroller' });
    this.sizer = this.scroller.createDiv({ cls: 'foldwise-sizer' });
    this.windowEl = this.sizer.createDiv({ cls: 'foldwise-window' });
    this.emptyEl = this.scroller.createDiv({ cls: 'foldwise-empty' });

    this.registerDomEvent(this.scroller, 'scroll', () => this.scheduleFrame());
    const observer = new ResizeObserver(() => this.scheduleFrame());
    observer.observe(this.scroller);
    this.register(() => observer.disconnect());

    const refreshSoon = debounce(() => this.refresh(), 150, true);
    this.register(this.context.indexer.onChange(refreshSoon));
    this.register(
      this.context.usage.onChange(() => {
        for (const { card } of this.cards.values()) card.refreshUsage();
        if (this.query.used !== '') this.refresh();
      }),
    );
    const tabsSoon = debounce(() => this.renderTabs(), 100, true);
    this.register(this.context.onSettingsChange(tabsSoon));

    this.syncToolbar();
    this.refresh();
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    for (const { card } of this.cards.values()) card.destroy();
    this.cards.clear();
    return Promise.resolve();
  }

  // ---- actions and selection (the cards call these) ----

  renameAsset(record: AssetRecord, typed: string): Promise<ActionResult> {
    return this.context.actions.rename(record, typed);
  }

  moveAsset(record: AssetRecord): void {
    void this.context.actions.move(record);
  }

  openNote(record: AssetRecord, event: MouseEvent): void {
    this.context.actions.openNote(record, event);
  }

  isSelected(path: string): boolean {
    return this.selected.has(path);
  }

  toggleSelected(path: string, range: boolean): void {
    const wasSelected = this.selected.has(path);
    if (range && this.lastClicked !== null) {
      const from = this.results.findIndex((record) => record.path === this.lastClicked);
      const to = this.results.findIndex((record) => record.path === path);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (const record of this.results.slice(start, end + 1)) this.selected.add(record.path);
      } else this.selected.add(path);
    } else if (wasSelected) this.selected.delete(path);
    else this.selected.add(path);
    this.lastClicked = path;
    this.selectionChanged();
  }

  /** The selected files that still exist, in the order the page is showing them. */
  private selectedRecords(): AssetRecord[] {
    const records = [...this.selected]
      .map((path) => this.context.indexer.index.get(path))
      .filter((record): record is AssetRecord => record !== undefined);
    return queryAssets(records, this.query, this.usage);
  }

  private selectionChanged(): void {
    for (const [path, { card }] of this.cards) card.setSelected(this.selected.has(path));
    this.selectionBar.toggleClass('is-visible', this.selected.size > 0);
    this.selectionText.setText(`${formatCount(this.selected.size, 'file')} selected`);
  }

  private clearSelection(): void {
    this.selected.clear();
    this.lastClicked = null;
    this.selectionChanged();
  }

  private buildSelectionBar(root: HTMLElement): void {
    this.selectionBar = root.createDiv({ cls: 'foldwise-selection' });
    this.selectionText = this.selectionBar.createSpan({ cls: 'foldwise-selection-text' });
    const button = (label: string, onClick: () => void): void => {
      const element = this.selectionBar.createEl('button', { text: label, attr: { type: 'button' } });
      element.addEventListener('click', onClick);
    };
    button('Select all in this view', () => {
      for (const record of this.results) this.selected.add(record.path);
      this.selectionChanged();
    });
    button('Move…', () => void this.context.actions.moveMany(this.selectedRecords()).then((done) => done && this.clearSelection()));
    button('Rename…', () => void this.context.actions.renameMany(this.selectedRecords()).then((done) => done && this.clearSelection()));
    button('Clear', () => this.clearSelection());
  }

  // ---- toolbar ----

  private buildTabs(root: HTMLElement): void {
    this.tabsEl = root.createDiv({ cls: 'foldwise-tabs' });
    this.renderTabs();
  }

  /** All, one tab per folder rule, then pinned views, then "+". A tab is active only while the filters match it. */
  private renderTabs(): void {
    if (!this.tabsEl) return;
    const settings = this.context.settings();
    const tabs = tabsFor(settings);
    const active = activeTab(this.query, tabs);
    this.tabsEl.empty();
    for (const tab of tabs) {
      const button = this.tabsEl.createDiv({ cls: ['foldwise-tab', tab.id === active?.id ? 'is-active' : ''] });
      const label = button.createEl('button', { text: tab.name, cls: 'foldwise-tab-label', attr: { type: 'button' } });
      label.addEventListener('click', () => this.openTab(tab));
      if (tab.source === 'view') {
        label.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.viewMenu(tab).showAtMouseEvent(event);
        });
        const remove = button.createEl('button', { cls: 'foldwise-tab-remove clickable-icon', attr: { type: 'button', 'aria-label': `Remove ${tab.name}` } });
        setIcon(remove, 'x');
        remove.addEventListener('click', () => this.removeView(tab));
      }
    }
    const add = this.tabsEl.createEl('button', { cls: 'foldwise-tab-add clickable-icon', attr: { type: 'button', 'aria-label': 'Pin the current filters as a tab' } });
    setIcon(add, 'plus');
    add.addEventListener('click', () => void this.pinCurrent());
  }

  private openTab(tab: Tab): void {
    this.applyFilters(tab.filters, tab.source === 'view');
  }

  /** Show these filters. A pinned view also brings its own sort; the other tabs keep the current sort. */
  applyFilters(filters: Partial<ViewFilters>, withSort = false): void {
    const { sort, direction, ...rest } = filters;
    this.query = { ...this.query, ...rest, search: '', ...(withSort && sort && direction ? { sort, direction } : {}) };
    this.searchBox?.setValue('');
    this.changed(true);
  }

  private viewMenu(tab: Tab): Menu {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('Rename').setIcon('pencil').onClick(() => void this.renamePinned(tab)));
    menu.addItem((item) => item.setTitle('Remove').setIcon('trash').onClick(() => this.removeView(tab)));
    return menu;
  }

  private async pinCurrent(): Promise<void> {
    const settings = this.context.settings();
    const existing = activeTab(this.query, tabsFor(settings));
    if (existing) {
      new Notice(`There is already a tab for these filters: ${existing.name}.`);
      return;
    }
    const filters = filtersOf(this.query);
    const name = await new PromptModal(this.app, {
      title: 'Pin these filters as a tab',
      label: 'Tab name',
      value: suggestViewName(filters),
      confirmLabel: 'Pin tab',
      validate: (text) => (text.trim() === '' ? 'Give the tab a name.' : undefined),
    }).ask();
    if (name === null) return;
    const latest = this.context.settings();
    this.context.updateSettings({ ...latest, views: addView(latest.views, name, filters) });
  }

  private async renamePinned(tab: Tab): Promise<void> {
    const id = tab.id.replace(/^view:/, '');
    const name = await new PromptModal(this.app, {
      title: 'Rename tab',
      label: 'Tab name',
      value: tab.name,
      confirmLabel: 'Rename',
      validate: (text) => (text.trim() === '' ? 'Give the tab a name.' : undefined),
    }).ask();
    if (name === null) return;
    const latest = this.context.settings();
    this.context.updateSettings({ ...latest, views: renameView(latest.views, id, name) });
  }

  private removeView(tab: Tab): void {
    const latest = this.context.settings();
    this.context.updateSettings({ ...latest, views: deleteView(latest.views, tab.id.replace(/^view:/, '')) });
  }

  private buildToolbar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: 'foldwise-toolbar' });
    const field = (label: string): HTMLElement => {
      const wrapper = bar.createDiv({ cls: 'foldwise-field' });
      wrapper.createEl('label', { text: label });
      return wrapper;
    };

    this.parentSelect = new DropdownComponent(field('Parent')).onChange((value) => {
      this.query = { ...this.query, parent: value, subfolder: '' };
      this.changed(true);
    });
    this.subfolderSelect = new DropdownComponent(field('Subfolder')).onChange((value) => {
      this.query = { ...this.query, subfolder: value };
      this.changed(true);
    });
    this.kindSelect = new DropdownComponent(field('Type'));
    (Object.keys(KIND_LABELS) as Array<FileKind | ''>).forEach((kind) => {
      this.kindSelect.addOption(kind, KIND_LABELS[kind]);
    });
    this.kindSelect.onChange((value) => {
      this.query = { ...this.query, kind: isKind(value) ? value : '' };
      this.changed(true);
    });

    this.usedSelect = new DropdownComponent(field('Used by notes'));
    (Object.keys(USED_LABELS) as UsedFilter[]).forEach((used) => {
      this.usedSelect.addOption(used, USED_LABELS[used]);
    });
    this.usedSelect.onChange((value) => {
      this.query = { ...this.query, used: isUsed(value) ? value : '' };
      this.changed(true);
    });

    const searchField = field('Search');
    this.searchBox = new SearchComponent(searchField).setPlaceholder('File name');
    const applySearch = debounce(() => {
      this.query = { ...this.query, search: this.searchBox.getValue() };
      this.changed(true);
    }, 200, true);
    this.searchBox.onChange(() => applySearch());

    const sortRow = field('Sort').createDiv({ cls: 'foldwise-field-row' });
    this.sortSelect = new DropdownComponent(sortRow);
    (Object.keys(SORT_LABELS) as SortKey[]).forEach((key) => {
      this.sortSelect.addOption(key, SORT_LABELS[key]);
    });
    this.sortSelect.onChange((value) => {
      if (isSort(value)) this.query = { ...this.query, sort: value };
      this.changed(true);
    });
    this.directionButton = new ExtraButtonComponent(sortRow).onClick(() => {
      this.query = { ...this.query, direction: this.query.direction === 'asc' ? 'desc' : 'asc' };
      this.changed(true);
    });

    const viewField = field('View').createDiv({ cls: 'foldwise-field-row' });
    this.gridButton = new ExtraButtonComponent(viewField).setIcon('layout-grid').setTooltip('Grid').onClick(() => this.setMode('grid'));
    this.listButton = new ExtraButtonComponent(viewField).setIcon('list').setTooltip('List').onClick(() => this.setMode('list'));

    this.frameField = field('Photo size');
    this.frameSelect = new DropdownComponent(this.frameField);
    (Object.keys(FRAME_LABELS) as FrameSize[]).forEach((size) => {
      this.frameSelect.addOption(size, FRAME_LABELS[size]);
    });
    this.frameSelect.onChange((value) => {
      if (value === 'small' || value === 'medium' || value === 'large') this.frame = value;
      this.changed(false, true);
    });

    this.countEl = bar.createDiv({ cls: 'foldwise-count' });
  }

  private setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.changed(false, true);
  }

  /** Put the controls in step with the current query (after a restore or a click on a breadcrumb). */
  private syncToolbar(): void {
    this.kindSelect.setValue(this.query.kind);
    this.usedSelect.setValue(this.query.used);
    this.sortSelect.setValue(this.query.sort);
    this.frameSelect.setValue(this.frame);
    if (this.searchBox.getValue() !== this.query.search) this.searchBox.setValue(this.query.search);
    this.directionButton
      .setIcon(this.query.direction === 'asc' ? 'arrow-up' : 'arrow-down')
      .setTooltip(this.query.direction === 'asc' ? 'Ascending' : 'Descending');
    this.gridButton.extraSettingsEl.toggleClass('is-active', this.mode === 'grid');
    this.listButton.extraSettingsEl.toggleClass('is-active', this.mode === 'list');
    this.frameField.toggleClass('is-hidden', this.mode === 'list');
  }

  /** A filter, sort or layout choice changed. */
  private changed(toTop: boolean, rebuildCards = false): void {
    if (rebuildCards) this.dropCards();
    this.syncToolbar();
    this.refresh();
    this.renderTabs();
    if (toTop) this.scroller.scrollTop = 0;
    this.app.workspace.requestSaveLayout();
  }

  /** Fill a dropdown, keeping the chosen value when it is still on offer. */
  private fillOptions(select: DropdownComponent, options: Array<[string, string]>, value: string): string {
    select.selectEl.empty();
    for (const [optionValue, label] of options) select.addOption(optionValue, label);
    const chosen = options.some(([optionValue]) => optionValue === value) ? value : (options[0]?.[0] ?? '');
    select.setValue(chosen);
    return chosen;
  }

  // ---- data and drawing ----

  /** Run the query again and redraw. Cheap: the index is in memory. */
  private refresh(): void {
    if (!this.scroller) return;
    const records = this.context.indexer.index.toArray();

    const parents = parentOptions(records, this.query.kind);
    const parentValue = this.fillOptions(
      this.parentSelect,
      [['', 'All'], ...parents.map((option): [string, string] => [option.value, `${option.value === VAULT_ROOT ? 'Vault root' : option.value} (${option.count})`])],
      this.query.parent,
    );
    const subfolders = subfolderOptions(records, parentValue, this.query.kind);
    const subfolderValue = this.fillOptions(
      this.subfolderSelect,
      [['', 'All'], ...subfolders.map((option): [string, string] => [option.value, `${option.value} (${option.count})`])],
      this.query.subfolder,
    );
    this.subfolderSelect.setDisabled(subfolders.length === 0);
    this.query = { ...this.query, parent: parentValue, subfolder: subfolderValue };

    for (const path of [...this.selected]) if (!this.context.indexer.index.get(path)) this.selected.delete(path);
    this.results = queryAssets(records, this.query, this.usage);
    this.countEl.setText(
      this.results.length === records.length
        ? formatCount(records.length, 'file')
        : `${formatCount(this.results.length, 'file')} of ${records.length.toLocaleString('en-GB')}`,
    );
    if (this.query.used !== '' && !this.usage.ready) this.countEl.setText('Checking which notes use these files…');
    this.showEmptyState(records.length);
    this.renderWindow();
    this.selectionChanged();
  }

  private showEmptyState(total: number): void {
    this.emptyEl.empty();
    this.emptyEl.toggleClass('is-visible', this.results.length === 0);
    if (this.results.length > 0) return;
    if (!this.context.indexer.ready) {
      this.emptyEl.createEl('p', { text: 'Reading the vault…' });
    } else if (total === 0) {
      this.emptyEl.createEl('p', { text: 'This vault has no images or PDF files yet.' });
    } else {
      this.emptyEl.createEl('p', { text: 'Nothing matches these filters.' });
      const clear = this.emptyEl.createEl('button', { text: 'Clear filters', attr: { type: 'button' } });
      clear.addEventListener('click', () => {
        this.query = { ...DEFAULT_QUERY, sort: this.query.sort, direction: this.query.direction };
        this.searchBox.setValue('');
        this.changed(true);
      });
    }
  }

  private scheduleFrame(): void {
    if (this.framePending) return;
    this.framePending = true;
    window.requestAnimationFrame(() => {
      this.framePending = false;
      this.renderWindow();
    });
  }

  private dropCards(): void {
    for (const { card } of this.cards.values()) card.destroy();
    this.cards.clear();
  }

  private renderWindow(): void {
    const metrics = cardMetrics(this.mode, this.frame);
    const width = this.sizer.clientWidth;
    const columns = this.mode === 'list' ? 1 : columnsFor(width, metrics.minCardWidth, metrics.gap);
    const geometry = { count: this.results.length, columns, cardHeight: metrics.cardHeight, gap: metrics.gap };
    const win = visibleWindow(geometry, this.scroller.scrollTop, this.scroller.clientHeight);

    this.sizer.setCssProps({
      '--fw-total': `${win.totalHeight}px`,
      '--fw-card-height': `${metrics.cardHeight}px`,
      '--fw-columns': String(columns),
      '--fw-gap': `${metrics.gap}px`,
      '--fw-frame-width': `${metrics.frame.width}px`,
      '--fw-frame-height': `${metrics.frame.height}px`,
    });
    this.windowEl.setCssProps({ '--fw-offset': `${win.offsetTop}px` });

    const wanted = this.results.slice(win.start, win.end);
    const frameKey = this.mode === 'grid' ? this.frame : 'list';
    const keep = new Set<string>();
    const elements: HTMLElement[] = [];

    for (const record of wanted) {
      const signature = AssetCard.signature(record, this.mode, frameKey);
      keep.add(record.path);
      let entry = this.cards.get(record.path);
      if (!entry || entry.signature !== signature) {
        entry?.card.destroy();
        entry = { card: new AssetCard(this, record, this.mode, metrics.frame), signature };
        this.cards.set(record.path, entry);
      }
      elements.push(entry.card.el);
    }
    for (const [path, entry] of [...this.cards]) {
      if (!keep.has(path)) {
        entry.card.destroy();
        this.cards.delete(path);
      }
    }
    this.windowEl.replaceChildren(...elements);
  }
}
