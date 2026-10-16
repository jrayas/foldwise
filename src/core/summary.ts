// Plain-English description of a rule, shown live at the top of its settings page. Pure.
import { normalisePath } from './paths';
import type { Rule } from './types';

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

export function summariseRule(rule: Rule): string {
  const appliesTo = normalisePath(rule.appliesTo);
  const saveTo = normalisePath(rule.saveTo);
  if (appliesTo === '' && saveTo === '') return 'Choose a folder and where to save its files.';

  const prefix = rule.enabled ? '' : 'This rule is off. ';
  const { scope } = rule;
  if (scope.mode === 'include' && scope.folders.length === 0) {
    return `${prefix}No folders are included, so this rule matches nothing.`;
  }

  const folders = scope.mode === 'everything' ? [] : scope.folders.map(normalisePath);
  const scopeClause =
    folders.length === 0 ? '' : scope.mode === 'exclude' ? ` (except ${joinList(folders)})` : ` (only ${joinList(folders)})`;
  const where = appliesTo === '' ? 'the whole vault' : appliesTo;
  const target = saveTo === '' ? 'the vault root' : saveTo;
  const verb = rule.enabled ? 'are' : 'would be';
  return `${prefix}Files pasted in ${where}${scopeClause} ${verb} saved to ${target}.`;
}

/** Name of a rule in the Folders list: its folder, or a placeholder while unfinished. */
export function ruleLabel(rule: Rule): string {
  const appliesTo = normalisePath(rule.appliesTo);
  if (appliesTo !== '') return appliesTo;
  return normalisePath(rule.saveTo) === '' ? 'New rule' : 'Whole vault';
}

/** Second line of a Folders list row: where files go, with "Off" first when the rule is disabled. */
export function ruleTargetText(rule: Rule): string {
  const saveTo = normalisePath(rule.saveTo);
  const unfinished = normalisePath(rule.appliesTo) === '' && saveTo === '';
  const target = unfinished ? 'Not set up yet' : `→ ${saveTo === '' ? 'vault root' : saveTo}`;
  return rule.enabled ? target : `Off · ${target}`;
}
