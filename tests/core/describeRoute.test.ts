import { describe, expect, it } from 'vitest';
import { describeRoute } from '../../src/core/describeRoute';
import { route } from '../../src/core/route';
import { exampleRules, existsIn, rule, settingsWith } from '../fixtures/exampleVault';

const now = new Date(2026, 9, 16, 14, 5, 9);
const png = { ext: 'png', kind: 'image' } as const;
const context = (exists = existsIn()) => ({ now, exists });

describe('describeRoute', () => {
  it('says where a file would be saved, and why', () => {
    const result = route(settingsWith(exampleRules), 'Mathematics/Books/calc.md', png, context());
    expect(describeRoute(result)).toEqual({
      headline: 'Saves to Mathematics/Books/Files/calc-20261016-1.png',
      detail: 'Used the rule for Mathematics/Books.',
    });
  });

  it('adds naming warnings to the detail', () => {
    const rules = [rule('r', 'Physics', 'Physics/Assets')];
    rules[0]!.overrides.namingPattern = '{note}-{foo}-{n}';
    const text = describeRoute(route(settingsWith(rules), 'Physics/x.md', png, context())).detail;
    expect(text).toBe('Used the rule for Physics. Unknown token {foo}.');
  });

  it('says it would ask when the name is taken', () => {
    const settings = settingsWith([rule('r', 'Physics', 'Physics/Assets')], { namingPattern: '{note}', conflict: 'ask' });
    const result = route(settings, 'Physics/motion.md', png, context(existsIn('Physics/Assets/motion.png')));
    expect(describeRoute(result)).toEqual({
      headline: 'Would ask: Physics/Assets/motion.png already exists',
      detail: 'Suggested name: Physics/Assets/motion-2.png. Used the rule for Physics.',
    });
  });

  it('says it would cancel', () => {
    const settings = settingsWith([rule('r', 'Physics', 'Physics/Assets')], { namingPattern: '{note}', conflict: 'cancel' });
    const result = route(settings, 'Physics/motion.md', png, context(existsIn('Physics/Assets/motion.png')));
    expect(describeRoute(result)).toEqual({
      headline: 'Would cancel the paste',
      detail: 'Physics/Assets/motion.png already exists, so nothing was saved.',
    });
  });

  it('says when Obsidian handles the paste', () => {
    const result = route(settingsWith(exampleRules), 'Inbox/idea.md', png, context());
    expect(describeRoute(result)).toEqual({
      headline: "Left to Obsidian's attachment setting",
      detail: "No rule applies, so Obsidian's own attachment setting is used.",
    });
  });
});
