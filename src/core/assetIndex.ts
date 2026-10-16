// The Asset Manager's lightweight metadata index: path, name, size, date and type, never file contents.
// Pure: the Obsidian side feeds it records and tells it about vault changes.
import { folderOf } from './paths';
import type { FileKind } from './types';

export interface AssetRecord {
  /** Vault-relative path, which is also the key. */
  path: string;
  /** File name with extension. */
  name: string;
  /** Folder the file lives in. "" is the vault root. */
  folder: string;
  /** Lower-case extension without the dot. */
  ext: string;
  kind: FileKind;
  /** Bytes. */
  size: number;
  /** Modified time, milliseconds since the epoch. */
  mtime: number;
}

/** Builds a record from the facts Obsidian gives for a file. */
export function makeRecord(path: string, ext: string, kind: FileKind, size: number, mtime: number): AssetRecord {
  const slash = path.lastIndexOf('/');
  return { path, name: slash >= 0 ? path.slice(slash + 1) : path, folder: folderOf(path), ext, kind, size, mtime };
}

export class AssetIndex {
  private readonly records = new Map<string, AssetRecord>();
  /** Increases on every change, so a view can tell whether it is out of date. */
  version = 0;

  get size(): number {
    return this.records.size;
  }

  get(path: string): AssetRecord | undefined {
    return this.records.get(path);
  }

  /** Add a record, or replace the one with the same path. */
  upsert(record: AssetRecord): void {
    this.records.set(record.path, record);
    this.version++;
  }

  /** Add many records with one version bump (the first build). */
  load(records: Iterable<AssetRecord>): void {
    for (const record of records) this.records.set(record.path, record);
    this.version++;
  }

  remove(path: string): boolean {
    const removed = this.records.delete(path);
    if (removed) this.version++;
    return removed;
  }

  /** A file was renamed or moved: drop the old path and add the new record. */
  rename(oldPath: string, record: AssetRecord): void {
    this.records.delete(oldPath);
    this.records.set(record.path, record);
    this.version++;
  }

  /** A folder was renamed or moved: re-point everything under it. Returns how many records changed. */
  renameFolder(oldFolder: string, newFolder: string): number {
    const prefix = `${oldFolder}/`;
    const moved = [...this.records.values()].filter((record) => record.path.startsWith(prefix));
    for (const record of moved) {
      this.records.delete(record.path);
      const path = `${newFolder}/${record.path.slice(prefix.length)}`;
      this.records.set(path, { ...record, path, folder: folderOf(path) });
    }
    if (moved.length > 0) this.version++;
    return moved.length;
  }

  /** A folder was deleted: drop everything under it. */
  removeFolder(folder: string): number {
    const prefix = `${folder}/`;
    let removed = 0;
    for (const path of [...this.records.keys()]) {
      if (path.startsWith(prefix)) {
        this.records.delete(path);
        removed++;
      }
    }
    if (removed > 0) this.version++;
    return removed;
  }

  clear(): void {
    this.records.clear();
    this.version++;
  }

  values(): IterableIterator<AssetRecord> {
    return this.records.values();
  }

  toArray(): AssetRecord[] {
    return [...this.records.values()];
  }
}
