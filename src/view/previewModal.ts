import { Modal, type App, type TFile } from 'obsidian';

/** The original image at full size. Loads only when opened, and only for this one file. */
export class PreviewModal extends Modal {
  constructor(
    app: App,
    private readonly file: TFile,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.file.name);
    this.modalEl.addClass('foldwise-preview');
    this.contentEl.createEl('img', {
      cls: 'foldwise-preview-image',
      attr: { src: this.app.vault.getResourcePath(this.file), alt: this.file.name },
    });
    this.contentEl.createDiv({ cls: 'foldwise-preview-path', text: this.file.path });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
