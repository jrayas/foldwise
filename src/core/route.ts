// The routing decision: rules, a note path and a file in, target folder and name out.
// Pure, with no Obsidian dependency, so it is unit-testable and can later move to WASM.
import { chooseFileName } from './conflicts';
import { noteNameOf } from './naming';
import { joinPath, normalisePath } from './paths';
import { resolveRule, type SkippedRule } from './resolveRule';
import type { FileKind, FoldwiseSettings, Rule } from './types';

export interface RoutedFile {
  /** Extension without the dot. */
  ext: string;
  kind: FileKind;
}

export interface RouteContext {
  now: Date;
  /** True when a file or folder already uses this vault-relative path. */
  exists: (path: string) => boolean;
}

interface Target {
  folder: string;
  /** Rule that matched, or null when the fallback folder is used. */
  ruleId: string | null;
  createIfMissing: boolean;
  /** Plain-English explanation, for the Test tab. */
  reason: string;
  warnings: string[];
}

export type RouteResult =
  /** Save the file at `path`. */
  | ({ status: 'ok'; fileName: string; path: string } & Target)
  /** The name is taken and the mode is "ask": the caller must ask, offering the suggestion. */
  | ({ status: 'needs-decision'; conflictWith: string; suggestedFileName: string; suggestedPath: string } & Target)
  /** Save nothing. */
  | { status: 'cancelled'; reason: string; conflictWith?: string; warnings: string[] }
  /** Foldwise does not handle this paste; let Obsidian's own attachment setting do it. */
  | { status: 'passthrough'; reason: string };

const OBSIDIAN_DEFAULT = "Obsidian's own attachment setting is used.";

function folderLabel(folder: string): string {
  const normalised = normalisePath(folder);
  return normalised === '' ? 'the vault root' : normalised;
}

const SKIP_TEXT = {
  disabled: 'is disabled',
  excluded: 'excludes this note',
  'not-included': 'does not include this note',
} as const;

function describeSkips(rules: readonly Rule[], skipped: SkippedRule[]): string {
  if (skipped.length === 0) return '';
  const items = skipped.map((skip) => {
    const rule = rules.find((candidate) => candidate.id === skip.ruleId);
    const label = rule ? folderLabel(rule.appliesTo) : skip.ruleId;
    return `the rule for ${label} ${SKIP_TEXT[skip.reason]}`;
  });
  return ` Skipped: ${items.join('; ')}.`;
}

export function route(
  settings: FoldwiseSettings,
  notePath: string,
  file: RoutedFile,
  context: RouteContext,
): RouteResult {
  const { general, rules } = settings;
  const { rule, skipped } = resolveRule(rules, notePath);
  const skips = describeSkips(rules, skipped);

  if (!rule && general.fallback.mode === 'obsidian-default') {
    return { status: 'passthrough', reason: `No rule applies, so ${OBSIDIAN_DEFAULT}${skips}` };
  }

  if (!rule && general.fallback.mode === 'folder' && normalisePath(general.fallback.path).trim() === '') {
    return { status: 'passthrough', reason: `No rule applies and the fallback folder has not been chosen, so ${OBSIDIAN_DEFAULT}${skips}` };
  }

  const fileTypes = rule?.overrides.fileTypes ?? general.fileTypes;
  if (!fileTypes.includes(file.kind)) {
    const who = rule ? `The rule for ${folderLabel(rule.appliesTo)} does not handle` : `${file.kind} files are not handled by the General settings`;
    const reason = rule ? `${who} ${file.kind} files, so ${OBSIDIAN_DEFAULT}` : `${who}, so ${OBSIDIAN_DEFAULT}`;
    return { status: 'passthrough', reason };
  }

  const target =
    rule
      ? {
          folder: normalisePath(rule.saveTo),
          ruleId: rule.id,
          createIfMissing: rule.createIfMissing,
          reason: `Used the rule for ${folderLabel(rule.appliesTo)}.${skips}`,
        }
      : {
          folder: normalisePath(general.fallback.mode === 'folder' ? general.fallback.path : ''),
          ruleId: null,
          createIfMissing: true,
          reason: `No rule applies, so the fallback folder ${folderLabel(general.fallback.mode === 'folder' ? general.fallback.path : '')} is used.${skips}`,
        };

  const outcome = chooseFileName({
    pattern: rule?.overrides.namingPattern ?? general.namingPattern,
    noteName: noteNameOf(notePath),
    ext: file.ext,
    folder: target.folder,
    now: context.now,
    mode: rule?.overrides.conflict ?? general.conflict,
    exists: context.exists,
  });

  switch (outcome.kind) {
    case 'free':
      return {
        status: 'ok',
        ...target,
        fileName: outcome.fileName,
        path: joinPath(target.folder, outcome.fileName),
        warnings: outcome.warnings,
      };
    case 'conflict':
      return {
        status: 'needs-decision',
        ...target,
        conflictWith: outcome.conflictWith,
        suggestedFileName: outcome.suggestedFileName,
        suggestedPath: joinPath(target.folder, outcome.suggestedFileName),
        warnings: outcome.warnings,
      };
    case 'cancelled':
      return { status: 'cancelled', reason: outcome.reason, conflictWith: outcome.conflictWith, warnings: outcome.warnings };
  }
}
