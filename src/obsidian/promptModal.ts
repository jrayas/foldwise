import { Modal, Setting, type App } from 'obsidian';

export interface PromptOptions {
  title: string;
  /** Label above the box. */
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel: string;
  /** Return a message to refuse the text (the box stays open), or nothing to accept it. */
  validate?: (text: string) => string | undefined;
}

/** Ask for one line of text. Resolves the text, or null if dismissed. */
export class PromptModal extends Modal {
  private resolve: (text: string | null) => void = () => undefined;
  private settled = false;
  private text: string;
  private messageEl!: HTMLElement;

  constructor(
    app: App,
    private readonly options: PromptOptions,
  ) {
    super(app);
    this.text = options.value ?? '';
  }

  ask(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.setTitle(this.options.title);
    new Setting(this.contentEl).setName(this.options.label).addText((text) => {
      text.setValue(this.text).setPlaceholder(this.options.placeholder ?? '').onChange((value) => {
        this.text = value;
        this.messageEl.setText('');
      });
      text.inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => text.inputEl.select(), 0);
    });
    this.messageEl = this.contentEl.createDiv({ cls: 'foldwise-prompt-message' });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(this.options.confirmLabel).setCta().onClick(() => this.submit()))
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.finish(null)));
  }

  private submit(): void {
    const message = this.options.validate?.(this.text);
    if (message) {
      this.messageEl.setText(message);
      return;
    }
    this.finish(this.text);
  }

  onClose(): void {
    this.finish(null);
  }

  private finish(text: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(text);
    this.close();
  }
}
