import { describe, expect, it } from 'vitest';
import { defaultSettings, normaliseSettings } from '../../src/core/settings';
import { DEFAULT_SETTINGS, type FoldwiseSettings } from '../../src/core/types';
import { exampleRules, rule } from '../fixtures/exampleVault';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const full: FoldwiseSettings = {
  schemaVersion: 1,
  general: {
    fallback: { mode: 'folder', path: 'Inbox/Files' },
    namingPattern: '{note}-{n}',
    conflict: 'ask',
    fileTypes: ['image'],
  },
  assetManager: { frameSize: 'large', defaultView: 'list', recentFolders: ['Physics/Assets', 'Inbox'] },
  thumbnails: { enabled: false, limitMb: 500, directBelowKb: 250 },
  views: [{ id: 'view-1', name: 'Unused maths', filters: { parent: 'Mathematics', subfolder: 'Assets', kind: 'image', used: 'unused', sort: 'name', direction: 'asc' } }],
  rules: [
    ...exampleRules,
    {
      ...rule('inc', 'Misc', 'Misc/Assets', { scope: { mode: 'include', folders: ['A', 'B/C'] }, enabled: false }),
      createIfMissing: false,
      overrides: { namingPattern: 'x-{n}', conflict: 'cancel', fileTypes: ['pdf'], subSort: 'date' },
      group: 'Subjects',
    },
  ],
  presets: [
    { id: 'p1', name: 'Subject folder', overrides: { conflict: 'ask' }, scope: { mode: 'exclude', folders: ['Books'] } },
    { id: 'p2', name: 'Plain', overrides: {} },
  ],
};

describe('first run and unreadable data', () => {
  it.each([[null], [undefined]])('uses the defaults silently for %s', (raw) => {
    const result = normaliseSettings(raw);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.warnings).toEqual([]);
    expect(result.fromFutureVersion).toBe(false);
  });

  it.each([['text'], [42], [['a']], [true]])('uses the defaults and warns for %j', (raw) => {
    const result = normaliseSettings(raw);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.warnings).toEqual([expect.stringContaining('not readable')]);
  });

  it('treats an empty object as defaults without warnings', () => {
    const result = normaliseSettings({});
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.warnings).toEqual([]);
  });
});

describe('valid settings', () => {
  it('round-trips unchanged', () => {
    const result = normaliseSettings(structuredClone(full));
    expect(result.warnings).toEqual([]);
    expect(result.settings).toEqual(full);
  });

  it('is idempotent', () => {
    const once = normaliseSettings(structuredClone(full)).settings;
    expect(normaliseSettings(structuredClone(once)).settings).toEqual(once);
  });

  it('fills missing General values from the defaults', () => {
    const result = normaliseSettings({ general: { conflict: 'ask' } });
    expect(result.settings.general).toEqual({ ...DEFAULT_SETTINGS.general, conflict: 'ask' });
    expect(result.warnings).toEqual([]);
  });

  it('does not change its input and returns fresh objects', () => {
    const input = deepFreeze(structuredClone(full));
    expect(() => normaliseSettings(input)).not.toThrow();

    normaliseSettings(undefined).settings.rules.push(rule('x', 'X', 'Y'));
    expect(normaliseSettings(undefined).settings.rules).toEqual([]);
    expect(DEFAULT_SETTINGS.rules).toEqual([]);
    expect(defaultSettings()).not.toBe(DEFAULT_SETTINGS);
  });
});

