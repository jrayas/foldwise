import { AbstractInputSuggest, type App, type TFolder } from 'obsidian';
import { relativeTo } from '../core/paths';

/** Autocomplete for folders inside a root folder. Suggestions and picks are relative to that root. */
export class SubfolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly root: () => string,
    private readonly onPick: (relativePath: string) => void,
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFolder[] {
    const needle = query.trim().toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((folder) => {
        const relative = relativeTo(this.root(), folder.path);
        return relative !== null && relative !== '' && relative.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(relativeTo(this.root(), folder.path) ?? folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    const relative = relativeTo(this.root(), folder.path);
    if (relative) this.onPick(relative);
    this.close();
  }
}
