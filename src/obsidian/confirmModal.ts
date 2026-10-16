import { Modal, Setting, type App } from 'obsidian';

/** A small yes/no question. Resolves true only when the confirm button is pressed. */
export class ConfirmModal extends Modal {
  private resolve: (confirmed: boolean) => void = () => undefined;
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmLabel: string,
  ) {
    super(app);
  }

  ask(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.setTitle(this.title);
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(this.confirmLabel).setDestructive().onClick(() => this.finish(true)))
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.finish(false)));
  }

  onClose(): void {
    this.finish(false);
  }

  private finish(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(confirmed);
    this.close();
  }
}
