import { describe, expect, it } from 'vitest';
import { previewBulkRename, renderBulkName, type BulkItem } from '../../src/core/bulkRename';
import { conflictModeFor } from '../../src/core/conflictMode';
import { pushRecent } from '../../src/core/recentFolders';
import { baseFromTyped, checkBaseName, nextFreePath, planMove, planRename, splitName } from '../../src/core/renamePlan';
import { UsageMap, usageText } from '../../src/core/usage';
import { rule, settingsWith } from '../fixtures/exampleVault';

/** A vault that knows these paths, ignoring case like Mac and Windows. */
const vaultWith = (...paths: string[]) => {
  const set = new Set(paths.map((p) => p.toLowerCase()));
  return (path: string) => set.has(path.toLowerCase());
};

describe('splitName', () => {
  it('splits at the last dot and keeps a leading dot in the name', () => {
    expect(splitName('a.b.png')).toEqual({ base: 'a.b', ext: 'png' });
    expect(splitName('noext')).toEqual({ base: 'noext', ext: '' });
    expect(splitName('.hidden')).toEqual({ base: '.hidden', ext: '' });
  });
});

describe('checkBaseName', () => {
  it('accepts ordinary names, including spaces and unicode', () => {
    expect(checkBaseName('  limits graph 2  ')).toEqual({ ok: true, base: 'limits graph 2' });
    expect(checkBaseName('diagrama-é')).toEqual({ ok: true, base: 'diagrama-é' });
  });

  it('rejects empty names, naming the problem', () => {
    expect(checkBaseName('   ')).toMatchObject({ ok: false });
  });

  it('rejects characters that break Windows or Obsidian links, and lists them', () => {
    const result = checkBaseName('a/b:c#d');
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.message).toContain('/');
    expect(result.ok ? '' : result.message).toContain('#');
    expect(checkBaseName('x[1]')).toMatchObject({ ok: false });
    expect(checkBaseName('x^y')).toMatchObject({ ok: false });
  });

  it('rejects leading or trailing dots, reserved Windows names, control characters and very long names', () => {
    expect(checkBaseName('.hidden')).toMatchObject({ ok: false });
    expect(checkBaseName('name.')).toMatchObject({ ok: false });
    expect(checkBaseName('CON')).toMatchObject({ ok: false });
    expect(checkBaseName('lpt1')).toMatchObject({ ok: false });
    expect(checkBaseName('bad\u0007name')).toMatchObject({ ok: false });
    expect(checkBaseName('x'.repeat(201))).toMatchObject({ ok: false });
    expect(checkBaseName('x'.repeat(200))).toMatchObject({ ok: true });
    expect(checkBaseName('console')).toMatchObject({ ok: true });
  });
});

describe('baseFromTyped', () => {
  it('ignores the same extension, in any case', () => {
    expect(baseFromTyped('graph.png', 'png')).toEqual({ ok: true, base: 'graph' });
    expect(baseFromTyped('graph.PNG', 'png')).toEqual({ ok: true, base: 'graph' });
  });

  it('refuses to change the extension to another recognised one', () => {
    expect(baseFromTyped('graph.jpg', 'png')).toMatchObject({ ok: false });
    expect(baseFromTyped('graph.pdf', 'png')).toMatchObject({ ok: false });
  });

  it('treats an unknown ending as part of the name', () => {
    expect(baseFromTyped('v1.2', 'png')).toEqual({ ok: true, base: 'v1.2' });
  });
});

