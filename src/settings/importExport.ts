import { FuzzySuggestModal, Modal, Notice, Setting, type App, type TFile } from 'obsidian';
import { MAX_IMPORT_BYTES, exportFileName, parseImport, type ExportKind, type ParsedImport } from '../core/exportImport';
import { nextFreePath } from '../core/renamePlan';
import { MoveModal } from '../obsidian/moveModal';
import { buildIndex } from '../obsidian/vaultIndex';

const PREVIEW_LINES = 14;

/** Show an export and offer to copy it or save it as a file in the vault. Never overwrites a file. */
export class ExportModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly kind: ExportKind,
    private readonly text: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.title);
    this.contentEl.createEl('p', {
      text: 'This is plain JSON. Keep it as a backup, or import it into another vault.',
      cls: 'foldwise-apply-help',
    });
    const lines = this.text.split('\n');
    this.contentEl.createEl('pre', {
      cls: 'foldwise-export-preview',
      text: lines.slice(0, PREVIEW_LINES).join('\n') + (lines.length > PREVIEW_LINES ? `\n… (${lines.length - PREVIEW_LINES} more lines)` : ''),
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('Copy to clipboard').setCta().onClick(() => {
          navigator.clipboard.writeText(this.text).then(
            () => {
              new Notice('Copied to the clipboard.');
              this.close();
            },
            () => new Notice('Could not copy. Try saving it as a file instead.'),
          );
        }),
      )
      .addButton((button) => button.setButtonText('Save as a file…').onClick(() => void this.saveFile()))
      .addButton((button) => button.setButtonText('Close').onClick(() => this.close()));
  }

  private async saveFile(): Promise<void> {
    const folder = await new MoveModal(this.app, [], 'Save the export in which folder?').pick();
    if (!folder) return;
    const directory = folder.isRoot() ? '' : folder.path;
    const index = buildIndex(this.app.vault);
    const fileName = exportFileName(this.kind, new Date());
    const wanted = `${directory ? `${directory}/` : ''}${fileName}`;
    const exists = (path: string): boolean => index.has(path.toLowerCase());
    const path = exists(wanted) ? nextFreePath(directory, fileName.replace(/\.json$/, ''), 'json', exists) : wanted;
    if (!path) {
      new Notice('Could not find a free file name.');
      return;
    }
    try {
      await this.app.vault.create(path, this.text);
      new Notice(`Saved ${path}. Obsidian does not list .json files, so find it in your file manager.`, 8000);
      this.close();
    } catch (error) {
      new Notice(`Could not save the file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Pick a .json file from the vault. Resolves null if dismissed. */
class JsonFilePicker extends FuzzySuggestModal<TFile> {
  private chosen: TFile | null = null;
  private resolve: (file: TFile | null) => void = () => undefined;

  constructor(app: App) {
    super(app);
    this.setPlaceholder('Choose an export file');
  }

  pick(): Promise<TFile | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === 'json' && !file.path.split('/').some((part) => part.startsWith('.')));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.chosen = file;
  }

  onClose(): void {
    super.onClose();
    window.setTimeout(() => this.resolve(this.chosen), 0);
  }
}

export interface ImportHandlers {
  /** Add the import to the current setup. */
  merge: (parsed: Extract<ParsedImport, { ok: true }>) => void;
  /** Replace the whole setup (only offered for a full export). Resolves false if the person backed out. */
  replace: (parsed: Extract<ParsedImport, { ok: true; kind: 'all' }>) => Promise<boolean>;
}

/** Import from pasted text or a file in the vault. Shows what was found before anything changes. */
export class ImportModal extends Modal {
  private text = '';
  private parsed: ParsedImport | null = null;
  private boxEl!: HTMLTextAreaElement;
  private reportEl!: HTMLElement;
  private mergeButton!: HTMLButtonElement;
  private replaceButton!: HTMLButtonElement;

  constructor(
    app: App,
    private readonly handlers: ImportHandlers,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('Import');
    this.modalEl.addClass('foldwise-import');
    this.contentEl.createEl('p', {
      text: 'Paste an export below, or choose a file from the vault. Nothing changes until you choose to merge or replace.',
      cls: 'foldwise-apply-help',
    });
    this.boxEl = this.contentEl.createEl('textarea', { cls: 'foldwise-import-box', attr: { rows: '8', spellcheck: 'false', placeholder: '{ "foldwise": "foldwise-export", … }' } });
    this.boxEl.addEventListener('input', () => this.read(this.boxEl.value));

    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText('Choose a file from the vault…').onClick(() => {
        void new JsonFilePicker(this.app).pick().then(async (file) => {
          if (!file) return;
          if (file.stat.size > MAX_IMPORT_BYTES) {
            new Notice('That file is too large to be an export.');
            return;
          }
          const text = await this.app.vault.read(file);
          this.boxEl.value = text;
          this.read(text);
        });
      }),
    );

    this.reportEl = this.contentEl.createDiv({ cls: 'foldwise-import-report' });
    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText('Merge into my setup').setCta().onClick(() => this.merge());
        this.mergeButton = button.buttonEl;
      })
      .addButton((button) => {
        button.setButtonText('Replace everything…').setDestructive().onClick(() => void this.replace());
        this.replaceButton = button.buttonEl;
      })
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
    this.read('');
  }

  private read(text: string): void {
    this.text = text;
    this.parsed = text.trim() === '' ? null : parseImport(text);
    this.reportEl.empty();
    const parsed = this.parsed;
    if (!parsed) {
      this.reportEl.setText('');
    } else if (!parsed.ok) {
      this.reportEl.createDiv({ cls: 'foldwise-import-error', text: parsed.message });
    } else {
      this.reportEl.createDiv({ text: `Found ${parsed.summary}.` });
      for (const warning of parsed.warnings.slice(0, 8)) this.reportEl.createDiv({ cls: 'foldwise-import-warning', text: warning });
      if (parsed.warnings.length > 8) this.reportEl.createDiv({ cls: 'foldwise-import-warning', text: `and ${parsed.warnings.length - 8} more notes.` });
      this.reportEl.createDiv({
        cls: 'foldwise-apply-help',
        text:
          parsed.kind === 'all'
            ? 'Merge adds new rules, presets and views and keeps yours. Replace swaps your whole setup for this one, after saving a backup copy.'
            : 'This is one folder rule. Merge adds it, unless a rule for that folder already exists.',
      });
    }
    this.mergeButton.disabled = !parsed?.ok;
    this.replaceButton.disabled = !(parsed?.ok && parsed.kind === 'all');
  }

  private merge(): void {
    if (!this.parsed?.ok) return;
    this.handlers.merge(this.parsed);
    this.close();
  }

  private async replace(): Promise<void> {
    if (!this.parsed?.ok || this.parsed.kind !== 'all') return;
    if (await this.handlers.replace(this.parsed)) this.close();
  }
}
