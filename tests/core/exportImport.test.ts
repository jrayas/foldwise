import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, backupFileName, describeMerge, exportAll, exportFileName, exportRule, mergeImport, parseImport, type ParsedImport } from '../../src/core/exportImport';
import { normaliseSettings } from '../../src/core/settings';
import type { FoldwiseSettings, Preset, SavedView } from '../../src/core/types';
import { exampleRules, rule, settingsWith } from '../fixtures/exampleVault';

const now = new Date(2026, 9, 16, 9, 5, 7);
const preset = (id: string, name: string): Preset => ({ id, name, overrides: { conflict: 'ask' }, scope: { mode: 'everything' } });
const view = (id: string, name: string): SavedView => ({ id, name, filters: { parent: 'A', subfolder: '', kind: '', used: 'unused', sort: 'name', direction: 'asc' } });

const full = (): FoldwiseSettings => ({
  ...settingsWith(exampleRules),
  presets: [preset('p1', 'Subject')],
  views: [view('view-1', 'Spare')],
});

const ok = (parsed: ParsedImport): Extract<ParsedImport, { ok: true }> => {
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed;
};

describe('file names', () => {
  it('names exports and backups with the date', () => {
    expect(exportFileName('all', now)).toBe('foldwise-all-20261016.json');
    expect(exportFileName('rule', now)).toBe('foldwise-rule-20261016.json');
    expect(backupFileName(now)).toBe('data.backup-20261016-090507.json');
  });
});

describe('export and import round trip', () => {
  it('round-trips everything', () => {
    const settings = full();
    const parsed = ok(parseImport(exportAll(settings, now)));
    expect(parsed.kind).toBe('all');
    if (parsed.kind === 'all') {
      expect(parsed.settings).toEqual(normaliseSettings(settings).settings);
      expect(parsed.summary).toBe(`${settings.rules.length} folder rules, 1 preset, 1 saved view`);
    }
    expect(parsed.warnings).toEqual([]);
  });

  it('round-trips one rule', () => {
    const one = exampleRules[0];
    if (!one) throw new Error('fixture');
    const parsed = ok(parseImport(exportRule(one, now)));
    expect(parsed.kind).toBe('rule');
    if (parsed.kind === 'rule') expect(parsed.rule).toEqual(one);
  });

  it('writes a readable header', () => {
    const body = JSON.parse(exportAll(full(), now)) as Record<string, unknown>;
    expect(body).toMatchObject({ foldwise: 'foldwise-export', kind: 'all', schemaVersion: 1, exportedAt: now.toISOString() });
  });

  it('reads a bare settings file (a backup) with a note about the missing header', () => {
    const parsed = ok(parseImport(JSON.stringify(full())));
    expect(parsed.kind).toBe('all');
    expect(parsed.warnings.some((w) => w.includes('no export header'))).toBe(true);
  });
});