describe('General', () => {
  it('replaces invalid values with the defaults and warns about each', () => {
    const result = normaliseSettings({
      general: { conflict: 'banana', namingPattern: 42, fallback: { mode: 'folder' }, fileTypes: 'image' },
    });
    expect(result.settings.general).toEqual(DEFAULT_SETTINGS.general);
    expect(result.warnings).toHaveLength(4);
  });

  it('keeps known file types, drops unknown ones and warns', () => {
    const result = normaliseSettings({ general: { fileTypes: ['image', 'audio', 'image', 'pdf'] } });
    expect(result.settings.general.fileTypes).toEqual(['image', 'pdf']);
    expect(result.warnings).toEqual([expect.stringContaining('audio')]);
  });

  it('accepts an empty file type list (handle nothing)', () => {
    expect(normaliseSettings({ general: { fileTypes: [] } }).settings.general.fileTypes).toEqual([]);
  });

  it('normalises the fallback folder path', () => {
    const result = normaliseSettings({ general: { fallback: { mode: 'folder', path: '/Inbox\\Files/' } } });
    expect(result.settings.general.fallback).toEqual({ mode: 'folder', path: 'Inbox/Files' });
  });

  it('keeps a fixed fallback with no folder chosen yet, without a warning (validation flags it)', () => {
    for (const path of ['', ' / ']) {
      const result = normaliseSettings({ general: { fallback: { mode: 'folder', path } } });
      expect(result.settings.general.fallback).toEqual({ mode: 'folder', path: path === '' ? '' : ' / ' });
      expect(result.warnings).toEqual([]);
    }
  });

  it('warns when General is not an object', () => {
    const result = normaliseSettings({ general: 'oops' });
    expect(result.settings.general).toEqual(DEFAULT_SETTINGS.general);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('Asset manager settings', () => {
  it('defaults to the medium frame and the grid', () => {
    expect(normaliseSettings({}).settings.assetManager).toEqual({ frameSize: 'medium', defaultView: 'grid', recentFolders: [] });
  });

  it('keeps valid values', () => {
    const result = normaliseSettings({ assetManager: { frameSize: 'small', defaultView: 'list' } });
    expect(result.settings.assetManager).toEqual({ frameSize: 'small', defaultView: 'list', recentFolders: [] });
    expect(result.warnings).toEqual([]);
  });

  it('replaces invalid values with the defaults and warns about each', () => {
    const result = normaliseSettings({ assetManager: { frameSize: 'huge', defaultView: 'carousel' } });
    expect(result.settings.assetManager).toEqual({ frameSize: 'medium', defaultView: 'grid', recentFolders: [] });
    expect(result.warnings).toHaveLength(2);
  });

  it('warns when the section is not an object', () => {
    const result = normaliseSettings({ assetManager: 'oops' });
    expect(result.settings.assetManager).toEqual({ frameSize: 'medium', defaultView: 'grid', recentFolders: [] });
    expect(result.warnings).toHaveLength(1);
  });

  it('loads settings saved before the section existed without a warning', () => {
    const { assetManager: _unused, ...older } = full;
    const result = normaliseSettings(older);
    expect(result.settings.assetManager).toEqual({ frameSize: 'medium', defaultView: 'grid', recentFolders: [] });
    expect(result.warnings).toEqual([]);
  });
});

describe('recent folders', () => {
  it('keeps a valid list, newest first, without duplicates ignoring case', () => {
    const result = normaliseSettings({ assetManager: { recentFolders: ['A/B', 'C', 'a/b', '/D/'] } });
    expect(result.settings.assetManager.recentFolders).toEqual(['A/B', 'C', 'D']);
    expect(result.warnings).toEqual([]);
  });

  it('keeps at most eight and drops entries that are not text', () => {
    const many = Array.from({ length: 12 }, (_, i) => `F${i}`);
    const result = normaliseSettings({ assetManager: { recentFolders: [...many, 5, null] } });
    expect(result.settings.assetManager.recentFolders).toEqual(many.slice(0, 8));
  });

  it('clears a value that is not a list and warns', () => {
    const result = normaliseSettings({ assetManager: { recentFolders: 'Inbox' } });
    expect(result.settings.assetManager.recentFolders).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('Thumbnail settings', () => {
  it('defaults to on, 200 MB and 100 KB', () => {
    expect(normaliseSettings({}).settings.thumbnails).toEqual({ enabled: true, limitMb: 200, directBelowKb: 100 });
  });

  it('keeps valid values, rounding to whole numbers', () => {
    const result = normaliseSettings({ thumbnails: { enabled: false, limitMb: 499.6, directBelowKb: 0 } });
    expect(result.settings.thumbnails).toEqual({ enabled: false, limitMb: 500, directBelowKb: 0 });
    expect(result.warnings).toEqual([]);
  });

  it('replaces out-of-range or wrong-type values and warns about each', () => {
    const result = normaliseSettings({ thumbnails: { enabled: 'yes', limitMb: 1, directBelowKb: -5 } });
    expect(result.settings.thumbnails).toEqual({ enabled: true, limitMb: 200, directBelowKb: 100 });
    expect(result.warnings).toHaveLength(3);
  });

  it('warns when the section is not an object', () => {
    const result = normaliseSettings({ thumbnails: [] });
    expect(result.settings.thumbnails).toEqual({ enabled: true, limitMb: 200, directBelowKb: 100 });
    expect(result.warnings).toHaveLength(1);
  });

  it('loads older settings without the section silently', () => {
    const { thumbnails: _unused, ...older } = full;
    expect(normaliseSettings(older).warnings).toEqual([]);
  });
});

describe('rules', () => {
  it('normalises folder paths and applies defaults', () => {
    const result = normaliseSettings({
      rules: [{ id: 'a', appliesTo: '/Physics/', saveTo: 'Physics\\Assets' }],
    });
    expect(result.settings.rules).toEqual([
      { id: 'a', enabled: true, appliesTo: 'Physics', saveTo: 'Physics/Assets', createIfMissing: true, scope: { mode: 'everything' }, overrides: {} },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('drops rules that cannot work and says which', () => {
    const result = normaliseSettings({
      rules: [
        { id: 'ok', appliesTo: 'A', saveTo: 'B' },
        { appliesTo: 'A', saveTo: 'B' },
        { id: '', appliesTo: 'A', saveTo: 'B' },
        { id: 'no-applies', saveTo: 'B' },
        { id: 'no-save', appliesTo: 'A' },
        'text',
        null,
      ],
    });
    expect(result.settings.rules.map((r) => r.id)).toEqual(['ok']);
    expect(result.warnings).toHaveLength(6);
    expect(result.warnings[0]).toContain('Rule 2');
  });

  it('allows a vault-root folder on either side', () => {
    const result = normaliseSettings({ rules: [{ id: 'r', appliesTo: '', saveTo: '' }] });
    expect(result.settings.rules).toHaveLength(1);
  });

  it('renames a duplicate id rather than losing the rule', () => {
    const result = normaliseSettings({
      rules: [
        { id: 'x', appliesTo: 'A', saveTo: 'A1' },
        { id: 'x', appliesTo: 'B', saveTo: 'B1' },
        { id: 'x', appliesTo: 'C', saveTo: 'C1' },
        { id: 'x-2', appliesTo: 'D', saveTo: 'D1' },
      ],
    });
    expect(result.settings.rules.map((r) => r.id)).toEqual(['x', 'x-2', 'x-3', 'x-2-2']);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns when rules is not a list', () => {
    const result = normaliseSettings({ rules: { id: 'a' } });
    expect(result.settings.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('resets an invalid scope to everything and warns', () => {
    const result = normaliseSettings({
      rules: [
        { id: 'a', appliesTo: 'A', saveTo: 'B', scope: { mode: 'sideways' } },
        { id: 'b', appliesTo: 'A', saveTo: 'B', scope: { mode: 'exclude' } },
        { id: 'c', appliesTo: 'A', saveTo: 'B', scope: 'all' },
      ],
    });
    for (const r of result.settings.rules) expect(r.scope).toEqual({ mode: 'everything' });
    expect(result.warnings).toHaveLength(3);
  });

  it('cleans scope folder lists', () => {
    const result = normaliseSettings({
      rules: [{ id: 'a', appliesTo: 'A', saveTo: 'B', scope: { mode: 'exclude', folders: ['/Books/', 7, 'Books', 'X\\Y'] } }],
    });
    expect(result.settings.rules[0]?.scope).toEqual({ mode: 'exclude', folders: ['Books', 'X/Y'] });
    expect(result.warnings).toHaveLength(1);
  });

  it('keeps valid overrides and drops invalid ones', () => {
    const result = normaliseSettings({
      rules: [{
        id: 'a', appliesTo: 'A', saveTo: 'B',
        overrides: { namingPattern: '{note}-{n}', conflict: 'nope', fileTypes: ['pdf', 'zip'], subSort: 'type', extra: 1 },
      }],
    });
    expect(result.settings.rules[0]?.overrides).toEqual({ namingPattern: '{note}-{n}', fileTypes: ['pdf'], subSort: 'type' });
    expect(result.warnings).toHaveLength(2);
  });

  it('keeps enabled and createIfMissing only when they are booleans', () => {
    const result = normaliseSettings({
      rules: [{ id: 'a', appliesTo: 'A', saveTo: 'B', enabled: false, createIfMissing: 'no' }],
    });
    expect(result.settings.rules[0]).toMatchObject({ enabled: false, createIfMissing: true });
    expect(result.warnings).toHaveLength(1);
  });
});

describe('presets', () => {
  it('keeps valid presets and drops invalid ones', () => {
    const result = normaliseSettings({
      presets: [
        { id: 'p', name: 'Good', overrides: { conflict: 'cancel' }, scope: { mode: 'include', folders: ['A'] } },
        { id: 'q', overrides: {} },
        { name: 'No id' },
        7,
      ],
    });
    expect(result.settings.presets).toEqual([
      { id: 'p', name: 'Good', overrides: { conflict: 'cancel' }, scope: { mode: 'include', folders: ['A'] } },
    ]);
    expect(result.warnings).toHaveLength(3);
  });
});

describe('schema version and migration', () => {
  it('flags settings from a newer version, loads what it can, and says so', () => {
    const result = normaliseSettings({ schemaVersion: 2, general: { conflict: 'ask' }, futureThing: true });
    expect(result.fromFutureVersion).toBe(true);
    expect(result.settings.general.conflict).toBe('ask');
    expect(result.warnings).toEqual([expect.stringContaining('newer version')]);
  });

  it('assumes version 1 when the version is invalid, with a warning', () => {
    const result = normaliseSettings({ schemaVersion: 'one' });
    expect(result.fromFutureVersion).toBe(false);
    expect(result.warnings).toEqual([expect.stringContaining('schema version')]);
  });

  it('runs migration steps in order from the saved version', () => {
    const calls: number[] = [];
    const result = normaliseSettings(
      { schemaVersion: 0, general: { namingPattern: 'old' } },
      {
        0: (data) => {
          calls.push(0);
          return { ...data, general: { namingPattern: 'migrated-{n}' } };
        },
      },
    );
    expect(calls).toEqual([0]);
    expect(result.settings.general.namingPattern).toBe('migrated-{n}');
    expect(result.settings.schemaVersion).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('warns and loads best-effort when no migration exists for an old version', () => {
    const result = normaliseSettings({ schemaVersion: 0, general: { conflict: 'ask' } }, {});
    expect(result.settings.general.conflict).toBe('ask');
    expect(result.warnings).toEqual([expect.stringContaining('No migration')]);
  });

  it('gives migration steps a copy, so the original is never changed', () => {
    const input = { schemaVersion: 0, general: { conflict: 'ask' } };
    normaliseSettings(input, { 0: (data) => { (data.general as Record<string, unknown>).conflict = 'cancel'; return data; } });
    expect(input.general.conflict).toBe('ask');
  });
});
