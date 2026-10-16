// Pure edit operations on rules and scopes. Each returns new objects and never changes its input.
import { normalisePath, samePath } from './paths';
import type { Overrides, Rule, Scope } from './types';

function freeId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * A new rule starts off with blank folders, so adding one can never capture every paste by accident.
 */
export function newRule(existing: readonly Rule[]): Rule {
  const used = new Set(existing.map((rule) => rule.id));
  let n = 1;
  while (used.has(`rule-${n}`)) n++;
  return {
    id: `rule-${n}`,
    enabled: false,
    appliesTo: '',
    saveTo: '',
    createIfMissing: true,
    scope: { mode: 'everything' },
    overrides: {},
  };
}

/** A disabled deep copy placed right after the original, so the pair is never ambiguous. */
export function duplicateRule(rules: readonly Rule[], id: string): Rule[] {
  const index = rules.findIndex((rule) => rule.id === id);
  const original = rules[index];
  if (!original) return [...rules];
  const used = new Set(rules.map((rule) => rule.id));
  const copy: Rule = { ...structuredClone(original), id: freeId(`${id}-copy`, used), enabled: false };
  return [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)];
}

export function moveRule(rules: readonly Rule[], from: number, to: number): Rule[] {
  const result = [...rules];
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < rules.length;
  if (!inRange(from) || !inRange(to) || from === to) return result;
  const [moved] = result.splice(from, 1);
  if (moved) result.splice(to, 0, moved);
  return result;
}

export function deleteRule(rules: readonly Rule[], id: string): Rule[] {
  return rules.filter((rule) => rule.id !== id);
}

export function updateRule(rules: readonly Rule[], id: string, patch: Partial<Omit<Rule, 'id'>>): Rule[] {
  return rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
}

/** Set an override, or remove it (back to "inherit from General") by passing undefined. */
export function setOverride<K extends keyof Overrides>(rule: Rule, key: K, value: Overrides[K] | undefined): Rule {
  const overrides: Overrides = { ...rule.overrides };
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  return { ...rule, overrides };
}

/** Short labels for what a rule customises, shown as badges in the Folders list. */
export function badgesFor(rule: Rule): string[] {
  const { overrides, scope } = rule;
  const badges: string[] = [];
  if (overrides.namingPattern !== undefined) badges.push('Custom naming');
  if (overrides.conflict !== undefined) badges.push('Custom conflict');
  if (overrides.fileTypes !== undefined) badges.push('Custom file types');
  if (overrides.subSort !== undefined) badges.push('Custom sub-sort');
  if (scope.mode !== 'everything') badges.push('Custom scope');
  return badges;
}

/** Switching between exclude and include keeps the folder list; "everything" drops it. */
export function setScopeMode(scope: Scope, mode: Scope['mode']): Scope {
  if (mode === 'everything') return { mode: 'everything' };
  return { mode, folders: scope.mode === 'everything' ? [] : [...scope.folders] };
}

/** `folder` is relative to the rule's folder. Blank and repeated entries (ignoring case) are ignored. */
export function addScopeFolder(scope: Scope, folder: string): Scope {
  if (scope.mode === 'everything') return scope;
  const clean = normalisePath(folder).trim();
  if (clean === '' || scope.folders.some((existing) => samePath(existing, clean))) return scope;
  return { mode: scope.mode, folders: [...scope.folders, clean] };
}

export function removeScopeFolder(scope: Scope, folder: string): Scope {
  if (scope.mode === 'everything') return scope;
  return { mode: scope.mode, folders: scope.folders.filter((existing) => !samePath(existing, folder)) };
}

/** Rules whose folder or save-to folder contains the query, ignoring case. A blank query keeps every rule. */
export function filterRules(rules: readonly Rule[], query: string): Rule[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...rules];
  return rules.filter(
    (rule) => rule.appliesTo.toLowerCase().includes(needle) || rule.saveTo.toLowerCase().includes(needle),
  );
}
