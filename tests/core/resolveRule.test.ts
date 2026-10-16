import { describe, expect, it } from 'vitest';
import { resolveRule } from '../../src/core/resolveRule';
import { exampleRules, rule } from '../fixtures/exampleVault';

const idFor = (notePath: string, rules = exampleRules) => resolveRule(rules, notePath).rule?.id ?? null;

describe('example vault: nearest rule wins', () => {
  it.each([
    ['Mathematics/Concepts/limits.md', 'maths'],
    ['Mathematics/limits.md', 'maths'],
    ['Mathematics/Books/calc.md', 'maths-books'],
    ['Mathematics/Books/Deep/x.md', 'maths-books'],
    ['Physics/Concepts/motion.md', 'physics'],
    ['Physics/Books/optics.md', 'physics-books'],
    ['Engineering/Questions/q1.md', 'engineering'],
    ['Engineering/Books/beams.md', 'engineering-books'],
  ])('%s uses %s', (notePath, expected) => {
    expect(idFor(notePath)).toBe(expected);
  });

  it('returns no rule for Inbox, which has none', () => {
    expect(resolveRule(exampleRules, 'Inbox/idea.md')).toEqual({ rule: null, skipped: [] });
  });

  it('returns no rule for a note at the vault root', () => {
    expect(idFor('readme.md')).toBeNull();
  });
});

describe('exclude scope', () => {
  const mathsOnly = [exampleRules[0]!];

  it('skips an excluded subfolder with no rule of its own and reports why (decision 1: fallback)', () => {
    const result = resolveRule(mathsOnly, 'Mathematics/Books/calc.md');
    expect(result.rule).toBeNull();
    expect(result.skipped).toEqual([{ ruleId: 'maths', reason: 'excluded' }]);
  });

  it('still serves notes outside the excluded folder', () => {
    expect(idFor('Mathematics/Concepts/limits.md', mathsOnly)).toBe('maths');
  });

  it('excludes everything beneath the excluded folder', () => {
    expect(idFor('Mathematics/Books/Deep/x.md', mathsOnly)).toBeNull();
  });

  it('resolves exclude entries relative to the rule folder, not the vault', () => {
    expect(idFor('Mathematics/Concepts/Books/x.md', mathsOnly)).toBe('maths');
  });

  it('does not exclude on a shared name prefix', () => {
    const rules = [rule('r', 'Mathematics', 'A', { scope: { mode: 'exclude', folders: ['Book'] } })];
    expect(idFor('Mathematics/Books/calc.md', rules)).toBe('r');
  });

  it('matches excluded folders case-insensitively', () => {
    const rules = [rule('r', 'Mathematics', 'A', { scope: { mode: 'exclude', folders: ['books'] } })];
    expect(idFor('Mathematics/Books/calc.md', rules)).toBeNull();
  });

  it('treats an empty exclude list as everything', () => {
    const rules = [rule('r', 'Mathematics', 'A', { scope: { mode: 'exclude', folders: [] } })];
    expect(idFor('Mathematics/Books/calc.md', rules)).toBe('r');
  });
});

describe('include-only scope', () => {
  const includeConcepts = rule('maths', 'Mathematics', 'Mathematics/Assets', {
    scope: { mode: 'include', folders: ['Concepts'] },
  });

  it('accepts notes inside an included folder, including nested ones', () => {
    expect(idFor('Mathematics/Concepts/limits.md', [includeConcepts])).toBe('maths');
    expect(idFor('Mathematics/Concepts/Deep/limits.md', [includeConcepts])).toBe('maths');
  });

  it('skips notes outside the included folders', () => {
    const result = resolveRule([includeConcepts], 'Mathematics/Questions/q.md');
    expect(result.rule).toBeNull();
    expect(result.skipped).toEqual([{ ruleId: 'maths', reason: 'not-included' }]);
  });

  it('skips a note directly in the rule folder', () => {
    expect(idFor('Mathematics/limits.md', [includeConcepts])).toBeNull();
  });

  it('never matches with an empty include list', () => {
    const rules = [rule('r', 'Mathematics', 'A', { scope: { mode: 'include', folders: [] } })];
    expect(idFor('Mathematics/Concepts/limits.md', rules)).toBeNull();
  });
});

describe('walking up past a skipped rule', () => {
  const rules = [
    rule('misc', '', 'Misc/Assets'),
    rule('maths', 'Mathematics', 'Mathematics/Assets', { scope: { mode: 'include', folders: ['Concepts'] } }),
  ];

  it('falls through to a parent rule and records the skip', () => {
    const result = resolveRule(rules, 'Mathematics/Questions/q.md');
    expect(result.rule?.id).toBe('misc');
    expect(result.skipped).toEqual([{ ruleId: 'maths', reason: 'not-included' }]);
  });

  it('uses a vault-root rule for notes with no nearer rule', () => {
    expect(idFor('Inbox/idea.md', rules)).toBe('misc');
    expect(idFor('readme.md', rules)).toBe('misc');
  });
});

describe('disabled rules', () => {
  it('ignores a disabled rule and records it', () => {
    const rules = [
      rule('parent', 'Mathematics', 'P'),
      rule('child', 'Mathematics/Books', 'C', { enabled: false }),
    ];
    const result = resolveRule(rules, 'Mathematics/Books/calc.md');
    expect(result.rule?.id).toBe('parent');
    expect(result.skipped).toEqual([{ ruleId: 'child', reason: 'disabled' }]);
  });

  it('falls back when the disabled Books rule leaves only an excluding parent', () => {
    const rules = exampleRules.map((r) => (r.id === 'maths-books' ? { ...r, enabled: false } : r));
    const result = resolveRule(rules, 'Mathematics/Books/calc.md');
    expect(result.rule).toBeNull();
    expect(result.skipped).toEqual([
      { ruleId: 'maths-books', reason: 'disabled' },
      { ruleId: 'maths', reason: 'excluded' },
    ]);
  });
});

describe('duplicate rules on the same folder', () => {
  it('uses the first enabled rule in list order', () => {
    const rules = [rule('first', 'Physics', 'A', { enabled: false }), rule('second', 'Physics', 'B'), rule('third', 'Physics', 'C')];
    const result = resolveRule(rules, 'Physics/x.md');
    expect(result.rule?.id).toBe('second');
    expect(result.skipped).toEqual([{ ruleId: 'first', reason: 'disabled' }]);
  });
});

describe('path handling', () => {
  it('matches case-insensitively', () => {
    expect(idFor('mathematics/books/calc.md')).toBe('maths-books');
  });

  it('accepts Windows-style separators in the note path', () => {
    expect(idFor('Mathematics\\Books\\Deep\\x.md')).toBe('maths-books');
  });

  it('is not fooled by a shared prefix', () => {
    expect(idFor('Mathematics2/x.md')).toBeNull();
    expect(idFor('Maths/x.md')).toBeNull();
  });

  it('tolerates a stored folder with stray slashes', () => {
    const rules = [rule('r', '/Physics/', 'A')];
    expect(idFor('Physics/x.md', rules)).toBe('r');
  });
});