describe('planRename', () => {
  const path = 'Mathematics/Assets/limits.png';
  const request = (typed: string, extra: Partial<Parameters<typeof planRename>[0]> = {}) =>
    planRename({ path, typed, mode: 'auto-number', exists: vaultWith(path), ...extra });

  it('does nothing when the name is unchanged', () => {
    expect(request('limits')).toEqual({ kind: 'unchanged' });
    expect(request('limits.png')).toEqual({ kind: 'unchanged' });
  });

  it('renames within the same folder, keeping the extension', () => {
    expect(request('derivative')).toEqual({ kind: 'free', newPath: 'Mathematics/Assets/derivative.png', caseOnly: false });
  });

  it('reports a problem with the name without planning anything', () => {
    expect(request('a/b')).toMatchObject({ kind: 'invalid' });
    expect(request('')).toMatchObject({ kind: 'invalid' });
  });

  it('spots a rename that only changes capitals', () => {
    expect(request('Limits')).toEqual({ kind: 'free', newPath: 'Mathematics/Assets/Limits.png', caseOnly: true });
  });

  it('numbers a taken name in auto-number mode', () => {
    const exists = vaultWith(path, 'Mathematics/Assets/taken.png', 'Mathematics/Assets/taken-2.png');
    expect(request('taken', { exists })).toEqual({ kind: 'free', newPath: 'Mathematics/Assets/taken-3.png', caseOnly: false });
  });

  it('treats a name that differs only in case from another file as taken', () => {
    const exists = vaultWith(path, 'Mathematics/Assets/Taken.png');
    expect(request('taken', { exists })).toMatchObject({ kind: 'free', newPath: 'Mathematics/Assets/taken-2.png' });
  });

  it('asks in ask mode, with a suggestion', () => {
    const exists = vaultWith(path, 'Mathematics/Assets/taken.png');
    expect(request('taken', { exists, mode: 'ask' })).toEqual({
      kind: 'conflict',
      conflictWith: 'Mathematics/Assets/taken.png',
      suggestedPath: 'Mathematics/Assets/taken-2.png',
    });
  });

  it('cancels in cancel mode and never overwrites', () => {
    const exists = vaultWith(path, 'Mathematics/Assets/taken.png');
    expect(request('taken', { exists, mode: 'cancel' })).toMatchObject({ kind: 'cancelled' });
  });

  it('works for a file in the vault root and for a name with no extension', () => {
    expect(planRename({ path: 'root.png', typed: 'moved', mode: 'cancel', exists: vaultWith('root.png') })).toEqual({
      kind: 'free', newPath: 'moved.png', caseOnly: false,
    });
    expect(planRename({ path: 'A/readme', typed: 'notes', mode: 'cancel', exists: vaultWith('A/readme') })).toEqual({
      kind: 'free', newPath: 'A/notes', caseOnly: false,
    });
  });
});

describe('nextFreePath', () => {
  it('starts at -2 and gives up rather than loop for ever', () => {
    expect(nextFreePath('A', 'x', 'png', vaultWith('A/x-2.png'))).toBe('A/x-3.png');
    expect(nextFreePath('A', 'x', 'png', () => true)).toBeNull();
  });
});

describe('planMove', () => {
  const path = 'Physics/Assets/ramp.png';
  const move = (destination: string, onClash: 'ask' | 'number' = 'ask', extra: string[] = []) =>
    planMove({ path, destination, onClash, exists: vaultWith(path, ...extra) });

  it('moves to another folder, keeping the name', () => {
    expect(move('Engineering/Assets')).toEqual({ kind: 'free', newPath: 'Engineering/Assets/ramp.png' });
  });

  it('moves to the vault root', () => {
    expect(move('')).toEqual({ kind: 'free', newPath: 'ramp.png' });
  });

  it('does nothing when the file is already there, ignoring case', () => {
    expect(move('Physics/Assets')).toEqual({ kind: 'unchanged' });
    expect(move('physics/assets')).toEqual({ kind: 'unchanged' });
  });

  it('asks about a clash, suggesting a free name', () => {
    expect(move('Engineering/Assets', 'ask', ['Engineering/Assets/ramp.png'])).toEqual({
      kind: 'conflict',
      conflictWith: 'Engineering/Assets/ramp.png',
      suggestedPath: 'Engineering/Assets/ramp-2.png',
    });
  });

  it('numbers a clash quietly for bulk moves', () => {
    expect(move('Engineering/Assets', 'number', ['Engineering/Assets/ramp.png', 'Engineering/Assets/ramp-2.png'])).toEqual({
      kind: 'free',
      newPath: 'Engineering/Assets/ramp-3.png',
    });
  });
});

