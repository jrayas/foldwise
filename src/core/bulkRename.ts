// Pattern rename for a selection: tokens, a preview of every new name, and the problems in it. Pure.
import { formatDate } from './naming';
import { checkBaseName, splitName } from './renamePlan';
import { joinPath } from './paths';

export interface BulkItem {
  path: string;
  /** Modified time, for the {date:...} token. */
  mtime: number;
}

export type RowStatus = 'ok' | 'same' | 'conflict' | 'invalid' | 'duplicate';

export interface BulkRow {
  path: string;
  oldName: string;
  newName: string;
  newPath: string;
  status: RowStatus;
  message: string;
}

export interface BulkPreview {
  rows: BulkRow[];
  /** Rows that will be renamed. */
  okCount: number;
  /** Rows that will be skipped, with the reason on each row. */
  problemCount: number;
  /** Things wrong with the pattern as a whole (unknown token, no counter for several files). */
  warnings: string[];
}

export const BULK_TOKEN_HELP = '{name} original name · {n} or {n:3} counter · {date:YYYYMMDD} modified date · {folder} folder name';

const TOKEN = /\{([^{}]*)\}/g;

interface Context {
  name: string;
  folder: string;
  n: number;
  mtime: number;
}

/** Render one file's new base name. Unknown tokens stay as written and are reported through `unknown`. */
export function renderBulkName(pattern: string, context: Context, unknown: Set<string>): string {
  return pattern.replace(TOKEN, (whole: string, inner: string) => {
    if (inner === 'name') return context.name;
    if (inner === 'folder') return context.folder === '' ? 'vault' : (context.folder.split('/').pop() ?? '');
    if (inner === 'n') return String(context.n);
    const width = /^n:(\d{1,2})$/.exec(inner);
    if (width) return String(context.n).padStart(Number(width[1]), '0');
    if (inner.startsWith('date:') && inner.length > 5) return formatDate(new Date(context.mtime), inner.slice(5));
    unknown.add(whole);
    return whole;
  });
}

/**
 * What renaming these files with this pattern would do. Nothing is changed here. The counter follows the order
 * of `items`. A row is skipped, never forced, when its new name is invalid, already used by another file, or
 * given to two files at once.
 */
export function previewBulkRename(items: BulkItem[], pattern: string, exists: (path: string) => boolean): BulkPreview {
  const warnings: string[] = [];
  const unknown = new Set<string>();
  const seen = new Map<string, string>(); // lower-case target path -> first file that claimed it
  const rows: BulkRow[] = [];

  if (pattern.trim() === '') warnings.push('The pattern is empty.');
  if (items.length > 1 && !/\{n(:\d{1,2})?\}/.test(pattern)) {
    warnings.push('Without {n}, several files would get the same name. Only the first of each name can be renamed.');
  }

  items.forEach((item, index) => {
    const slash = item.path.lastIndexOf('/');
    const folder = slash < 0 ? '' : item.path.slice(0, slash);
    const oldName = item.path.slice(slash + 1);
    const { base, ext } = splitName(oldName);
    const rendered = renderBulkName(pattern, { name: base, folder, n: index + 1, mtime: item.mtime }, unknown);
    const checked = checkBaseName(rendered);
    const row = (newName: string, status: RowStatus, message: string): void => {
      rows.push({ path: item.path, oldName, newName, newPath: joinPath(folder, newName), status, message });
    };

    if (!checked.ok) return row(rendered, 'invalid', checked.message);
    const newName = ext === '' ? checked.base : `${checked.base}.${ext}`;
    const newPath = joinPath(folder, newName);
    if (newPath === item.path) return row(newName, 'same', 'Unchanged.');

    const key = newPath.toLowerCase();
    const caseOnly = key === item.path.toLowerCase();
    if (!caseOnly && exists(newPath)) return row(newName, 'conflict', 'A file with this name already exists.');
    if (seen.has(key)) return row(newName, 'duplicate', 'Another selected file gets this name.');
    seen.set(key, item.path);
    return row(newName, 'ok', '');
  });

  for (const token of unknown) warnings.push(`Unknown token ${token}.`);
  const okCount = rows.filter((row) => row.status === 'ok').length;
  return { rows, okCount, problemCount: rows.filter((row) => row.status !== 'ok' && row.status !== 'same').length, warnings };
}
