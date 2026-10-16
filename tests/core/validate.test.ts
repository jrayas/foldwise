import { describe, expect, it } from 'vitest';
import { validateSettings, type Issue } from '../../src/core/validate';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { exampleRules, rule, settingsWith } from '../fixtures/exampleVault';

/** Vault facts over a fixed set of folders, ignoring case. The vault root always exists. */
function vaultWith(...folders: string[]) {
  const known = new Set(folders.map((folder) => folder.toLowerCase()));
  return { folderExists: (path: string) => path === '' || known.has(path.toLowerCase()) };
}

const exampleFolders = [
  'Mathematics', 'Mathematics/Assets', 'Mathematics/Books', 'Mathematics/Books/Files',
  'Physics', 'Physics/Assets', 'Physics/Books', 'Physics/Books/Files',
  'Engineering', 'Engineering/Assets', 'Engineering/Books', 'Engineering/Books/Files',
];

const codes = (issues: Issue[]) => issues.map((issue) => issue.code);
const forRule = (issues: Issue[], id: string) => issues.filter((issue) => issue.ruleId === id);

describe('a healthy setup', () => {
  it('has no issues for the example vault', () => {
    expect(validateSettings(settingsWith(exampleRules), vaultWith(...exampleFolders))).toEqual([]);
  });
  it('has no issues for empty settings', () => {
    expect(validateSettings(DEFAULT_SETTINGS, vaultWith())).toEqual([]);
  });
});

describe('missing folders', () => {
  it('flags a missing save-to folder when "create if missing" is off, and offers to create it', () => {
    const r = { ...rule('r', 'Physics', 'Physics/Nowhere'), createIfMissing: false };
    const issues = validateSettings(settingsWith([r]), vaultWith('Physics'));
    expect(codes(issues)).toEqual(['target-missing']);
    expect(issues[0]).toMatchObject({ ruleId: 'r', fix: { kind: 'create-folder', path: 'Physics/Nowhere' } });
    expect(issues[0]?.message).toContain('Physics/Nowhere');
  });
  it('is fine with a missing save-to folder when "create if missing" is on', () => {
    expect(validateSettings(settingsWith([rule('r', 'Physics', 'Physics/Nowhere')]), vaultWith('Physics'))).toEqual([]);
  });
  it('flags a missing applies-to folder', () => {
    const issues = validateSettings(settingsWith([rule('r', 'Ghost', 'Physics/Assets')]), vaultWith('Physics/Assets'));
    expect(codes(issues)).toEqual(['applies-missing']);
  });
  it('flags a scope folder that does not exist inside the rule folder', () => {
    const r = rule('r', 'Physics', 'Physics/Assets', { scope: { mode: 'exclude', folders: ['Bokos'] } });
    const issues = validateSettings(settingsWith([r]), vaultWith('Physics', 'Physics/Assets'));
    expect(codes(issues)).toEqual(['scope-folder-missing']);
    expect(issues[0]?.message).toContain('Physics/Bokos');
  });
  it('does not check folders of rules that are off', () => {
    const r = rule('r', 'Ghost', 'Nowhere', { enabled: false });
    expect(validateSettings(settingsWith([{ ...r, createIfMissing: false }]), vaultWith())).toEqual([]);
  });
  it('compares folder names ignoring case', () => {
    expect(validateSettings(settingsWith([rule('r', 'physics', 'physics/assets')]), vaultWith('Physics', 'Physics/Assets'))).toEqual([]);
  });
});

describe('not configured', () => {
  it('flags a rule with both folders blank, on or off', () => {
    for (const enabled of [true, false]) {
      const issues = validateSettings(settingsWith([rule('r', '', '', { enabled })]), vaultWith());
      expect(codes(issues)).toEqual(['not-configured']);
    }
  });
  it('allows a blank save-to folder on its own (the vault root)', () => {
    expect(validateSettings(settingsWith([rule('r', 'Inbox', '')]), vaultWith('Inbox'))).toEqual([]);
  });
});

