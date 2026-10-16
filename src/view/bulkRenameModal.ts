import { Modal, Setting, type App } from 'obsidian';
import { BULK_TOKEN_HELP, previewBulkRename, type BulkItem, type BulkRow } from '../core/bulkRename';
import { formatCount } from '../core/format';

const MAX_ROWS_SHOWN = 100;

/**
 * Rename a selection with a pattern. Shows every new name before anything changes; only rows that are fine
 * are renamed, the others are skipped with the reason shown. Resolves the rows to rename, or null.
 */
export class BulkRenameModal extends Modal {
  private resolve: (rows: BulkRow[] | null) => void = () => undefined;
  private settled = false;
  private pattern = '{name}';
  private rows: BulkRow[] = [];
  private listEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private warningEl!: HTMLElement;
  private confirmButton!: HTMLButtonElement;

  constructor(
    app: App,
    private readonly items: BulkItem[],
    private readonly exists: (path: string) => boolean,
  ) {
    super(app);
  }

  ask(): Promise<BulkRow[] | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.setTitle(`Rename ${formatCount(this.items.length, 'file')}`);
    this.modalEl.addClass('foldwise-bulk');

    new Setting(this.contentEl)
      .setName('Pattern')
      .setDesc(BULK_TOKEN_HELP)
      .addText((text) => {
        text.setValue(this.pattern).onChange((value) => {
          this.pattern = value;
          this.refresh();
        });
        window.setTimeout(() => text.inputEl.select(), 0);
      });

    this.warningEl = this.contentEl.createDiv({ cls: 'foldwise-bulk-warning' });
    this.listEl = this.contentEl.createDiv({ cls: 'foldwise-bulk-list' });
    this.summaryEl = this.contentEl.createDiv({ cls: 'foldwise-bulk-summary' });

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setCta().onClick(() => this.finish(this.rows.filter((row) => row.status === 'ok')));
        this.confirmButton = button.buttonEl;
      })
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.finish(null)));
    this.refresh();
  }

  private refresh(): void {
    const preview = previewBulkRename(this.items, this.pattern, this.exists);
    this.rows = preview.rows;

    this.warningEl.empty();
    for (const warning of preview.warnings) this.warningEl.createDiv({ text: warning });

    this.listEl.empty();
    for (const row of preview.rows.slice(0, MAX_ROWS_SHOWN)) {
      const line = this.listEl.createDiv({ cls: ['foldwise-bulk-row', `is-${row.status}`] });
      line.createSpan({ cls: 'foldwise-bulk-old', text: row.oldName });
      line.createSpan({ cls: 'foldwise-bulk-arrow', text: '→' });
      line.createSpan({ cls: 'foldwise-bulk-new', text: row.newName });
      if (row.message && row.status !== 'same') line.createSpan({ cls: 'foldwise-bulk-note', text: row.message });
    }
    if (preview.rows.length > MAX_ROWS_SHOWN) {
      this.listEl.createDiv({ cls: 'foldwise-bulk-more', text: `and ${preview.rows.length - MAX_ROWS_SHOWN} more` });
    }

    this.summaryEl.setText(
      preview.problemCount > 0
        ? `${formatCount(preview.okCount, 'file')} will be renamed. ${formatCount(preview.problemCount, 'file')} will be skipped. Links in your notes are updated by Obsidian. There is no undo here.`
        : `${formatCount(preview.okCount, 'file')} will be renamed. Links in your notes are updated by Obsidian. There is no undo here.`,
    );
    this.confirmButton.setText(preview.okCount === 0 ? 'Nothing to rename' : `Rename ${formatCount(preview.okCount, 'file')}`);
    this.confirmButton.disabled = preview.okCount === 0;
  }

  onClose(): void {
    this.finish(null);
  }

  private finish(rows: BulkRow[] | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(rows);
    this.close();
  }
}
