import { describe, expect, it } from 'vitest';
import { route } from '../../src/core/route';
import { exampleRules, existsIn, rule, settingsWith } from '../fixtures/exampleVault';

const now = new Date(2026, 9, 16, 14, 5, 9);
const png = { ext: 'png', kind: 'image' } as const;
const pdf = { ext: 'pdf', kind: 'pdf' } as const;
const context = (exists = existsIn()) => ({ now, exists });

describe('routing to a rule', () => {
  const settings = settingsWith(exampleRules);

  it('saves a Mathematics note image to Mathematics/Assets', () => {
    expect(route(settings, 'Mathematics/Concepts/limits.md', png, context())).toEqual({
      status: 'ok',
      folder: 'Mathematics/Assets',
      fileName: 'limits-20261016-1.png',
      path: 'Mathematics/Assets/limits-20261016-1.png',
      ruleId: 'maths',
      createIfMissing: true,
      reason: 'Used the rule for Mathematics.',
      warnings: [],
    });
  });

  it('saves a Books note to its own Files folder', () => {
    expect(route(settings, 'Mathematics/Books/calc.md', png, context())).toMatchObject({
      status: 'ok',
      path: 'Mathematics/Books/Files/calc-20261016-1.png',
      ruleId: 'maths-books',
      reason: 'Used the rule for Mathematics/Books.',
    });
  });

  it('numbers past files that already exist', () => {
    const exists = existsIn('Mathematics/Assets/limits-20261016-1.png');
    expect(route(settings, 'Mathematics/Concepts/limits.md', png, context(exists))).toMatchObject({
      status: 'ok',
      fileName: 'limits-20261016-2.png',
    });
  });

  it('copes with Windows separators and different case in the note path', () => {
    expect(route(settings, 'mathematics\\BOOKS\\calc.md', png, context())).toMatchObject({
      status: 'ok',
      ruleId: 'maths-books',
    });
  });

  it('passes pattern warnings through', () => {
    const rules = [rule('r', 'Physics', 'Physics/Assets')];
    rules[0]!.overrides.namingPattern = '{note}-{foo}-{n}';
    expect(route(settingsWith(rules), 'Physics/x.md', png, context())).toMatchObject({
      status: 'ok',
      warnings: ['Unknown token {foo}.'],
    });
  });
});

describe('fallback', () => {
  it('hands the paste back to Obsidian in obsidian-default mode', () => {
    const settings = settingsWith(exampleRules, { fallback: { mode: 'obsidian-default' } });
    expect(route(settings, 'Inbox/idea.md', png, context())).toEqual({
      status: 'passthrough',
      reason: "No rule applies, so Obsidian's own attachment setting is used.",
    });
  });

  it('hands the paste back to Obsidian while a fixed fallback has no folder chosen', () => {
    const settings = settingsWith(exampleRules, { fallback: { mode: 'folder', path: '' } });
    expect(route(settings, 'Inbox/idea.md', png, context())).toEqual({
      status: 'passthrough',
      reason: "No rule applies and the fallback folder has not been chosen, so Obsidian's own attachment setting is used.",
    });
  });

  it('uses a fixed fallback folder, creating it if needed', () => {
    const settings = settingsWith(exampleRules, { fallback: { mode: 'folder', path: 'Inbox/Files' } });
    expect(route(settings, 'Inbox/idea.md', png, context())).toEqual({
      status: 'ok',
      folder: 'Inbox/Files',
      fileName: 'idea-20261016-1.png',
      path: 'Inbox/Files/idea-20261016-1.png',
      ruleId: null,
      createIfMissing: true,
      reason: 'No rule applies, so the fallback folder Inbox/Files is used.',
      warnings: [],
    });
  });

  it('explains which rule was skipped when an excluded note falls back (decision 1)', () => {
    const settings = settingsWith([exampleRules[0]!], { fallback: { mode: 'folder', path: 'Inbox/Files' } });
    expect(route(settings, 'Mathematics/Books/calc.md', png, context())).toMatchObject({
      status: 'ok',
      ruleId: null,
      reason:
        'No rule applies, so the fallback folder Inbox/Files is used. Skipped: the rule for Mathematics excludes this note.',
    });
  });

  it('mentions a disabled rule that was skipped', () => {
    const rules = [rule('r', 'Physics', 'Physics/Assets', { enabled: false })];
    const settings = settingsWith(rules, { fallback: { mode: 'folder', path: 'Inbox/Files' } });
    const result = route(settings, 'Physics/x.md', png, context());
    expect(result.status === 'ok' && result.reason).toContain('Skipped: the rule for Physics is disabled.');
  });

  it('uses the vault root wording for a root rule', () => {
    const settings = settingsWith([rule('root', '', 'Assets')]);
    expect(route(settings, 'Inbox/idea.md', png, context())).toMatchObject({
      ruleId: 'root',
      reason: 'Used the rule for the vault root.',
    });
  });
});

