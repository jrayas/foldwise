// Chooses a free file name. Pure: whether a path is taken is answered by the injected `exists`.
import { joinPath } from './paths';
import { renderPattern } from './naming';
import type { ConflictMode } from './types';

/** Upper bound on numbers tried, so a broken `exists` can never cause an endless loop. */
const MAX_ATTEMPTS = 1000;

export interface NameRequest {
  pattern: string;
  /** Note name without extension. */
  noteName: string;
  /** File extension, with or without a leading dot. */
  ext: string;
  /** Target folder, vault-relative. "" is the vault root. */
  folder: string;
  now: Date;
  mode: ConflictMode;
  /** True when a file or folder already uses this vault-relative path. Should ignore case on case-insensitive vaults. */
  exists: (path: string) => boolean;
}

export type NameOutcome =
  | { kind: 'free'; fileName: string; warnings: string[] }
  | { kind: 'conflict'; conflictWith: string; suggestedFileName: string; warnings: string[] }
  | { kind: 'cancelled'; reason: string; conflictWith?: string; warnings: string[] };

/**
 * A pattern containing {n} uses the number as a counter: the first free number is taken and the
 * conflict mode never applies. Without {n}, a taken name is handled by the mode: auto-number adds
 * -2, -3 and so on; ask returns a suggestion; cancel stops. A file is never overwritten.
 */
export function chooseFileName(request: NameRequest): NameOutcome {
  const ext = request.ext.replace(/^\.+/, '');
  const withExtension = (base: string) => (ext === '' ? base : `${base}.${ext}`);
  const pathOf = (base: string) => joinPath(request.folder, withExtension(base));
  const isFree = (base: string) => !request.exists(pathOf(base));
  const render = (n: number) =>
    renderPattern(request.pattern, { noteName: request.noteName, now: request.now, n });

  const first = render(1);
  const warnings = first.warnings;
  const exhausted: NameOutcome = {
    kind: 'cancelled',
    reason: `No free file name found after ${MAX_ATTEMPTS} attempts.`,
    warnings,
  };

  if (first.usesN) {
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      const { name } = n === 1 ? first : render(n);
      if (isFree(name)) return { kind: 'free', fileName: withExtension(name), warnings };
    }
    return exhausted;
  }

  if (isFree(first.name)) return { kind: 'free', fileName: withExtension(first.name), warnings };
  const conflictWith = pathOf(first.name);

  if (request.mode === 'cancel') {
    return { kind: 'cancelled', reason: `${conflictWith} already exists, so nothing was saved.`, conflictWith, warnings };
  }

  for (let n = 2; n <= MAX_ATTEMPTS + 1; n++) {
    const candidate = `${first.name}-${n}`;
    if (!isFree(candidate)) continue;
    return request.mode === 'ask'
      ? { kind: 'conflict', conflictWith, suggestedFileName: withExtension(candidate), warnings }
      : { kind: 'free', fileName: withExtension(candidate), warnings };
  }
  return exhausted;
}
