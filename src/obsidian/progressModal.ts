import { Modal, type App } from 'obsidian';

/** Shows how far a batch of renames or moves has got. Closed by the code that opened it. */
export class ProgressModal extends Modal {
  private bar!: HTMLProgressElement;
  private text!: HTMLElement;

  constructor(
    app: App,
    private readonly title: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.title);
    this.bar = this.contentEl.createEl('progress', { cls: 'foldwise-progress' });
    this.bar.max = 1;
    this.text = this.contentEl.createEl('p', { cls: 'foldwise-progress-text' });
  }

  update(done: number, total: number): void {
    if (!this.bar) return;
    this.bar.max = Math.max(1, total);
    this.bar.value = done;
    this.text.setText(`${done.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}`);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