describe('fallback folder', () => {
  it('flags a fixed fallback with no folder chosen', () => {
    const settings = settingsWith([], { fallback: { mode: 'folder', path: '' } });
    const issues = validateSettings(settings, vaultWith());
    expect(codes(issues)).toEqual(['fallback-blank']);
    expect(issues[0]?.ruleId).toBeNull();
  });
  it('accepts a fixed fallback folder, even one that does not exist yet (it is created)', () => {
    const settings = settingsWith([], { fallback: { mode: 'folder', path: 'Inbox/Files' } });
    expect(validateSettings(settings, vaultWith())).toEqual([]);
  });
});

describe('overlapping rules', () => {
  it('flags every enabled rule that shares a folder', () => {
    const rules = [rule('a', 'Physics', 'Physics/Assets'), rule('b', 'physics', 'Physics/Other')];
    const issues = validateSettings(settingsWith(rules), vaultWith('Physics', 'Physics/Assets', 'Physics/Other'));
    expect(codes(issues)).toEqual(['duplicate-folder', 'duplicate-folder']);
    expect(issues.map((issue) => issue.ruleId)).toEqual(['a', 'b']);
  });
  it('ignores a disabled duplicate', () => {
    const rules = [rule('a', 'Physics', 'Physics/Assets'), rule('b', 'Physics', 'Physics/Assets', { enabled: false })];
    expect(validateSettings(settingsWith(rules), vaultWith('Physics', 'Physics/Assets'))).toEqual([]);
  });
});

describe('save-to folder inside an excluded area', () => {
  it('flags it', () => {
    const r = rule('r', 'Mathematics', 'Mathematics/Books/Assets', { scope: { mode: 'exclude', folders: ['Books'] } });
    const issues = validateSettings(settingsWith([r]), vaultWith('Mathematics', 'Mathematics/Books', 'Mathematics/Books/Assets'));
    expect(codes(issues)).toEqual(['target-in-excluded']);
    expect(issues[0]?.message).toContain('Mathematics/Books');
  });
  it('does not flag a save-to folder outside the excluded area', () => {
    expect(validateSettings(settingsWith([exampleRules[0]!]), vaultWith('Mathematics', 'Mathematics/Assets', 'Mathematics/Books'))).toEqual([]);
  });
});

describe('naming patterns', () => {
  it('reports a rule pattern that can produce duplicate names', () => {
    const r = rule('r', 'Physics', 'Physics/Assets');
    r.overrides.namingPattern = '{note}';
    const issues = validateSettings(settingsWith([r]), vaultWith('Physics', 'Physics/Assets'));
    expect(codes(issues)).toEqual(['pattern']);
    expect(issues[0]?.ruleId).toBe('r');
    expect(issues[0]?.message).toContain('duplicate');
  });
  it('reports a General pattern problem once, against General', () => {
    const settings = settingsWith([rule('r', 'Physics', 'Physics/Assets'), rule('s', 'Mathematics', 'Mathematics/Assets')], {
      namingPattern: '{note}-{foo}',
    });
    const issues = validateSettings(settings, vaultWith('Physics', 'Physics/Assets', 'Mathematics', 'Mathematics/Assets'));
    expect(issues.every((issue) => issue.ruleId === null && issue.code === 'pattern')).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('a disabled rule under an excluding parent', () => {
  it('warns that its notes fall back to the fallback', () => {
    const rules = exampleRules.map((r) => (r.id === 'maths-books' ? { ...r, enabled: false } : r));
    const issues = forRule(validateSettings(settingsWith(rules), vaultWith(...exampleFolders)), 'maths-books');
    expect(codes(issues)).toEqual(['disabled-under-exclusion']);
    expect(issues[0]?.message).toContain('fallback');
  });
  it('does not warn when the parent does not exclude it', () => {
    const rules = [rule('p', 'Physics', 'Physics/Assets'), rule('c', 'Physics/Books', 'Physics/Books/Files', { enabled: false })];
    expect(validateSettings(settingsWith(rules), vaultWith(...exampleFolders))).toEqual([]);
  });
});

describe('ordering', () => {
  it('lists issues in rule order, with General first', () => {
    const rules = [rule('a', 'Ghost1', 'X'), rule('b', 'Ghost2', 'Y')];
    const issues = validateSettings(settingsWith(rules, { namingPattern: '{note}' }), vaultWith());
    expect(issues.map((issue) => issue.ruleId)).toEqual([null, 'a', 'b']);
  });
});
