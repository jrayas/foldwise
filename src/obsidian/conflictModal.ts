import { Modal, Setting, type App } from 'obsidian';

/** Asked when a file name is taken and the conflict mode is "ask". Resolves true to use the suggested name. */
export class ConflictModal extends Modal {
  private resolve: (useSuggestion: boolean) => void = () => undefined;
  private settled = false;

  constructor(
    app: App,
    private readonly existingPath: string,
    private readonly suggestedName: string,
    private readonly actionLabel = 'Save as',
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
    this.setTitle('File already exists');
    this.contentEl.createEl('p', { text: `${this.existingPath} already exists. Nothing is overwritten.` });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText(`${this.actionLabel} ${this.suggestedName}`).setCta().onClick(() => this.finish(true)),
      )
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.finish(false)));
  }

  onClose(): void {
    this.finish(false);
  }

  private finish(useSuggestion: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(useSuggestion);
    this.close();
  }
}