describe('bulk rename', () => {
  const items: BulkItem[] = [
    { path: 'Maths/Assets/a.png', mtime: new Date(2026, 9, 16, 12).getTime() },
    { path: 'Maths/Assets/b.png', mtime: new Date(2026, 0, 2, 12).getTime() },
    { path: 'Maths/Assets/c.pdf', mtime: new Date(2025, 11, 31, 12).getTime() },
  ];

  it('renders tokens: name, counter with padding, folder, modified date', () => {
    const unknown = new Set<string>();
    const context = { name: 'a', folder: 'Maths/Assets', n: 7, mtime: items[0]?.mtime ?? 0 };
    expect(renderBulkName('{folder}-{n:3}-{name}-{date:YYYYMMDD}', context, unknown)).toBe('Assets-007-a-20261016');
    expect(renderBulkName('{n}', context, unknown)).toBe('7');
    expect(unknown.size).toBe(0);
    expect(renderBulkName('{folder}', { ...context, folder: '' }, unknown)).toBe('vault');
  });

  it('reports unknown tokens', () => {
    const preview = previewBulkRename(items, 'x-{wat}-{n}', vaultWith());
    expect(preview.warnings).toEqual([expect.stringContaining('{wat}')]);
  });

  it('numbers in order and keeps each extension', () => {
    const preview = previewBulkRename(items, 'shot-{n:2}', vaultWith(...items.map((i) => i.path)));
    expect(preview.rows.map((r) => r.newPath)).toEqual(['Maths/Assets/shot-01.png', 'Maths/Assets/shot-02.png', 'Maths/Assets/shot-03.pdf']);
    expect(preview.okCount).toBe(3);
    expect(preview.problemCount).toBe(0);
  });

  it('marks unchanged names', () => {
    const preview = previewBulkRename(items, '{name}', vaultWith(...items.map((i) => i.path)));
    expect(preview.rows.every((r) => r.status === 'same')).toBe(true);
    expect(preview.okCount).toBe(0);
    expect(preview.problemCount).toBe(0);
  });

  it('skips files that would clash with an existing file', () => {
    const preview = previewBulkRename(items, 'shot-{n}', vaultWith(...items.map((i) => i.path), 'Maths/Assets/shot-2.png'));
    expect(preview.rows[1]?.status).toBe('conflict');
    expect(preview.okCount).toBe(2);
    expect(preview.problemCount).toBe(1);
  });

  it('skips the second file given the same name, and warns when there is no counter', () => {
    const preview = previewBulkRename(items.slice(0, 2), 'same', vaultWith(...items.map((i) => i.path)));
    expect(preview.rows.map((r) => r.status)).toEqual(['ok', 'duplicate']);
    expect(preview.warnings.some((w) => w.includes('{n}'))).toBe(true);
  });

  it('does not warn about a missing counter for a single file', () => {
    expect(previewBulkRename(items.slice(0, 1), 'solo', vaultWith()).warnings).toEqual([]);
  });

  it('skips invalid results and an empty pattern', () => {
    const bad = previewBulkRename(items, 'a/b-{n}', vaultWith());
    expect(bad.rows.every((r) => r.status === 'invalid')).toBe(true);
    const empty = previewBulkRename(items, '  ', vaultWith());
    expect(empty.warnings).toContain('The pattern is empty.');
    expect(empty.rows.every((r) => r.status === 'invalid')).toBe(true);
  });

  it('allows a rename that only changes capitals', () => {
    const preview = previewBulkRename(items.slice(0, 1), 'A', vaultWith(items[0]?.path ?? ''));
    expect(preview.rows[0]).toMatchObject({ status: 'ok', newPath: 'Maths/Assets/A.png' });
  });
});

