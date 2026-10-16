// Presets: a saved bundle of naming, conflict, file-type and scope settings. Applying one COPIES the values
// into a folder rule (decision 3). Later edits to the preset never change folders already given it. Pure.
import { normalisePath } from './paths';
import { ruleLabel } from './summary';
import type { Overrides, Preset, Rule, Scope } from './types';

const lower = (text: string): string => text.toLowerCase();

/** A name not yet used by another preset (ignoring case): "Books", then "Books 2", "Books 3". */
export function uniquePresetName(presets: readonly Preset[], wanted: string, ignoreId?: string): string {
  const base = wanted.trim() === '' ? 'New preset' : wanted.trim();
  const taken = new Set(presets.filter((preset) => preset.id !== ignoreId).map((preset) => lower(preset.name)));
  if (!taken.has(lower(base))) return base;
  let n = 2;
  while (taken.has(lower(`${base} ${n}`))) n++;
  return `${base} ${n}`;
}

function freeId(presets: readonly Preset[]): string {
  const used = new Set(presets.map((preset) => preset.id));
  let n = 1;
  while (used.has(`preset-${n}`)) n++;
  return `preset-${n}`;
}

/** A blank preset: everything inherited from General, scope "everything". */
export function newPreset(presets: readonly Preset[], name = 'New preset'): Preset {
  return { id: freeId(presets), name: uniquePresetName(presets, name), overrides: {}, scope: { mode: 'everything' } };
}

/** Snapshot a rule's naming, conflict, file types and scope. Its folders are not part of a preset. */
export function presetFromRule(presets: readonly Preset[], rule: Rule, name: string): Preset {
  return {
    id: freeId(presets),
    name: uniquePresetName(presets, name),
    overrides: structuredClone(rule.overrides),
    scope: structuredClone(rule.scope),
  };
}

export function updatePreset(presets: readonly Preset[], id: string, patch: Partial<Omit<Preset, 'id'>>): Preset[] {
  return presets.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset));
}

export function deletePreset(presets: readonly Preset[], id: string): Preset[] {
  return presets.filter((preset) => preset.id !== id);
}

function describeScope(scope: Scope): string {
  if (scope.mode === 'everything') return 'Everything';
  const folders = scope.folders.map(normalisePath).join(', ') || 'no folders';
  return `${scope.mode === 'exclude' ? 'Exclude' : 'Only'} ${folders}`;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What changes for a rule when it goes from `before` to `after`, in plain English. Empty when nothing does. */
export function describeChanges(before: Rule, after: Rule): string[] {
  const changes: string[] = [];
  const orGeneral = (value: string | undefined): string => value ?? 'General';
  const kinds = (rule: Rule): string => (rule.overrides.fileTypes ? rule.overrides.fileTypes.join(' and ') || 'none' : 'General');

  if (before.overrides.namingPattern !== after.overrides.namingPattern) {
    changes.push(`Naming pattern: ${orGeneral(before.overrides.namingPattern)} → ${orGeneral(after.overrides.namingPattern)}`);
  }
  if (before.overrides.conflict !== after.overrides.conflict) {
    changes.push(`Name conflicts: ${orGeneral(before.overrides.conflict)} → ${orGeneral(after.overrides.conflict)}`);
  }
  if (!sameJson(before.overrides.fileTypes, after.overrides.fileTypes)) changes.push(`File types: ${kinds(before)} → ${kinds(after)}`);
  if (before.overrides.subSort !== after.overrides.subSort) {
    changes.push(`Sub-sort: ${orGeneral(before.overrides.subSort)} → ${orGeneral(after.overrides.subSort)}`);
  }
  if (!sameJson(before.scope, after.scope)) changes.push(`Scope: ${describeScope(before.scope)} → ${describeScope(after.scope)}`);
  return changes;
}

/**
 * Give a rule the preset's values. The rule's overrides become exactly the preset's (anything the preset does
 * not set goes back to "inherit from General"), and its scope too when the preset has one. Folders, enabled
 * and the rule's id are untouched.
 */
export function applyPreset(rule: Rule, preset: Preset): { rule: Rule; changes: string[] } {
  const overrides: Overrides = structuredClone(preset.overrides);
  const next: Rule = { ...rule, overrides, scope: preset.scope ? structuredClone(preset.scope) : rule.scope };
  return { rule: next, changes: describeChanges(rule, next) };
}

export interface AppliedRule {
  id: string;
  label: string;
  changes: string[];
}

/** Apply a preset to several rules at once. Returns the new rule list and what changed in each chosen rule. */
export function applyPresetToRules(rules: readonly Rule[], preset: Preset, ids: ReadonlySet<string>): { rules: Rule[]; applied: AppliedRule[] } {
  const applied: AppliedRule[] = [];
  const next = rules.map((rule) => {
    if (!ids.has(rule.id)) return rule;
    const result = applyPreset(rule, preset);
    applied.push({ id: rule.id, label: ruleLabel(rule), changes: result.changes });
    return result.rule;
  });
  return { rules: next, applied };
}

/** One line for the Presets list. */
export function presetSummary(preset: Preset): string {
  const parts: string[] = [];
  if (preset.overrides.namingPattern) parts.push(`naming ${preset.overrides.namingPattern}`);
  if (preset.overrides.conflict) parts.push(`conflicts: ${preset.overrides.conflict}`);
  if (preset.overrides.fileTypes) parts.push(`types: ${preset.overrides.fileTypes.join(', ') || 'none'}`);
  if (preset.scope && preset.scope.mode !== 'everything') {
    const scope = describeScope(preset.scope);
    parts.push(`${scope.charAt(0).toLowerCase()}${scope.slice(1)}`);
  }
  return parts.length === 0 ? 'Uses the General settings' : parts.join(' · ');
}