describe('refusing bad input', () => {
  const message = (text: string): string => {
    const parsed = parseImport(text);
    if (parsed.ok) throw new Error('should have been refused');
    return parsed.message;
  };

  it('refuses empty, non-JSON and non-object text', () => {
    expect(message('')).toContain('empty');
    expect(message('not json')).toContain('not valid JSON');
    expect(message('[1,2]')).toContain('does not look like');
    expect(message('"hi"')).toContain('does not look like');
    expect(message('{"hello":1}')).toContain('does not look like');
  });

  it('refuses a newer schema, for both an export and a bare file', () => {
    expect(message(JSON.stringify({ foldwise: 'foldwise-export', kind: 'all', schemaVersion: 99, data: {} }))).toContain('newer version');
    expect(message(JSON.stringify({ schemaVersion: 99, rules: [] }))).toContain('newer version');
  });

  it('refuses a huge file and an unknown export type', () => {
    expect(message('x'.repeat(MAX_IMPORT_BYTES + 1))).toContain('too large');
    expect(message(JSON.stringify({ foldwise: 'foldwise-export', kind: 'weird', data: {} }))).toContain('type');
  });

  it('refuses a rule export with no usable rule', () => {
    expect(message(JSON.stringify({ foldwise: 'foldwise-export', kind: 'rule', schemaVersion: 1, data: {} }))).toContain('no usable folder rule');
    expect(message(JSON.stringify({ foldwise: 'foldwise-export', kind: 'rule', schemaVersion: 1, data: { rule: { id: 'x' } } }))).toContain('no usable folder rule');
  });

  it('cleans up hostile content instead of trusting it', () => {
    const hostile = JSON.stringify({
      foldwise: 'foldwise-export', kind: 'all', schemaVersion: 1,
      data: {
        general: { conflict: 'run-this', namingPattern: 5 },
        rules: [{ id: '__proto__', appliesTo: '../../etc', saveTo: 'C:\\Windows', createIfMissing: 'yes', overrides: { fileTypes: ['exe'] } }, 'x', null],
        presets: [{ id: 'p', name: '<script>alert(1)</script>' }],
        views: [{ id: 'v', name: 'ok', filters: { parent: 5, kind: 'exe', used: 'maybe', sort: 'rm -rf', direction: 'up' } }],
      },
    });
    const parsed = ok(parseImport(hostile));
    expect(parsed.kind).toBe('all');
    if (parsed.kind !== 'all') return;
    expect(parsed.settings.general.conflict).toBe('auto-number');
    expect(parsed.settings.rules[0]?.overrides.fileTypes).toEqual([]);
    expect(parsed.settings.views[0]?.filters).toEqual({ parent: '', subfolder: '', kind: '', used: '', sort: 'modified', direction: 'desc' });
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('merge', () => {
  const imported = (settings: FoldwiseSettings) => ok(parseImport(exportAll(settings, now)));

  it('adds new rules, presets and views and keeps what is there', () => {
    const current = settingsWith([rule('a', 'Alpha', 'Alpha/Assets')]);
    const incoming = { ...settingsWith([rule('b', 'Beta', 'Beta/Assets')]), presets: [preset('p1', 'Subject')], views: [view('view-1', 'Spare')] };
    const { settings, report } = mergeImport(current, imported(incoming));
    expect(settings.rules.map((r) => r.id)).toEqual(['a', 'b']);
    expect(settings.presets.map((p) => p.name)).toEqual(['Subject']);
    expect(settings.views.map((v) => v.name)).toEqual(['Spare']);
    expect(report).toMatchObject({ presetsAdded: 1, viewsAdded: 1, rulesAdded: ['Beta'] });
    expect(settings.general).toBe(current.general);
  });

  it('skips a rule whose folder already has one, ignoring case, and says so', () => {
    const current = settingsWith([rule('a', 'Alpha', 'Alpha/Assets')]);
    const incoming = settingsWith([rule('x', 'alpha', 'Elsewhere')]);
    const { settings, report } = mergeImport(current, imported(incoming));
    expect(settings.rules).toHaveLength(1);
    expect(report.rulesSkipped).toEqual([{ label: 'alpha', reason: 'a rule for this folder already exists' }]);
    expect(describeMerge(report)).toContain('Skipped 1 rule');
  });

  it('renews ids that clash', () => {
    const current = settingsWith([rule('same', 'Alpha', 'A')]);
    const incoming = { ...settingsWith([rule('same', 'Beta', 'B')]), presets: [preset('p1', 'One')] };
    const withPreset = { ...current, presets: [preset('p1', 'Existing')] };
    const { settings } = mergeImport(withPreset, imported(incoming));
    expect(settings.rules.map((r) => r.id)).toEqual(['same', 'same-2']);
    expect(settings.presets.map((p) => p.id)).toEqual(['p1', 'p1-2']);
  });

  it('skips presets and views whose names are taken', () => {
    const current = { ...settingsWith([]), presets: [preset('p1', 'Subject')], views: [view('v1', 'Spare')] };
    const incoming = { ...settingsWith([]), presets: [preset('p9', 'subject')], views: [view('v9', 'SPARE')] };
    const { settings, report } = mergeImport(current, imported(incoming));
    expect(settings.presets).toHaveLength(1);
    expect(settings.views).toHaveLength(1);
    expect(report.presetsSkipped).toBe(1);
  });

  it('merges a single exported rule', () => {
    const one = rule('solo', 'Solo', 'Solo/Assets');
    const current = settingsWith([rule('a', 'Alpha', 'A')]);
    const { settings, report } = mergeImport(current, ok(parseImport(exportRule(one, now))));
    expect(settings.rules.map((r) => r.id)).toEqual(['a', 'solo']);
    expect(report.rulesAdded).toEqual(['Solo']);
  });

  it('never changes its inputs', () => {
    const current = settingsWith([rule('a', 'Alpha', 'A')]);
    const snapshot = JSON.stringify(current);
    mergeImport(current, imported(settingsWith([rule('b', 'Beta', 'B')])));
    expect(JSON.stringify(current)).toBe(snapshot);
  });

  it('describes a plain merge', () => {
    expect(describeMerge({ rulesAdded: ['A', 'B'], rulesSkipped: [], presetsAdded: 1, presetsSkipped: 0, viewsAdded: 2 })).toBe('Added 2 folder rules, 1 preset, 2 saved views.');
  });
});
