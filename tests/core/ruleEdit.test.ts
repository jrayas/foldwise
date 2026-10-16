import { describe, expect, it } from 'vitest';
import {
  addScopeFolder, badgesFor, deleteRule, duplicateRule, filterRules, moveRule, newRule, removeScopeFolder,
  setOverride, setScopeMode, updateRule,
} from '../../src/core/ruleEdit';
import type { Scope } from '../../src/core/types';
import { rule } from '../fixtures/exampleVault';

const ids = (rules: { id: string }[]) => rules.map((r) => r.id);

describe('newRule', () => {
  it('starts off, with blank folders, so it cannot capture every paste by accident', () => {
    expect(newRule([])).toEqual({
      id: 'rule-1', enabled: false, appliesTo: '', saveTo: '', createIfMissing: true, scope: { mode: 'everything' }, overrides: {},
    });
  });
  it('picks an id that is not taken', () => {
    expect(newRule([rule('rule-1', 'A', 'B'), rule('rule-3', 'C', 'D')]).id).toBe('rule-2');
  });
});

describe('duplicateRule', () => {
  const rules = [rule('a', 'A', 'A1'), rule('b', 'B', 'B1')];
  it('inserts a disabled deep copy right after the original', () => {
    const next = duplicateRule(rules, 'a');
    expect(ids(next)).toEqual(['a', 'a-copy', 'b']);
    expect(next[1]).toMatchObject({ enabled: false, appliesTo: 'A', saveTo: 'A1' });
    expect(next[1]?.scope).not.toBe(rules[0]?.scope);
    expect(next[1]?.overrides).not.toBe(rules[0]?.overrides);
  });
  it('finds a free id for repeated copies', () => {
    expect(ids(duplicateRule(duplicateRule(rules, 'a'), 'a'))).toEqual(['a', 'a-copy-2', 'a-copy', 'b']);
  });
  it('does nothing for an unknown id and never changes its input', () => {
    expect(duplicateRule(rules, 'zzz')).toEqual(rules);
    expect(ids(rules)).toEqual(['a', 'b']);
  });
});

describe('moveRule', () => {
  const rules = [rule('a', 'A', 'x'), rule('b', 'B', 'x'), rule('c', 'C', 'x')];
  it('moves forward and backward', () => {
    expect(ids(moveRule(rules, 0, 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveRule(rules, 2, 0))).toEqual(['c', 'a', 'b']);
  });
  it('ignores a move to the same place or out of range', () => {
    expect(ids(moveRule(rules, 1, 1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveRule(rules, 5, 0))).toEqual(['a', 'b', 'c']);
    expect(ids(moveRule(rules, 0, -1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveRule(rules, 0, 9))).toEqual(['a', 'b', 'c']);
  });
});

describe('deleteRule and updateRule', () => {
  const rules = [rule('a', 'A', 'x'), rule('b', 'B', 'x')];
  it('deletes by id', () => {
    expect(ids(deleteRule(rules, 'a'))).toEqual(['b']);
    expect(ids(deleteRule(rules, 'zzz'))).toEqual(['a', 'b']);
  });
  it('updates one rule and leaves the others as they were', () => {
    const next = updateRule(rules, 'b', { enabled: false, saveTo: 'Y' });
    expect(next[1]).toMatchObject({ id: 'b', enabled: false, saveTo: 'Y', appliesTo: 'B' });
    expect(next[0]).toBe(rules[0]);
    expect(rules[1]?.enabled).toBe(true);
  });
});

describe('setOverride', () => {
  const base = rule('a', 'A', 'x');
  it('sets and clears an override without changing the original', () => {
    const set = setOverride(base, 'namingPattern', '{note}-{n}');
    expect(set.overrides).toEqual({ namingPattern: '{note}-{n}' });
    expect(base.overrides).toEqual({});
    const cleared = setOverride(set, 'namingPattern', undefined);
    expect(cleared.overrides).toEqual({});
    expect('namingPattern' in cleared.overrides).toBe(false);
  });
  it('keeps the other overrides', () => {
    const both = setOverride(setOverride(base, 'conflict', 'ask'), 'subSort', 'date');
    expect(both.overrides).toEqual({ conflict: 'ask', subSort: 'date' });
  });
});

describe('badgesFor', () => {
  it('has none for a plain rule', () => {
    expect(badgesFor(rule('a', 'A', 'x'))).toEqual([]);
  });
  it('lists customisations in a fixed order', () => {
    const r = rule('a', 'A', 'x', { scope: { mode: 'exclude', folders: ['B'] } });
    r.overrides = { subSort: 'date', fileTypes: ['pdf'], conflict: 'cancel', namingPattern: 'x-{n}' };
    expect(badgesFor(r)).toEqual(['Custom naming', 'Custom conflict', 'Custom file types', 'Custom sub-sort', 'Custom scope']);
  });
});

describe('scope editing', () => {
  it('keeps the folders when switching between exclude and include', () => {
    const excluding: Scope = { mode: 'exclude', folders: ['Books'] };
    expect(setScopeMode(excluding, 'include')).toEqual({ mode: 'include', folders: ['Books'] });
  });
  it('starts empty when moving from everything, and drops folders for everything', () => {
    expect(setScopeMode({ mode: 'everything' }, 'exclude')).toEqual({ mode: 'exclude', folders: [] });
    expect(setScopeMode({ mode: 'include', folders: ['A'] }, 'everything')).toEqual({ mode: 'everything' });
  });
  it('adds a folder once, ignoring case and blanks', () => {
    let scope = setScopeMode({ mode: 'everything' }, 'exclude');
    scope = addScopeFolder(scope, 'Books');
    scope = addScopeFolder(scope, 'books');
    scope = addScopeFolder(scope, '  ');
    scope = addScopeFolder(scope, '/Drafts/');
    expect(scope).toEqual({ mode: 'exclude', folders: ['Books', 'Drafts'] });
  });
  it('does not add to "everything"', () => {
    expect(addScopeFolder({ mode: 'everything' }, 'Books')).toEqual({ mode: 'everything' });
  });
  it('removes a folder ignoring case', () => {
    expect(removeScopeFolder({ mode: 'include', folders: ['A', 'B'] }, 'a')).toEqual({ mode: 'include', folders: ['B'] });
  });
});

describe('filterRules', () => {
  const rules = [rule('a', 'Physics', 'Physics/Assets'), rule('b', 'Mathematics', 'Maths/Pics')];
  it('matches the folder or the target, ignoring case and spaces around the query', () => {
    expect(ids(filterRules(rules, ' PHYS '))).toEqual(['a']);
    expect(ids(filterRules(rules, 'pics'))).toEqual(['b']);
  });
  it('returns every rule for a blank query', () => {
    expect(ids(filterRules(rules, ''))).toEqual(['a', 'b']);
    expect(ids(filterRules(rules, '   '))).toEqual(['a', 'b']);
  });
});
