// Planning a rename or move of one file. Pure: whether a path is taken is answered by the injected `exists`,
// and nothing here touches files. The Obsidian side carries the plan out through the file manager, so links
// in notes are updated by Obsidian itself.
import { classifyFile } from './fileKinds';
import { folderOf, joinPath } from './paths';
import type { ConflictMode } from './types';

/** Upper bound on numbers tried, so a broken `exists` can never cause an endless loop. */
const MAX_ATTEMPTS = 1000;
const MAX_NAME_LENGTH = 200;

const ILLEGAL = /[\\/:*?"<>|#^[\]]/g; // Windows-illegal, plus the ones that break Obsidian links
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const lower = (text: string): string => text.toLowerCase();

/** A file name split at its last dot. A leading dot is part of the name, not an extension. */
export function splitName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1) } : { base: fileName, ext: '' };
}

export type NameCheck = { ok: true; base: string } | { ok: false; message: string };

/** Is this a name Foldwise will save? Rejects rather than quietly changing what the person typed. */
export function checkBaseName(input: string): NameCheck {
  const base = input.trim();
  if (base === '') return { ok: false, message: 'The name cannot be empty.' };
  const printable = [...base].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
  if (!printable) return { ok: false, message: 'The name cannot contain control characters.' };
  const illegal = [...new Set(base.match(ILLEGAL) ?? [])];
  if (illegal.length > 0) return { ok: false, message: `The name cannot contain ${illegal.join(' ')}` };
  if (base.startsWith('.') || base.endsWith('.')) return { ok: false, message: 'The name cannot start or end with a dot.' };
  if (RESERVED_WINDOWS_NAME.test(base)) return { ok: false, message: `${base} is a reserved name on Windows.` };
  if ([...base].length > MAX_NAME_LENGTH) return { ok: false, message: `The name is longer than ${MAX_NAME_LENGTH} characters.` };
  return { ok: true, base };
}

/**
 * The base name a person typed for a file that ends in `ext`. Typing the same extension is fine and ignored.
 * The extension never changes: renaming a .png to .jpg would not convert it, only mislabel it.
 */
export function baseFromTyped(typed: string, ext: string): NameCheck {
  const trimmed = typed.trim();
  const { base, ext: typedExt } = splitName(trimmed);
  let candidate = trimmed;
  if (typedExt !== '') {
    if (lower(typedExt) === lower(ext)) candidate = base;
    else if (classifyFile({ name: trimmed, type: '' })) {
      return { ok: false, message: `The extension stays .${ext}. Renaming does not convert a file.` };
    }
  }
  return checkBaseName(candidate);
}

/** `name-2.ext`, `name-3.ext` and so on: the first path that is free. Null if none is found. */
export function nextFreePath(folder: string, base: string, ext: string, exists: (path: string) => boolean): string | null {
  const withExtension = (name: string): string => joinPath(folder, ext === '' ? name : `${name}.${ext}`);
  for (let n = 2; n <= MAX_ATTEMPTS + 1; n++) {
    const path = withExtension(`${base}-${n}`);
    if (!exists(path)) return path;
  }
  return null;
}

export type RenamePlan =
  | { kind: 'unchanged' }
  | { kind: 'invalid'; message: string }
  /** `caseOnly`: only the capitals change, which Mac and Windows file systems can refuse in one step. */
  | { kind: 'free'; newPath: string; caseOnly: boolean }
  | { kind: 'conflict'; conflictWith: string; suggestedPath: string }
  | { kind: 'cancelled'; message: string };

export interface RenameRequest {
  /** Current vault path of the file. */
  path: string;
  /** What the person typed (with or without the extension). */
  typed: string;
  mode: ConflictMode;
  /** True when a file or folder uses this vault path. Must ignore case, like Mac and Windows vaults do. */
  exists: (path: string) => boolean;
}

/** Nothing is ever overwritten: a taken name is handled by the conflict mode. */
export function planRename(request: RenameRequest): RenamePlan {
  const folder = folderOf(request.path);
  const { base: currentBase, ext } = splitName(request.path.slice(request.path.lastIndexOf('/') + 1));
  const checked = baseFromTyped(request.typed, ext);
  if (!checked.ok) return { kind: 'invalid', message: checked.message };
  if (checked.base === currentBase) return { kind: 'unchanged' };

  const newPath = joinPath(folder, ext === '' ? checked.base : `${checked.base}.${ext}`);
  if (lower(newPath) === lower(request.path)) return { kind: 'free', newPath, caseOnly: true };
  if (!request.exists(newPath)) return { kind: 'free', newPath, caseOnly: false };

  const suggestedPath = nextFreePath(folder, checked.base, ext, request.exists);
  if (request.mode === 'cancel' || suggestedPath === null) {
    return { kind: 'cancelled', message: `${newPath} already exists, so nothing was renamed.` };
  }
  if (request.mode === 'ask') return { kind: 'conflict', conflictWith: newPath, suggestedPath };
  return { kind: 'free', newPath: suggestedPath, caseOnly: false };
}

export type MovePlan =
  | { kind: 'unchanged' }
  | { kind: 'free'; newPath: string }
  /** The destination already has a file with this name. `numbered` is true when -2, -3 was added. */
  | { kind: 'conflict'; conflictWith: string; suggestedPath: string }
  | { kind: 'cancelled'; message: string };

export interface MoveRequest {
  path: string;
  /** Destination folder, vault-relative. "" is the vault root. */
  destination: string;
  /** `ask` returns a conflict for the person to decide; `number` quietly adds -2, -3 (bulk moves). */
  onClash: 'ask' | 'number';
  exists: (path: string) => boolean;
}

export function planMove(request: MoveRequest): MovePlan {
  const fileName = request.path.slice(request.path.lastIndexOf('/') + 1);
  const newPath = joinPath(request.destination, fileName);
  if (lower(newPath) === lower(request.path)) return { kind: 'unchanged' };
  if (!request.exists(newPath)) return { kind: 'free', newPath };

  const { base, ext } = splitName(fileName);
  const suggestedPath = nextFreePath(request.destination, base, ext, request.exists);
  if (suggestedPath === null) return { kind: 'cancelled', message: `No free name found in ${request.destination || 'the vault root'}.` };
  if (request.onClash === 'ask') return { kind: 'conflict', conflictWith: newPath, suggestedPath };
  return { kind: 'free', newPath: suggestedPath };
}
