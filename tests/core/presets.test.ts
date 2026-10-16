import { describe, expect, it } from 'vitest';
import { readControl, writeControl } from '../../src/core/controls';
import { applyPreset, applyPresetToRules, deletePreset, describeChanges, newPreset, presetFromRule, presetSummary, uniquePresetName, updatePreset } from '../../src/core/presets';
import type { Preset, Rule } from '../../src/core/types';
import { rule, settingsWith } from '../fixtures/exampleVault';

const customRule = (): Rule => ({
  ...rule('m', 'Mathematics', 'Mathematics/Assets'),
  scope: { mode: 'exclude', folders: ['Books'] },
  overrides: { namingPattern: '{note}-{n}', conflict: 'ask', fileTypes: ['image'] },
});

describe('creating presets', () => {
  it('snapshots naming, conflict, file types and scope, but not the folders', () => {
    const preset = presetFromRule([], customRule(), 'Subject folder');
    expect(preset).toEqual({
      id: 'preset-1',
      name: 'Subject folder',
      overrides: { namingPattern: '{note}-{n}', conflict: 'ask', fileTypes: ['image'] },
      scope: { mode: 'exclude', folders: ['Books'] },
    });
  });

  it('copies, so later edits to the rule do not reach the preset', () => {
    const source = customRule();
    const preset = presetFromRule([], source, 'x');
    (source.overrides.fileTypes as string[]).push('pdf');
    expect(preset.overrides.fileTypes).toEqual(['image']);
  });

  it('gives unique names, ignoring case, and unique ids', () => {
    const first = presetFromRule([], customRule(), 'Books');
    const second = presetFromRule([first], customRule(), 'books');
    expect(second.name).toBe('books 2');
    expect(second.id).toBe('preset-2');
    expect(uniquePresetName([first, second], 'Books')).toBe('Books 3');
    expect(uniquePresetName([first], 'Books', first.id)).toBe('Books');
  });

  it('makes a blank preset that inherits everything', () => {
    expect(newPreset([])).toEqual({ id: 'preset-1', name: 'New preset', overrides: {}, scope: { mode: 'everything' } });
    expect(newPreset([newPreset([])]).name).toBe('New preset 2');
  });

  it('updates and deletes by id', () => {
    const preset = newPreset([]);
    expect(updatePreset([preset], preset.id, { name: 'Renamed' })[0]?.name).toBe('Renamed');
    expect(deletePreset([preset], preset.id)).toEqual([]);
    expect(deletePreset([preset], 'nope')).toHaveLength(1);
  });
});

describe('applying a preset (a one-off copy)', () => {
  const preset: Preset = { id: 'p', name: 'Books', overrides: { namingPattern: 'book-{n}', fileTypes: ['pdf'] }, scope: { mode: 'include', folders: ['Files'] } };

  it('gives the rule exactly the preset values and leaves its folders alone', () => {
    const before = customRule();
    const { rule: after } = applyPreset(before, preset);
    expect(after.overrides).toEqual({ namingPattern: 'book-{n}', fileTypes: ['pdf'] });
    expect(after.scope).toEqual({ mode: 'include', folders: ['Files'] });
    expect([after.id, after.appliesTo, after.saveTo, after.enabled]).toEqual([before.id, before.appliesTo, before.saveTo, before.enabled]);
  });

  it('clears overrides the preset does not set (back to General), and says so', () => {
    const { rule: after, changes } = applyPreset(customRule(), preset);
    expect(after.overrides.conflict).toBeUndefined();
    expect(changes).toContain('Name conflicts: ask → General');
    expect(changes).toContain('Naming pattern: {note}-{n} → book-{n}');
    expect(changes).toContain('File types: image → pdf');
    expect(changes.some((c) => c.startsWith('Scope: Exclude Books → Only Files'))).toBe(true);
  });

  it('keeps the rule scope when the preset has none', () => {
    const { rule: after } = applyPreset(customRule(), { ...preset, scope: undefined });
    expect(after.scope).toEqual({ mode: 'exclude', folders: ['Books'] });
  });

  it('does not change the original rule or the preset', () => {
    const before = customRule();
    const snapshot = JSON.stringify(before);
    const { rule: after } = applyPreset(before, preset);
    expect(JSON.stringify(before)).toBe(snapshot);
    (after.overrides.fileTypes as string[]).push('image');
    expect(preset.overrides.fileTypes).toEqual(['pdf']);
  });

  it('reports no changes when the rule already matches', () => {
    const matching = applyPreset(customRule(), preset).rule;
    expect(applyPreset(matching, preset).changes).toEqual([]);
  });

  it('editing a preset afterwards does not change a rule that already received it', () => {
    const received = applyPreset(customRule(), preset).rule;
    const edited = { ...preset, overrides: { namingPattern: 'other' } };
    expect(received.overrides.namingPattern).toBe('book-{n}');
    expect(edited.overrides.namingPattern).toBe('other');
  });
});