describe('overrides inherit from General', () => {
  it('uses the rule naming pattern when set', () => {
    const rules = [rule('r', 'Physics', 'Physics/Assets')];
    rules[0]!.overrides.namingPattern = '{note}-shot-{n}';
    expect(route(settingsWith(rules), 'Physics/motion.md', png, context())).toMatchObject({
      fileName: 'motion-shot-1.png',
    });
  });

  it('uses the General pattern when the rule does not override it', () => {
    const settings = settingsWith([rule('r', 'Physics', 'Physics/Assets')], { namingPattern: '{note}-{n}' });
    expect(route(settings, 'Physics/motion.md', png, context())).toMatchObject({ fileName: 'motion-1.png' });
  });
});

describe('conflict handling', () => {
  const clashing = existsIn('Physics/Assets/motion.png');

  it('cancels when the rule says cancel and the name is taken', () => {
    const rules = [rule('r', 'Physics', 'Physics/Assets')];
    rules[0]!.overrides = { namingPattern: '{note}', conflict: 'cancel' };
    expect(route(settingsWith(rules), 'Physics/motion.md', png, context(clashing))).toMatchObject({
      status: 'cancelled',
      conflictWith: 'Physics/Assets/motion.png',
    });
  });

  it('asks when General says ask, with a suggestion and where it would go', () => {
    const settings = settingsWith([rule('r', 'Physics', 'Physics/Assets')], { namingPattern: '{note}', conflict: 'ask' });
    expect(route(settings, 'Physics/motion.md', png, context(clashing))).toEqual({
      status: 'needs-decision',
      folder: 'Physics/Assets',
      conflictWith: 'Physics/Assets/motion.png',
      suggestedFileName: 'motion-2.png',
      suggestedPath: 'Physics/Assets/motion-2.png',
      ruleId: 'r',
      createIfMissing: true,
      reason: 'Used the rule for Physics.',
      warnings: [],
    });
  });

  it('auto-numbers when the mode is auto-number', () => {
    const settings = settingsWith([rule('r', 'Physics', 'Physics/Assets')], { namingPattern: '{note}' });
    expect(route(settings, 'Physics/motion.md', png, context(clashing))).toMatchObject({
      status: 'ok',
      fileName: 'motion-2.png',
    });
  });
});

describe('file types', () => {
  it('hands a pdf back to Obsidian when the rule handles images only', () => {
    const rules = [rule('r', 'Physics', 'Physics/Assets')];
    rules[0]!.overrides.fileTypes = ['image'];
    expect(route(settingsWith(rules), 'Physics/x.md', pdf, context())).toEqual({
      status: 'passthrough',
      reason: "The rule for Physics does not handle pdf files, so Obsidian's own attachment setting is used.",
    });
  });

  it('handles a pdf when the rule allows it', () => {
    expect(route(settingsWith(exampleRules), 'Physics/x.md', pdf, context())).toMatchObject({
      status: 'ok',
      fileName: 'x-20261016-1.pdf',
    });
  });

  it('applies the General file types when no rule matches', () => {
    const settings = settingsWith([], { fileTypes: ['image'], fallback: { mode: 'folder', path: 'Inbox/Files' } });
    expect(route(settings, 'Inbox/idea.md', pdf, context())).toEqual({
      status: 'passthrough',
      reason: "pdf files are not handled by the General settings, so Obsidian's own attachment setting is used.",
    });
  });
});
