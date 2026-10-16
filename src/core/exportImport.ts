// Exporting and importing the setup, as plain JSON. Pure: no files are read or written here.
// Imported text is untrusted. It goes through the same lenient loader as saved settings, and the paths in it
// are only ever stored as rule folders, never used to read or write a file.
import { formatDate } from './naming';
import { samePath } from './paths';
import { ruleLabel } from './summary';
import { CURRENT_SCHEMA_VERSION, MAX_SAVED_VIEWS, normaliseSettings } from './settings';
import type { FoldwiseSettings, Preset, Rule, SavedView } from './types';

export const EXPORT_MARKER = 'foldwise-export';
/** Larger than any real setup; anything bigger is refused rather than parsed. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ExportKind = 'all' | 'rule';

export interface ExportEnvelope {
  foldwise: typeof EXPORT_MARKER;
  kind: ExportKind;
  schemaVersion: number;
  exportedAt: string;
  data: unknown;
}

function envelope(kind: ExportKind, data: unknown, now: Date): string {
  const body: ExportEnvelope = { foldwise: EXPORT_MARKER, kind, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: now.toISOString(), data };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Everything: General, folder rules, presets, saved views and the other settings. */
export function exportAll(settings: FoldwiseSettings, now: Date): string {
  return envelope('all', settings, now);
}

/** One folder rule. */
export function exportRule(rule: Rule, now: Date): string {
  return envelope('rule', { rule }, now);
}

export function exportFileName(kind: ExportKind, now: Date): string {
  return `foldwise-${kind === 'all' ? 'all' : 'rule'}-${formatDate(now, 'YYYYMMDD')}.json`;
}

/** Name for the copy of the current settings saved before a replace. Saved in the plugin's own folder. */
export function backupFileName(now: Date): string {
  return `data.backup-${formatDate(now, 'YYYYMMDD-HHmmss')}.json`;
}

export type ParsedImport =
  | { ok: false; message: string }
  | { ok: true; kind: 'all'; settings: FoldwiseSettings; warnings: string[]; summary: string }
  | { ok: true; kind: 'rule'; rule: Rule; warnings: string[]; summary: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * Read an export. Accepts the exported envelope, and also a bare settings file such as the backup made before
 * a replace, so a replace can be undone by importing that backup.
 */
export function parseImport(text: string): ParsedImport {
  if (text.trim() === '') return { ok: false, message: 'Nothing to import: the text is empty.' };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, message: 'That file is too large to be a Foldwise export.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That is not valid JSON, so it cannot be a Foldwise export.' };
  }
  if (!isRecord(raw)) return { ok: false, message: 'That does not look like a Foldwise export.' };

  const marked = raw.foldwise === EXPORT_MARKER;
  const warnings: string[] = [];
  const version = raw.schemaVersion;
  if (typeof version === 'number' && version > CURRENT_SCHEMA_VERSION) {
    return { ok: false, message: `This was made by a newer version of Foldwise (schema ${version}) and cannot be imported here.` };
  }

  if (marked && raw.kind === 'rule') {
    const data = isRecord(raw.data) ? raw.data : {};
    const loaded = normaliseSettings({ schemaVersion: version, rules: [data.rule] });
    const rule = loaded.settings.rules[0];
    if (!rule) return { ok: false, message: 'There is no usable folder rule in that export.' };
    return { ok: true, kind: 'rule', rule, warnings: loaded.warnings, summary: `1 folder rule (${ruleLabel(rule)})` };
  }

  let data: unknown = raw;
  if (marked) {
    if (raw.kind !== 'all') return { ok: false, message: 'That export has a type this version does not know.' };
    data = raw.data;
  } else if (!Array.isArray(raw.rules) && !isRecord(raw.general)) {
    return { ok: false, message: 'That does not look like a Foldwise export.' };
  } else {
    warnings.push('This file has no export header, so it was read as a full settings file.');
  }
  if (!isRecord(data)) return { ok: false, message: 'The export has no settings in it.' };

  const loaded = normaliseSettings({ ...data, schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : version });
  const s = loaded.settings;
  return {
    ok: true,
    kind: 'all',
    settings: s,
    warnings: [...warnings, ...loaded.warnings],
    summary: `${count(s.rules.length, 'folder rule')}, ${count(s.presets.length, 'preset')}, ${count(s.views.length, 'saved view')}`,
  };
}

export interface MergeReport {
  rulesAdded: string[];
  rulesSkipped: Array<{ label: string; reason: string }>;
  presetsAdded: number;
  presetsSkipped: number;
  viewsAdded: number;
}

function freeId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Add what was imported to what is already there. Nothing existing is changed or removed: a rule for a folder
 * that already has one is skipped (and listed), presets and views whose names are taken are skipped, and ids
 * are renewed on a clash. General and the other settings stay as they are.
 */
export function mergeImport(current: FoldwiseSettings, imported: Extract<ParsedImport, { ok: true }>): { settings: FoldwiseSettings; report: MergeReport } {
  const report: MergeReport = { rulesAdded: [], rulesSkipped: [], presetsAdded: 0, presetsSkipped: 0, viewsAdded: 0 };
  const rules = [...current.rules];
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const incomingRules = imported.kind === 'rule' ? [imported.rule] : imported.settings.rules;
  for (const rule of incomingRules) {
    if (rules.some((existing) => samePath(existing.appliesTo, rule.appliesTo))) {
      report.rulesSkipped.push({ label: ruleLabel(rule), reason: 'a rule for this folder already exists' });
      continue;
    }
    const id = freeId(rule.id, ruleIds);
    ruleIds.add(id);
    rules.push({ ...structuredClone(rule), id });
    report.rulesAdded.push(ruleLabel(rule));
  }

  const presets: Preset[] = [...current.presets];
  const views: SavedView[] = [...current.views];
  if (imported.kind === 'all') {
    const presetIds = new Set(presets.map((preset) => preset.id));
    for (const preset of imported.settings.presets) {
      if (presets.some((existing) => existing.name.toLowerCase() === preset.name.toLowerCase())) {
        report.presetsSkipped++;
        continue;
      }
      const id = freeId(preset.id, presetIds);
      presetIds.add(id);
      presets.push({ ...structuredClone(preset), id });
      report.presetsAdded++;
    }
    const viewIds = new Set(views.map((view) => view.id));
    for (const view of imported.settings.views) {
      if (views.length >= MAX_SAVED_VIEWS || views.some((existing) => existing.name.toLowerCase() === view.name.toLowerCase())) continue;
      const id = freeId(view.id, viewIds);
      viewIds.add(id);
      views.push({ ...structuredClone(view), id });
      report.viewsAdded++;
    }
  }
  return { settings: { ...current, rules, presets, views }, report };
}

/** Plain-English result of a merge. */
export function describeMerge(report: MergeReport): string {
  const parts = [`Added ${count(report.rulesAdded.length, 'folder rule')}`];
  if (report.presetsAdded > 0) parts.push(count(report.presetsAdded, 'preset'));
  if (report.viewsAdded > 0) parts.push(count(report.viewsAdded, 'saved view'));
  let text = `${parts.join(', ')}.`;
  if (report.rulesSkipped.length > 0) {
    text += ` Skipped ${count(report.rulesSkipped.length, 'rule')}: ${report.rulesSkipped.map((skip) => `${skip.label} (${skip.reason})`).join('; ')}.`;
  }
  if (report.presetsSkipped > 0) text += ` Skipped ${count(report.presetsSkipped, 'preset')} whose names were already used.`;
  return text;
}
