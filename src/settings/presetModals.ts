import { FuzzySuggestModal, Modal, Setting, type App, type FuzzyMatch } from 'obsidian';
import { applyPreset, presetSummary } from '../core/presets';
import { formatCount } from '../core/format';
import { ruleLabel, ruleTargetText } from '../core/summary';
import type { Preset, Rule } from '../core/types';

/** Choose a preset from a list. Resolves null if dismissed. */
export class PresetPickModal extends FuzzySuggestModal<Preset> {
  private chosen: Preset | null = null;
  private resolve: (preset: Preset | null) => void = () => undefined;

  constructor(
    app: App,
    private readonly presets: Preset[],
    title: string,
  ) {
    super(app);
    this.setPlaceholder(title);
  }

  pick(): Promise<Preset | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  getItems(): Preset[] {
    return this.presets;
  }

  getItemText(preset: Preset): string {
    return preset.name;
  }

  renderSuggestion(match: FuzzyMatch<Preset>, el: HTMLElement): void {
    super.renderSuggestion(match, el);
    el.createDiv({ cls: 'foldwise-preset-summary', text: presetSummary(match.item) });
  }

  onChooseItem(preset: Preset): void {
    this.chosen = preset;
  }

  onClose(): void {
    super.onClose();
    window.setTimeout(() => this.resolve(this.chosen), 0);
  }
}

/**
 * Pick the folders to give a preset to. Shows exactly what would change in each before anything does, and
 * leaves out folders that already match. Resolves the chosen rule ids, or null.
 */
export class ApplyPresetModal extends Modal {
  private resolve: (ids: Set<string> | null) => void = () => undefined;
  private settled = false;
  private readonly chosen = new Set<string>();
  private confirmButton!: HTMLButtonElement;

  constructor(
    app: App,
    private readonly preset: Preset,
    private readonly rules: Rule[],
  ) {
    super(app);
  }

  ask(): Promise<Set<string> | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.setTitle(`Apply "${this.preset.name}"`);
    this.modalEl.addClass('foldwise-apply-preset');
    this.contentEl.createEl('p', {
      text: 'The values are copied into each folder you tick. Anything this preset does not set goes back to the shared defaults. Folders and the on/off switch are not touched.',
      cls: 'foldwise-apply-help',
    });

    if (this.rules.length === 0) this.contentEl.createEl('p', { text: 'There are no folder rules yet.' });

    const list = this.contentEl.createDiv({ cls: 'foldwise-apply-list' });
    for (const rule of this.rules) {
      const { changes } = applyPreset(rule, this.preset);
      const row = list.createEl('label', { cls: 'foldwise-apply-row' });
      const box = row.createEl('input', { attr: { type: 'checkbox' } });
      box.disabled = changes.length === 0;
      box.addEventListener('change', () => {
        if (box.checked) this.chosen.add(rule.id);
        else this.chosen.delete(rule.id);
        this.refresh();
      });
      const text = row.createDiv();
      text.createDiv({ cls: 'foldwise-apply-name', text: `${ruleLabel(rule)}  ${ruleTargetText(rule)}` });
      if (changes.length === 0) text.createDiv({ cls: 'foldwise-apply-same', text: 'Already matches this preset.' });
      for (const change of changes) text.createDiv({ cls: 'foldwise-apply-change', text: change });
    }

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setCta().onClick(() => this.finish(new Set(this.chosen)));
        this.confirmButton = button.buttonEl;
      })
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.finish(null)));
    this.refresh();
  }

  private refresh(): void {
    this.confirmButton.setText(this.chosen.size === 0 ? 'Choose folders' : `Apply to ${formatCount(this.chosen.size, 'folder')}`);
    this.confirmButton.disabled = this.chosen.size === 0;
  }

  onClose(): void {
    this.finish(null);
  }

  private finish(ids: Set<string> | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(ids);
    this.close();
  }
}