describe('UsageMap', () => {
  const resolved = {
    'Notes/one.md': { 'Assets/a.png': 1, 'Notes/two.md': 1 },
    'Notes/Two.md': { 'Assets/a.png': 2, 'Assets/b.png': 1 },
    'Notes/three.md': {},
  };
  const isAsset = (path: string) => path.startsWith('Assets/');

  it('is not ready until built, and then says how many notes use a file', () => {
    const map = new UsageMap();
    expect(map.ready).toBe(false);
    expect(usageText(map, 'Assets/a.png')).toBe('–');
    map.rebuild(resolved, isAsset);
    expect(map.ready).toBe(true);
    expect(map.count('Assets/a.png')).toBe(2);
    expect(map.count('Assets/b.png')).toBe(1);
    expect(map.count('Assets/none.png')).toBe(0);
  });

  it('lists notes A to Z and ignores links to notes', () => {
    const map = new UsageMap();
    map.rebuild(resolved, isAsset);
    expect(map.notesFor('Assets/a.png')).toEqual(['Notes/one.md', 'Notes/Two.md']);
    expect(map.notesFor('Notes/two.md')).toEqual([]);
  });

  it('counts a note once however often it links the file', () => {
    const map = new UsageMap();
    map.rebuild({ 'n.md': { 'Assets/a.png': 5 } }, isAsset);
    expect(map.count('Assets/a.png')).toBe(1);
  });

  it('forgets old data when rebuilt', () => {
    const map = new UsageMap();
    map.rebuild(resolved, isAsset);
    const before = map.version;
    map.rebuild({}, isAsset);
    expect(map.count('Assets/a.png')).toBe(0);
    expect(map.version).toBeGreaterThan(before);
  });

  it('words the counts', () => {
    const map = new UsageMap();
    map.rebuild(resolved, isAsset);
    expect(usageText(map, 'Assets/a.png')).toBe('2 notes');
    expect(usageText(map, 'Assets/b.png')).toBe('1 note');
    expect(usageText(map, 'Assets/x.png')).toBe('No notes');
  });
});

describe('pushRecent', () => {
  it('puts the newest first and removes older copies, ignoring case', () => {
    expect(pushRecent(['B', 'A'], 'a')).toEqual(['a', 'B']);
    expect(pushRecent([], 'A/B/')).toEqual(['A/B']);
  });

  it('keeps at most the limit', () => {
    const full = Array.from({ length: 8 }, (_, i) => `F${i}`);
    const next = pushRecent(full, 'New');
    expect(next).toHaveLength(8);
    expect(next[0]).toBe('New');
    expect(next).not.toContain('F7');
  });

  it('can hold the vault root', () => {
    expect(pushRecent(['A'], '')).toEqual(['', 'A']);
  });
});

describe('conflictModeFor', () => {
  const settings = settingsWith(
    [
      { ...rule('m', 'Mathematics', 'Mathematics/Assets'), overrides: { conflict: 'ask' } },
      { ...rule('d', 'Mathematics/Diagrams', 'Mathematics/Assets/Diagrams'), overrides: { conflict: 'cancel' } },
      rule('p', 'Physics', 'Physics/Assets'),
      { ...rule('off', 'Engineering', 'Engineering/Assets'), enabled: false, overrides: { conflict: 'ask' } },
    ],
    { conflict: 'auto-number' },
  );

  it('follows the rule whose save-to folder holds the file', () => {
    expect(conflictModeFor(settings, 'Mathematics/Assets')).toBe('ask');
    expect(conflictModeFor(settings, 'Mathematics/Assets/Screenshots')).toBe('ask');
  });

  it('prefers the deepest rule', () => {
    expect(conflictModeFor(settings, 'Mathematics/Assets/Diagrams')).toBe('cancel');
  });

  it('uses General for a rule without an override, a disabled rule, or no rule at all', () => {
    expect(conflictModeFor(settings, 'Physics/Assets')).toBe('auto-number');
    expect(conflictModeFor(settings, 'Engineering/Assets')).toBe('auto-number');
    expect(conflictModeFor(settings, 'Inbox')).toBe('auto-number');
  });
});
