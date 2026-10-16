// Which conflict mode applies to a file already saved in a folder. Pure.
import { isInside, normalisePath } from './paths';
import type { ConflictMode, FoldwiseSettings } from './types';

/**
 * A file sitting in (or under) a rule's save-to folder follows that rule's conflict setting; the deepest such
 * rule wins. Anywhere else the General setting applies.
 */
export function conflictModeFor(settings: FoldwiseSettings, folder: string): ConflictMode {
  let best: { depth: number; mode: ConflictMode } | null = null;
  for (const rule of settings.rules) {
    if (!rule.enabled || rule.saveTo.trim() === '' || !isInside(folder, rule.saveTo)) continue;
    const depth = normalisePath(rule.saveTo).split('/').filter(Boolean).length;
    if (!best || depth > best.depth) best = { depth, mode: rule.overrides.conflict ?? settings.general.conflict };
  }
  return best?.mode ?? settings.general.conflict;
}
