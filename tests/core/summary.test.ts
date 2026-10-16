import { describe, expect, it } from 'vitest';
import { ruleLabel, ruleTargetText, summariseRule } from '../../src/core/summary';
import { exampleRules, rule } from '../fixtures/exampleVault';

describe('summariseRule', () => {
  it('describes a rule that excludes a subfolder', () => {
    expect(summariseRule(exampleRules[0]!)).toBe('Files pasted in Mathematics (except Books) are saved to Mathematics/Assets.');
  });
  it('describes a rule with no scope limits', () => {
    expect(summariseRule(rule('r', 'Physics', 'Physics/Assets'))).toBe('Files pasted in Physics are saved to Physics/Assets.');
  });
  it('lists several excluded folders naturally', () => {
    const two = rule('r', 'A', 'B', { scope: { mode: 'exclude', folders: ['Books', 'Drafts'] } });
    expect(summariseRule(two)).toBe('Files pasted in A (except Books and Drafts) are saved to B.');
    const three = rule('r', 'A', 'B', { scope: { mode: 'exclude', folders: ['X', 'Y', 'Z'] } });
    expect(summariseRule(three)).toBe('Files pasted in A (except X, Y and Z) are saved to B.');
  });
  it('describes include-only scope', () => {
    const only = rule('r', 'Mathematics', 'Mathematics/Assets', { scope: { mode: 'include', folders: ['Concepts'] } });
    expect(summariseRule(only)).toBe('Files pasted in Mathematics (only Concepts) are saved to Mathematics/Assets.');
  });
  it('says so when an include-only rule includes nothing', () => {
    const none = rule('r', 'A', 'B', { scope: { mode: 'include', folders: [] } });
    expect(summariseRule(none)).toBe('No folders are included, so this rule matches nothing.');
  });
  it('treats an empty exclude list as everything', () => {
    const none = rule('r', 'A', 'B', { scope: { mode: 'exclude', folders: [] } });
    expect(summariseRule(none)).toBe('Files pasted in A are saved to B.');
  });
  it('names the vault root on either side', () => {
    expect(summariseRule(rule('r', '', 'Assets'))).toBe('Files pasted in the whole vault are saved to Assets.');
    expect(summariseRule(rule('r', 'Inbox', ''))).toBe('Files pasted in Inbox are saved to the vault root.');
  });
  it('asks for folders when neither is chosen', () => {
    expect(summariseRule(rule('r', '', ''))).toBe('Choose a folder and where to save its files.');
  });
  it('says when the rule is off', () => {
    expect(summariseRule(rule('r', 'Physics', 'Physics/Assets', { enabled: false }))).toBe(
      'This rule is off. Files pasted in Physics would be saved to Physics/Assets.',
    );
  });
  it('tidies stray slashes', () => {
    expect(summariseRule(rule('r', '/Physics/', 'Physics\\Assets'))).toBe('Files pasted in Physics are saved to Physics/Assets.');
  });
});

describe('ruleLabel and ruleTargetText', () => {
  it('names a rule by its folder', () => {
    expect(ruleLabel(rule('r', 'Physics', 'Physics/Assets'))).toBe('Physics');
    expect(ruleLabel(rule('r', '/Physics\\Optics/', 'x'))).toBe('Physics/Optics');
  });
  it('names the whole vault and an unfinished rule', () => {
    expect(ruleLabel(rule('r', '', 'Assets'))).toBe('Whole vault');
    expect(ruleLabel(rule('r', '', ''))).toBe('New rule');
  });
  it('shows where files go, and when the rule is off', () => {
    expect(ruleTargetText(rule('r', 'Physics', 'Physics/Assets'))).toBe('→ Physics/Assets');
    expect(ruleTargetText(rule('r', 'Physics', 'Physics/Assets', { enabled: false }))).toBe('Off · → Physics/Assets');
    expect(ruleTargetText(rule('r', 'Inbox', ''))).toBe('→ vault root');
    expect(ruleTargetText(rule('r', '', '', { enabled: false }))).toBe('Off · Not set up yet');
  });
});
