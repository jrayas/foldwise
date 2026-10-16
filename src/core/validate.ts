// Checks settings for mistakes that would surprise the user. Pure: facts about the vault are passed in.
// Everything here is a warning; nothing blocks a save.
import { checkPattern } from './naming';
import { isInside, joinPath, normalisePath, samePath } from './paths';
import { resolveRule } from './resolveRule';
import type { FoldwiseSettings, Rule } from './types';

export type IssueCode =
  | 'not-configured'
  | 'applies-missing'
  | 'target-missing'
  | 'scope-folder-missing'
  | 'duplicate-folder'
  | 'target-in-excluded'
  | 'pattern'
  | 'fallback-blank'
  | 'disabled-under-exclusion';

export interface Issue {
  /** The rule the issue belongs to, or null for General. */
  ruleId: string | null;
  code: IssueCode;
  message: string;
  /** A one-click remedy the UI can offer. */
  fix?: { kind: 'create-folder'; path: string };
}

export interface VaultFacts {
  /** True when the folder exists in the vault. The vault root ("") always does. */
  folderExists: (path: string) => boolean;
}

function ruleIssues(rule: Rule, settings: FoldwiseSettings, facts: VaultFacts): Issue[] {
  const issues: Issue[] = [];
  const add = (code: IssueCode, message: string, fix?: Issue['fix']) =>
    issues.push({ ruleId: rule.id, code, message, ...(fix ? { fix } : {}) });
  const exists = (path: string) => path === '' || facts.folderExists(path);

  const appliesTo = normalisePath(rule.appliesTo);
  const saveTo = normalisePath(rule.saveTo);
  if (appliesTo === '' && saveTo === '') {
    add('not-configured', 'Choose the folder this applies to and where to save its files.');
    return issues;
  }

  if (!rule.enabled) {
    const resolution = resolveRule(settings.rules, joinPath(appliesTo, 'note.md'));
    const excludedBy = resolution.skipped.find((skip) => skip.reason === 'excluded');
    if (excludedBy) {
      const parent = settings.rules.find((candidate) => candidate.id === excludedBy.ruleId);
      const parentLabel = parent ? normalisePath(parent.appliesTo) || 'the whole vault' : excludedBy.ruleId;
      const instead = resolution.rule
        ? `use the rule for ${normalisePath(resolution.rule.appliesTo) || 'the whole vault'}`
        : 'use the fallback setting';
      add(
        'disabled-under-exclusion',
        `While this rule is off, notes in ${appliesTo || 'the whole vault'} ${instead}, because the rule for ${parentLabel} excludes them.`,
      );
    }
    return issues;
  }

  if (!exists(appliesTo)) add('applies-missing', `The folder ${appliesTo} does not exist.`);
  if (!exists(saveTo) && !rule.createIfMissing) {
    add('target-missing', `The folder ${saveTo} does not exist and "create if missing" is off.`, {
      kind: 'create-folder',
      path: saveTo,
    });
  }

  if (rule.scope.mode !== 'everything') {
    for (const folder of rule.scope.folders) {
      const full = joinPath(appliesTo, folder);
      if (folder.trim() !== '' && !exists(full)) add('scope-folder-missing', `The scope folder ${full} does not exist.`);
    }
  }

  const sharesFolder = settings.rules.some(
    (other) => other !== rule && other.enabled && samePath(other.appliesTo, rule.appliesTo),
  );
  if (sharesFolder) {
    add('duplicate-folder', `Another enabled rule also applies to ${appliesTo || 'the whole vault'}; only the first one is used.`);
  }

  if (rule.scope.mode === 'exclude') {
    const area = rule.scope.folders.map((folder) => joinPath(appliesTo, folder)).find((full) => isInside(saveTo, full));
    if (area !== undefined) add('target-in-excluded', `The save-to folder ${saveTo} is inside the excluded folder ${area}.`);
  }

  if (rule.overrides.namingPattern !== undefined) {
    for (const warning of checkPattern(rule.overrides.namingPattern)) add('pattern', warning);
  }
  return issues;
}

/** Issues for General first, then for each rule in list order. */
export function validateSettings(settings: FoldwiseSettings, facts: VaultFacts): Issue[] {
  const general: Issue[] = checkPattern(settings.general.namingPattern).map((message) => ({
    ruleId: null,
    code: 'pattern',
    message,
  }));
  const { fallback } = settings.general;
  if (fallback.mode === 'folder' && normalisePath(fallback.path) === '') {
    general.push({ ruleId: null, code: 'fallback-blank', message: 'Choose the fallback folder, or switch the fallback to Obsidian\'s attachment setting.' });
  }
  return [...general, ...settings.rules.flatMap((rule) => ruleIssues(rule, settings, facts))];
}
