import type { App } from 'obsidian';
import type { VaultFacts } from '../core/validate';

/** Facts about the vault for validation. Built once per call from the folder list, which is far smaller than the file list. */
export function vaultFacts(app: App): VaultFacts {
  const folders = new Set(app.vault.getAllFolders(true).map((folder) => folder.path.toLowerCase()));
  folders.add('');
  folders.add('/');
  return { folderExists: (path) => folders.has(path.toLowerCase()) };
}
