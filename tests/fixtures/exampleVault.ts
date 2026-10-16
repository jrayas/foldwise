import type { Rule, Scope } from '../../src/core/types';

/** Compact rule builder for tests. */
export function rule(
  id: string,
  appliesTo: string,
  saveTo: string,
  options: { enabled?: boolean; scope?: Scope } = {},
): Rule {
  return {
    id,
    enabled: options.enabled ?? true,
    appliesTo,
    saveTo,
    createIfMissing: true,
    scope: options.scope ?? { mode: 'everything' },
    overrides: {},
  };
}

const exclude = (...folders: string[]): Scope => ({ mode: 'exclude', folders });

/** The example vault from CLAUDE.md. Inbox has no rule. */
export const exampleRules: Rule[] = [
  rule('maths', 'Mathematics', 'Mathematics/Assets', { scope: exclude('Books') }),
  rule('maths-books', 'Mathematics/Books', 'Mathematics/Books/Files'),
  rule('physics', 'Physics', 'Physics/Assets', { scope: exclude('Books') }),
  rule('physics-books', 'Physics/Books', 'Physics/Books/Files'),
  rule('engineering', 'Engineering', 'Engineering/Assets', { scope: exclude('Books') }),
  rule('engineering-books', 'Engineering/Books', 'Engineering/Books/Files'),
];

import { DEFAULT_SETTINGS, type FoldwiseSettings, type GeneralSettings } from '../../src/core/types';

/** Default settings with the given rules and any General overrides. */
export function settingsWith(rules: Rule[], general: Partial<GeneralSettings> = {}): FoldwiseSettings {
  return { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, ...general }, rules };
}

/** An `exists` check over fixed paths, case-insensitive like Mac and Windows vaults. */
export function existsIn(...paths: string[]): (path: string) => boolean {
  const taken = new Set(paths.map((path) => path.toLowerCase()));
  return (path) => taken.has(path.toLowerCase());
}