describe('applying to several folders', () => {
  const rules = [rule('a', 'A', 'A/Assets'), rule('b', 'B', 'B/Assets'), rule('c', 'C', 'C/Assets')];
  const preset: Preset = { id: 'p', name: 'P', overrides: { conflict: 'cancel' }, scope: { mode: 'everything' } };

  it('changes only the chosen rules and reports each', () => {
    const { rules: next, applied } = applyPresetToRules(rules, preset, new Set(['a', 'c']));
    expect(next.map((r) => r.overrides.conflict)).toEqual(['cancel', undefined, 'cancel']);
    expect(applied.map((a) => a.id)).toEqual(['a', 'c']);
    expect(applied[0]?.changes).toEqual(['Name conflicts: General → cancel']);
    expect(next[1]).toBe(rules[1]);
  });

  it('does nothing for an empty choice', () => {
    expect(applyPresetToRules(rules, preset, new Set()).applied).toEqual([]);
  });
});

describe('describeChanges and presetSummary', () => {
  it('describes a scope change in plain English', () => {
    const a = customRule();
    const b = { ...a, scope: { mode: 'everything' } as const };
    expect(describeChanges(a, b)).toEqual(['Scope: Exclude Books → Everything']);
  });

  it('summarises a preset in one line', () => {
    expect(presetSummary(newPreset([]))).toBe('Uses the General settings');
    expect(presetSummary(presetFromRule([], customRule(), 'x'))).toBe('naming {note}-{n} · conflicts: ask · types: image · exclude Books');
  });
});

describe('editing a preset with the shared controls', () => {
  const settings = () => ({ ...settingsWith([]), presets: [{ id: 'p1', name: 'Books', overrides: {}, scope: { mode: 'everything' } } as Preset] });

  it('reads and writes the name, refusing blank and duplicate names', () => {
    let s = settings();
    expect(readControl(s, 'preset:p1:name')).toBe('Books');
    s = writeControl(s, 'preset:p1:name', ' Subjects ');
    expect(readControl(s, 'preset:p1:name')).toBe('Subjects');
    expect(writeControl(s, 'preset:p1:name', '   ')).toBe(s);
    const two = { ...s, presets: [...s.presets, { id: 'p2', name: 'Other', overrides: {}, scope: { mode: 'everything' } } as Preset] };
    expect(writeControl(two, 'preset:p2:name', 'subjects')).toBe(two);
  });

  it('edits naming, conflict, file types and scope through the rule logic', () => {
    let s = settings();
    expect(readControl(s, 'preset:p1:useGeneralNaming')).toBe(true);
    s = writeControl(s, 'preset:p1:useGeneralNaming', false);
    s = writeControl(s, 'preset:p1:namingPattern', 'book-{n}');
    s = writeControl(s, 'preset:p1:useGeneralConflict', false);
    s = writeControl(s, 'preset:p1:conflict', 'ask');
    s = writeControl(s, 'preset:p1:useGeneralFileTypes', false);
    s = writeControl(s, 'preset:p1:fileType.pdf', false);
    s = writeControl(s, 'preset:p1:scopeMode', 'exclude');
    expect(s.presets[0]).toMatchObject({
      overrides: { namingPattern: 'book-{n}', conflict: 'ask', fileTypes: ['image'] },
      scope: { mode: 'exclude', folders: [] },
    });
    expect(readControl(s, 'preset:p1:namingPattern')).toBe('book-{n}');
    expect(readControl(s, 'preset:p1:scopeMode')).toBe('exclude');
  });

  it('ignores unknown presets and fields, returning the same object', () => {
    const s = settings();
    expect(writeControl(s, 'preset:nope:name', 'x')).toBe(s);
    expect(writeControl(s, 'preset:p1:wat', 'x')).toBe(s);
    expect(readControl(s, 'preset:nope:name')).toBeUndefined();
  });

  it('never touches the rules', () => {
    const s = { ...settings(), rules: [rule('a', 'A', 'A/Assets')] };
    expect(writeControl(s, 'preset:p1:useGeneralNaming', false).rules).toEqual(s.rules);
  });
});
