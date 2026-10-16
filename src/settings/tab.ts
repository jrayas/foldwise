import { Notice, PluginSettingTab, normalizePath, type App, type Plugin, type SettingDefinitionItem, type SettingDefinitionPage } from 'obsidian';
import { readControl, writeControl } from '../core/controls';
import { renderPattern } from '../core/naming';
import { deleteRule, moveRule, newRule } from '../core/ruleEdit';
import { applyPreset, applyPresetToRules, deletePreset, newPreset, presetFromRule, presetSummary } from '../core/presets';
import { backupFileName, describeMerge, exportAll, exportRule, mergeImport } from '../core/exportImport';
import { ruleLabel, ruleTargetText } from '../core/summary';
import { validateSettings, type Issue } from '../core/validate';
import type { FoldwiseSettings, Preset, Rule } from '../core/types';
import { ConfirmModal } from '../obsidian/confirmModal';
import { vaultFacts } from '../obsidian/vaultFacts';
import { badgesFor } from '../core/ruleEdit';
import { PromptModal } from '../obsidian/promptModal';
import { ExportModal, ImportModal } from './importExport';
import { presetItems } from './presetPage';
import { ApplyPresetModal, PresetPickModal } from './presetModals';
import { ruleItems } from './rulePage';
import type { RuleFormContext, TestInput } from './ruleForm';
import type { SettingsStore } from './store';
import type { ThumbnailService } from '../obsidian/thumbnailService';
import { formatBytes } from '../core/format';

/**
 * Obsidian 1.14 identifies sub-pages by name and logs an error when two share one; an explicit `id` fixes
 * that. The property exists at runtime but is not yet in the published typings.
 */
type PageWithId = SettingDefinitionPage & { id: string };

