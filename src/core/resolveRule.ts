// Finds the rule that serves a note. Pure: rules and a note path in, a decision out.
import { ancestorsOf, folderOf, isInside, joinPath, samePath } from './paths';
import type { Rule, Scope } from './types';

export type SkipReason = 'disabled' | 'excluded' | 'not-included';

export interface SkippedRule {
  ruleId: string;
  reason: SkipReason;
}

export interface Resolution {
  /** The rule to use, or null when the caller should use the fallback. */
  rule: Rule | null;
  /** Rules met on the way up that did not apply, nearest first. Used by the Test tab to explain a result. */
  skipped: SkippedRule[];
}

/**
 * Scope folders are relative to the rule's own folder: `exclude: ['Books']` on `Mathematics`
 * means `Mathematics/Books`.
 */
function scopeSkipReason(rule: Rule, noteFolder: string): SkipReason | null {
  const scope: Scope = rule.scope;
  if (scope.mode === 'everything') return null;
  const inList = scope.folders.some((folder) => isInside(noteFolder, joinPath(rule.appliesTo, folder)));
  if (scope.mode === 'exclude') return inList ? 'excluded' : null;
  return inList ? null : 'not-included';
}

/**
 * Walk up from the note's folder to the vault root and return the nearest enabled rule whose scope
 * accepts the note. A rule that is disabled or whose scope rejects the note is skipped and the walk
 * continues upwards. When two rules share a folder, the first enabled one in list order wins.
 */
export function resolveRule(rules: readonly Rule[], notePath: string): Resolution {
  const noteFolder = folderOf(notePath);
  const skipped: SkippedRule[] = [];

  for (const folder of ancestorsOf(noteFolder)) {
    for (const rule of rules) {
      if (!samePath(rule.appliesTo, folder)) continue;
      if (!rule.enabled) {
        skipped.push({ ruleId: rule.id, reason: 'disabled' });
        continue;
      }
      const reason = scopeSkipReason(rule, noteFolder);
      if (reason) {
        skipped.push({ ruleId: rule.id, reason });
        continue;
      }
      return { rule, skipped };
    }
  }
  return { rule: null, skipped };
}
