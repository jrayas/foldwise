import { FuzzySuggestModal, type App, type FuzzyMatch, type TFolder } from 'obsidian';

/** Pick a destination folder: recent ones first, then every folder in the vault. Resolves null if dismissed. */
export class MoveModal extends FuzzySuggestModal<TFolder> {
  private chosen: TFolder | null = null;
  private resolve: (folder: TFolder | null) => void = () => undefined;
  private readonly recent: Set<string>;

  constructor(
    app: App,
    recentFolders: string[],
    title: string,
  ) {
    super(app);
    this.recent = new Set(recentFolders.map((folder) => folder.toLowerCase()));
    this.recentOrder = recentFolders;
    this.setPlaceholder(title);
    this.emptyStateText = 'No folder matches.';
  }

  private readonly recentOrder: string[];

  pick(): Promise<TFolder | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  getItems(): TFolder[] {
    const root = this.app.vault.getRoot();
    const all = [root, ...this.app.vault.getAllFolders()].filter((folder) => !this.isHidden(folder));
    const byKey = new Map(all.map((folder) => [this.keyOf(folder), folder]));
    const recents = this.recentOrder
      .map((folder) => byKey.get(folder.toLowerCase()))
      .filter((folder): folder is TFolder => folder !== undefined);
    const rest = all
      .filter((folder) => !this.recent.has(this.keyOf(folder)))
      .sort((a, b) => a.path.localeCompare(b.path));
    return [...recents, ...rest];
  }

  getItemText(folder: TFolder): string {
    return folder.isRoot() ? '/ (vault root)' : folder.path;
  }

  renderSuggestion(match: FuzzyMatch<TFolder>, el: HTMLElement): void {
    super.renderSuggestion(match, el);
    if (this.recent.has(this.keyOf(match.item))) el.createSpan({ cls: 'foldwise-recent-tag', text: 'recent' });
  }

  onChooseItem(folder: TFolder): void {
    this.chosen = folder;
  }

  onClose(): void {
    super.onClose();
    // The choice arrives just after the modal closes, so settle on the next turn.
    window.setTimeout(() => this.resolve(this.chosen), 0);
  }

  private keyOf(folder: TFolder): string {
    return folder.isRoot() ? '' : folder.path.toLowerCase();
  }

  private isHidden(folder: TFolder): boolean {
    return folder.path.split('/').some((part) => part.startsWith('.'));
  }
}