export class FoldwiseSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: Plugin,
    private readonly store: SettingsStore,
    private readonly thumbnails: ThumbnailService,
  ) {
    super(app, plugin);
    this.icon = 'folder-tree';
  }

  getControlValue(key: string): unknown {
    return readControl(this.store.settings, key);
  }

  setControlValue(key: string, value: unknown): void {
    this.apply(writeControl(this.store.settings, key, value));
  }

  hide(): void {
    super.hide();
    void this.store.flush();
  }

  /** Replace the settings, queue a save and refresh what is shown. */
  private apply(next: FoldwiseSettings): void {
    if (next === this.store.settings) return;
    this.store.settings = next;
    this.store.queueSave();
    this.update();
  }

  private readOnly = (): boolean => this.store.readOnly;

  private readonly testInputs = new Map<string, TestInput>();

  private formContext(): RuleFormContext {
    return {
      app: this.app,
      store: this.store,
      readOnly: this.readOnly,
      apply: (next) => this.apply(next),
      update: () => this.update(),
      testInputs: this.testInputs,
    };
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const settings = this.store.settings;
    const issues = validateSettings(settings, vaultFacts(this.app));
    return [
      ...(this.store.readOnly
        ? [{ name: 'Saved settings are from a newer version of Foldwise. Changes here will not be saved.' }]
        : []),
      this.generalPage(issues),
      {
        type: 'list',
        heading: 'Folders',
        emptyState: 'No folder rules yet. Without one, pasted files use the fallback.',
        search: {
          placeholder: 'Search folders',
          match: (def, query) => {
            const text = `${def.name} ${typeof def.desc === 'string' ? def.desc : ''}`.toLowerCase();
            return text.includes(query.trim().toLowerCase());
          },
        },
        addItem: { name: 'Add folder', action: () => this.addRule() },
        onReorder: (from, to) => this.apply({ ...this.store.settings, rules: moveRule(this.store.settings.rules, from, to) }),
        onDelete: (index) => void this.confirmDelete(this.store.settings.rules[index]),
        items: settings.rules.map((rule) => this.rulePage(rule, issues)),
      },
      {
        type: 'list',
        heading: 'Presets',
        emptyState: 'No presets yet. Save one from a folder rule, or add one here.',
        addItem: { name: 'Add preset', action: () => this.addPreset() },
        onDelete: (index) => void this.confirmDeletePreset(this.store.settings.presets[index]),
        items: settings.presets.map((preset) => this.presetPage(preset)),
      },
      this.importExportGroup(),
    ];
  }

  private generalPage(issues: Issue[]): SettingDefinitionPage {
    const general = this.store.settings.general;
    const hasIssues = issues.some((issue) => issue.ruleId === null);
    const page: PageWithId = {
      id: 'general',
      type: 'page',
      name: 'General',
      desc: 'Fallback, default naming and file types.',
      displayValue: general.fallback.mode === 'folder' ? `Fallback: ${general.fallback.path || 'not chosen'}` : 'Fallback: Obsidian',
      status: hasIssues ? 'warning' : null,
      items: [
        ...issues
          .filter((issue) => issue.ruleId === null)
          .map((issue) => ({ name: issue.message })),
        {
          name: 'Fallback',
          desc: 'What happens when no folder rule matches a pasted file.',
          control: {
            type: 'dropdown',
            key: 'general.fallbackMode',
            disabled: this.readOnly,
            options: { 'obsidian-default': "Obsidian's attachment setting", folder: 'A fixed folder' },
          },
        },
        {
          name: 'Fallback folder',
          desc: 'Created if it does not exist.',
          visible: () => this.store.settings.general.fallback.mode === 'folder',
          control: { type: 'folder', key: 'general.fallbackPath', disabled: this.readOnly },
        },
        {
          name: 'Default naming pattern',
          desc: 'Tokens: {note}, {date:YYYYMMDD} and {n}. Rules can override this.',
          control: {
            type: 'text',
            key: 'general.namingPattern',
            disabled: this.readOnly,
            validate: (value: string) => (value.trim() === '' ? 'The pattern cannot be empty.' : undefined),
          },
        },
        {
          name: 'Example name',
          render: (setting) => {
            const rendered = renderPattern(this.store.settings.general.namingPattern, { noteName: 'limits', now: new Date(), n: 1 });
            setting.setName('Example name');
            setting.setDesc(`${rendered.name}.png`);
          },
        },
        {
          name: 'When a name is already taken',
          desc: 'Applies to patterns without {n}. A pattern with {n} always takes the next free number.',
          control: {
            type: 'dropdown',
            key: 'general.conflict',
            disabled: this.readOnly,
            options: { 'auto-number': 'Add a number', ask: 'Ask me', cancel: 'Cancel the paste' },
          },
        },
        {
          type: 'group',
          heading: 'File types',
          items: [
            { name: 'Images', control: { type: 'toggle', key: 'general.fileType.image', disabled: this.readOnly } },
            { name: 'PDFs', control: { type: 'toggle', key: 'general.fileType.pdf', disabled: this.readOnly } },
          ],
        },
        {
          type: 'group',
          heading: 'Asset manager',
          items: [
            {
              name: 'Photo size',
              desc: 'The standard frame every image sits in. Each open page can change this for itself.',
              control: {
                type: 'dropdown',
                key: 'assets.frameSize',
                disabled: this.readOnly,
                options: { small: 'Small (160 × 107)', medium: 'Medium (240 × 160)', large: 'Large (360 × 240)' },
              },
            },
            {
              name: 'Default view',
              desc: 'How new asset manager pages start.',
              control: { type: 'dropdown', key: 'assets.defaultView', disabled: this.readOnly, options: { grid: 'Grid', list: 'List' } },
            },
          ],
        },
        this.thumbnailGroup(),
      ],
    };
    return page;
  }

  /** Dropdown choices, plus the current value when it was set by hand to something else. */
  private numberOptions(values: number[], current: number, unit: string): Record<string, string> {
    const all = [...new Set([...values, current])].sort((a, b) => a - b);
    return Object.fromEntries(all.map((value) => [String(value), `${value.toLocaleString('en-GB')} ${unit}`]));
  }

  private thumbnailGroup(): SettingDefinitionItem {
    const { thumbnails } = this.store.settings;
    return {
      type: 'group',
      heading: 'Thumbnails and performance',
      items: [
        {
          name: 'Use thumbnails',
          desc: 'Show small cached previews instead of loading every original. Your files are never changed or copied.',
          control: { type: 'toggle', key: 'thumbs.enabled', disabled: this.readOnly },
        },
        {
          name: 'Cache size limit',
          desc: 'The oldest previews are removed first when the cache grows past this.',
          control: {
            type: 'dropdown',
            key: 'thumbs.limitMb',
            disabled: this.readOnly,
            options: this.numberOptions([50, 100, 200, 500, 1000], thumbnails.limitMb, 'MB'),
          },
        },
        {
          name: 'Show originals below',
          desc: 'Images smaller than this are shown directly, because a preview would save nothing.',
          control: {
            type: 'dropdown',
            key: 'thumbs.directBelowKb',
            disabled: this.readOnly,
            options: this.numberOptions([0, 50, 100, 250, 500], thumbnails.directBelowKb, 'KB'),
          },
        },
        {
          name: 'Cache',
          render: (setting) => {
            const { count, bytes } = this.thumbnails.stats();
            setting.setName('Cache');
            setting.setDesc(count === 0 ? 'Empty.' : `${count.toLocaleString('en-GB')} previews, ${formatBytes(bytes)}.`);
          },
        },
        {
          name: 'Clear cache',
          desc: 'Deletes the previews only. They are made again when needed. Your files are never touched.',
          action: () => {
            void this.thumbnails.clear().then(() => this.update());
          },
        },
      ],
    };
  }

  private rulePage(rule: Rule, issues: Issue[]): SettingDefinitionPage {
    const own = issues.filter((issue) => issue.ruleId === rule.id);
    const page: PageWithId = {
      id: `rule:${rule.id}`, // pages are otherwise identified by name, and two rules can share a folder
      type: 'page',
      name: ruleLabel(rule),
      desc: ruleTargetText(rule),
      displayValue: badgesFor(rule).join(' · '),
      status: own.length > 0 ? 'warning' : null,
      items: ruleItems(this.formContext(), rule, own, {
        confirmDelete: () => void this.confirmDelete(rule, true),
        saveAsPreset: () => void this.saveRuleAsPreset(rule),
        applyPreset: () => void this.applyPresetToRule(rule),
        exportRule: () => new ExportModal(this.app, `Export ${ruleLabel(rule)}`, 'rule', exportRule(rule, new Date())).open(),
      }),
    };
    return page;
  }

  // ---- presets ----

  private presetPage(preset: Preset): SettingDefinitionPage {
    const page: PageWithId = {
      id: `preset:${preset.id}`,
      type: 'page',
      name: preset.name,
      desc: presetSummary(preset),
      items: presetItems(this.formContext(), preset, {
        applyToFolders: () => void this.applyPresetToFolders(preset),
        confirmDelete: () => void this.confirmDeletePreset(preset, true),
      }),
    };
    return page;
  }

  private addPreset(): void {
    const presets = this.store.settings.presets;
    this.apply({ ...this.store.settings, presets: [...presets, newPreset(presets)] });
  }

  private async confirmDeletePreset(preset: Preset | undefined, fromPage = false): Promise<void> {
    if (preset) {
      const confirmed = await new ConfirmModal(
        this.app,
        'Delete this preset?',
        `The preset "${preset.name}" will be removed. Folders that already received it keep their settings.`,
        'Delete preset',
      ).ask();
      if (confirmed) {
        this.apply({ ...this.store.settings, presets: deletePreset(this.store.settings.presets, preset.id) });
        if (fromPage) this.leavePage();
        return;
      }
    }
    this.update();
  }

  /** Keep a rule's naming, conflict, file type and scope settings as a preset. */
  private async saveRuleAsPreset(rule: Rule): Promise<void> {
    const name = await new PromptModal(this.app, {
      title: 'Save as a preset',
      label: 'Preset name',
      value: ruleLabel(rule),
      confirmLabel: 'Save preset',
      validate: (text) => (text.trim() === '' ? 'Give the preset a name.' : undefined),
    }).ask();
    if (name === null) return;
    const presets = this.store.settings.presets;
    const preset = presetFromRule(presets, rule, name);
    this.apply({ ...this.store.settings, presets: [...presets, preset] });
    new Notice(`Saved the preset "${preset.name}". Find it under Presets.`);
  }

  /** Give one rule a preset's values, after showing exactly what changes. */
  private async applyPresetToRule(rule: Rule): Promise<void> {
    const presets = this.store.settings.presets;
    if (presets.length === 0) {
      new Notice('There are no presets yet. Save one from a rule, or add one in the presets list.');
      return;
    }
    const preset = await new PresetPickModal(this.app, presets, `Apply which preset to ${ruleLabel(rule)}?`).pick();
    if (!preset) return;
    const { rule: next, changes } = applyPreset(rule, preset);
    if (changes.length === 0) {
      new Notice(`${ruleLabel(rule)} already matches "${preset.name}".`);
      return;
    }
    const confirmed = await new ConfirmModal(
      this.app,
      `Apply "${preset.name}"?`,
      `${changes.join('. ')}. The values are copied, so later edits to the preset will not change this folder.`,
      'Apply preset',
    ).ask();
    if (!confirmed) return;
    this.apply({ ...this.store.settings, rules: this.store.settings.rules.map((candidate) => (candidate.id === rule.id ? next : candidate)) });
  }

  /** Give a preset to several folders at once. */
  private async applyPresetToFolders(preset: Preset): Promise<void> {
    const ids = await new ApplyPresetModal(this.app, preset, this.store.settings.rules).ask();
    if (!ids || ids.size === 0) return;
    const { rules, applied } = applyPresetToRules(this.store.settings.rules, preset, ids);
    this.apply({ ...this.store.settings, rules });
    new Notice(`Applied "${preset.name}" to ${applied.length} ${applied.length === 1 ? 'folder' : 'folders'}.`);
  }

  // ---- import and export ----

  private importExportGroup(): SettingDefinitionItem {
    return {
      type: 'group',
      heading: 'Import and export',
      items: [
        {
          name: 'Export everything',
          desc: 'Folder rules, presets, saved views and settings as plain JSON.',
          action: () => new ExportModal(this.app, 'Export everything', 'all', exportAll(this.store.settings, new Date())).open(),
        },
        {
          name: 'Import…',
          desc: 'From a file in the vault or pasted text. You choose to merge or replace, and see what is in it first.',
          action: () => this.openImport(),
        },
      ],
    };
  }

  private openImport(): void {
    if (this.store.readOnly) {
      new Notice('These settings are from a newer version of this plugin, so nothing can be imported.');
      return;
    }
    new ImportModal(this.app, {
      merge: (parsed) => {
        const { settings, report } = mergeImport(this.store.settings, parsed);
        this.apply(settings);
        new Notice(describeMerge(report), 10_000);
      },
      replace: async (parsed) => {
        if (parsed.kind !== 'all') return false;
        const confirmed = await new ConfirmModal(
          this.app,
          'Replace everything?',
          'Your folder rules, presets, saved views and settings will be swapped for the imported ones. A backup copy of your current setup is saved first, and importing that backup undoes this.',
          'Back up and replace',
        ).ask();
        if (!confirmed) return false;
        const dir = this.plugin.manifest.dir;
        if (!dir) {
          new Notice('Cannot find the plugin folder to save a backup, so nothing was replaced.');
          return false;
        }
        const backup = normalizePath(`${dir}/${backupFileName(new Date())}`);
        try {
          await this.app.vault.adapter.write(backup, `${JSON.stringify(this.store.settings, null, 2)}\n`);
        } catch (error) {
          new Notice(`Could not save a backup, so nothing was replaced: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
        this.apply(parsed.settings);
        new Notice(`Replaced your setup. The backup is ${backup}.`, 10_000);
        return true;
      },
    }).open();
  }

  private addRule(): void {
    const rules = this.store.settings.rules;
    this.apply({ ...this.store.settings, rules: [...rules, newRule(rules)] });
  }

  /**
   * Obsidian has no API to leave a sub-page, so click its Back button. The class is internal: if it ever
   * changes, the user is left on an empty page with a working Back arrow, which is harmless.
   */
  private leavePage(): void {
    const doc = this.containerEl.ownerDocument;
    // Wait for the re-render triggered by the change, or it would replace the page again.
    doc.defaultView?.setTimeout(() => {
      doc.querySelector<HTMLElement>('.vertical-tab-content-container .setting-page-back-button')?.click();
    }, 50);
  }

  private async confirmDelete(rule: Rule | undefined, fromPage = false): Promise<void> {
    if (rule) {
      const confirmed = await new ConfirmModal(
        this.app,
        'Delete this rule?',
        `The rule for ${ruleLabel(rule)} will be removed. Files are never deleted.`,
        'Delete rule',
      ).ask();
      if (confirmed) {
        this.apply({ ...this.store.settings, rules: deleteRule(this.store.settings.rules, rule.id) });
        if (fromPage) this.leavePage();
        return;
      }
    }
    this.update(); // puts the list back as it was if the user cancelled
  }
}
