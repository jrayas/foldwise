// Filtering, sorting and folder lists for the Asset Manager. Pure, so it can be tested and later moved to WASM.
import type { AssetRecord } from './assetIndex';
import type { FileKind, SortDirection, SortKey, UsedFilter } from './types';

export type { SortDirection, SortKey, UsedFilter };

export interface AssetQuery {
  /** Top-level vault folder to show, or '' for all. Use VAULT_ROOT for files that sit in the vault root. */
  parent: string;
  /** Folder below the parent (relative to it), including its subfolders, or '' for all. */
  subfolder: string;
  /** '' for every type. */
  kind: FileKind | '';
  /** Used or unused by notes. Needs the usage data; ignored while that is not ready. */
  used: UsedFilter;
  /** Case-insensitive text that must appear in the file name. Blank matches everything. */
  search: string;
  sort: SortKey;
  direction: SortDirection;
}

/** Stands for "files directly in the vault root" in the Parent filter, since '' already means all. */
export const VAULT_ROOT = '/';

export const DEFAULT_QUERY: AssetQuery = {
  parent: '',
  subfolder: '',
  kind: '',
  used: '',
  search: '',
  sort: 'modified',
  direction: 'desc',
};

/** The first folder of a path ("Maths/Assets" gives "Maths"), or VAULT_ROOT for a root-level file. */
export function parentOf(record: Pick<AssetRecord, 'folder'>): string {
  if (record.folder === '') return VAULT_ROOT;
  const slash = record.folder.indexOf('/');
  return slash < 0 ? record.folder : record.folder.slice(0, slash);
}

/** The folder below the parent ("Maths/Assets/Diagrams" gives "Assets/Diagrams"), or '' directly in the parent. */
export function subfolderOf(record: Pick<AssetRecord, 'folder'>): string {
  const slash = record.folder.indexOf('/');
  return slash < 0 ? '' : record.folder.slice(slash + 1);
}

/** Folder paths compare ignoring case, like vaults on Mac and Windows. */
const lower = (text: string): string => text.toLowerCase();

function matchesFolder(record: AssetRecord, query: AssetQuery): boolean {
  if (query.parent === '') return true;
  if (lower(parentOf(record)) !== lower(query.parent)) return false;
  if (query.subfolder === '') return true;
  const sub = lower(subfolderOf(record));
  const wanted = lower(query.subfolder);
  return sub === wanted || sub.startsWith(`${wanted}/`);
}

/** Shared collators: `localeCompare` with options builds a new one on every comparison, which is very slow. */
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const pathCollator = new Intl.Collator();

const COMPARERS: Record<SortKey, (a: AssetRecord, b: AssetRecord) => number> = {
  modified: (a, b) => a.mtime - b.mtime,
  name: (a, b) => nameCollator.compare(a.name, b.name),
  size: (a, b) => a.size - b.size,
};

/** What the Used filter needs to know. `ready` is false until Obsidian has read the links. */
export interface UsageLookup {
  ready: boolean;
  count: (path: string) => number;
}

/** Records that match the query, in the requested order. Ties fall back to the path, so the order is stable. */
export function queryAssets(records: Iterable<AssetRecord>, query: AssetQuery, usage?: UsageLookup): AssetRecord[] {
  const needle = query.search.trim().toLowerCase();
  const filterUsed = query.used !== '' && usage?.ready === true;
  const out: AssetRecord[] = [];
  for (const record of records) {
    if (query.kind !== '' && record.kind !== query.kind) continue;
    if (filterUsed && (usage.count(record.path) > 0) !== (query.used === 'used')) continue;
    if (!matchesFolder(record, query)) continue;
    if (needle !== '' && !record.name.toLowerCase().includes(needle)) continue;
    out.push(record);
  }
  const compare = COMPARERS[query.sort];
  const sign = query.direction === 'asc' ? 1 : -1;
  return out.sort((a, b) => sign * compare(a, b) || pathCollator.compare(a.path, b.path));
}

export interface FolderOption {
  value: string;
  count: number;
}

/** Top-level folders that hold assets, with counts, A to Z (the vault root first). */
export function parentOptions(records: Iterable<AssetRecord>, kind: FileKind | ''): FolderOption[] {
  const counts = new Map<string, FolderOption>();
  for (const record of records) {
    if (kind !== '' && record.kind !== kind) continue;
    const parent = parentOf(record);
    const key = lower(parent);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { value: parent, count: 1 });
  }
  return [...counts.values()].sort((a, b) => {
    if (a.value === VAULT_ROOT) return -1;
    if (b.value === VAULT_ROOT) return 1;
    return a.value.localeCompare(b.value, undefined, { sensitivity: 'base' });
  });
}

/**
 * Folders below `parent` that contain assets, plus the folders between, so a parent folder can be chosen
 * as well as its children. Paths are relative to the parent.
 */
export function subfolderOptions(records: Iterable<AssetRecord>, parent: string, kind: FileKind | ''): FolderOption[] {
  if (parent === '' || parent === VAULT_ROOT) return [];
  const wantedParent = lower(parent);
  const counts = new Map<string, FolderOption>();
  for (const record of records) {
    if (kind !== '' && record.kind !== kind) continue;
    if (lower(parentOf(record)) !== wantedParent) continue;
    const parts = subfolderOf(record).split('/').filter((part) => part !== '');
    for (let depth = 1; depth <= parts.length; depth++) {
      const value = parts.slice(0, depth).join('/');
      const key = lower(value);
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { value, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }));
}
