import { setIcon, type Setting } from 'obsidian';
import { normalisePath } from '../core/paths';
import { addScopeFolder, removeScopeFolder, updateRule } from '../core/ruleEdit';
import type { Scope } from '../core/types';
import { SubfolderSuggest } from '../obsidian/folderSuggest';
import type { RuleFormContext } from './ruleForm';

/** Whatever has a scope to edit: a folder rule or a preset. */
export interface ScopeTarget {
  /** The current scope, or undefined if the thing was deleted meanwhile. */
  current: () => Scope | undefined;
  save: (scope: Scope) => void;
  /** Folder the entries are relative to, for the picker. Null: there is no single folder (a preset). */
  base: string | null;
}

/** Removable folder chips plus a box to add one, for the exclude and include-only scopes. */
export function renderScopeEditor(ctx: RuleFormContext, setting: Setting, target: ScopeTarget): void {
  const scope = target.current();
  if (!scope || scope.mode === 'everything') return;

  const base = target.base === null ? null : normalisePath(target.base);
  const mode = scope.mode;
  setting.setName(mode === 'exclude' ? 'Excluded subfolders' : 'Included subfolders');
  setting.setDesc(
    base === null
      ? 'Folder names relative to each folder this is applied to. Type a name and press Enter.'
      : base === ''
        ? 'Folders in the vault. Pick one, or type a name and press Enter.'
        : `Subfolders of ${base}. Pick one, or type a name and press Enter.`,
  );
  setting.controlEl.addClass('foldwise-scope');

  const change = (edit: (scope: Scope) => Scope) => {
    const latest = target.current();
    if (!latest) return;
    const next = edit(latest);
    if (next !== latest) target.save(next);
  };

  const readOnly = ctx.readOnly();
  const chips = setting.controlEl.createDiv({ cls: 'foldwise-chips' });
  for (const folder of scope.folders) {
    const chip = chips.createDiv({ cls: 'foldwise-chip' });
    chip.createSpan({ text: folder });
    if (readOnly) continue;
    const remove = chip.createEl('button', { cls: 'foldwise-chip-remove clickable-icon', attr: { 'aria-label': `Remove ${folder}` } });
    setIcon(remove, 'x');
    remove.addEventListener('click', () => change((current) => removeScopeFolder(current, folder)));
  }

  if (readOnly) return;
  setting.addText((text) => {
    text.setPlaceholder('Add a subfolder');
    const add = (relative: string) => {
      text.setValue('');
      change((current) => addScopeFolder(current, relative));
    };
    if (base !== null) new SubfolderSuggest(ctx.app, text.inputEl, () => base, add);
    text.inputEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const typed = text.getValue().trim();
      if (typed !== '') add(typed);
    });
  });
}

/** The scope of one folder rule, saved back into the settings. */
export function ruleScopeTarget(ctx: RuleFormContext, ruleId: string): ScopeTarget {
  const find = () => ctx.store.settings.rules.find((candidate) => candidate.id === ruleId);
  return {
    current: () => find()?.scope,
    save: (scope) => ctx.apply({ ...ctx.store.settings, rules: updateRule(ctx.store.settings.rules, ruleId, { scope }) }),
    base: find()?.appliesTo ?? '',
  };
}

/** The scope of one preset. A preset has no folder of its own, so entries are typed, not picked. */
export function presetScopeTarget(ctx: RuleFormContext, presetId: string): ScopeTarget {
  const find = () => ctx.store.settings.presets.find((candidate) => candidate.id === presetId);
  return {
    current: () => find()?.scope ?? { mode: 'everything' },
    save: (scope) =>
      ctx.apply({
        ...ctx.store.settings,
        presets: ctx.store.settings.presets.map((preset) => (preset.id === presetId ? { ...preset, scope } : preset)),
      }),
    base: null,
  };
}
