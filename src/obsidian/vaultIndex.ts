import { TFolder, type TAbstractFile, type Vault } from 'obsidian';
import { joinPath } from '../core/paths';

/** Every file and folder keyed by lower-case path, so lookups ignore case like Mac and Windows vaults do. */
export function buildIndex(vault: Vault): Map<string, TAbstractFile> {
  const index = new Map<string, TAbstractFile>();
  for (const item of vault.getAllLoadedFiles()) index.set(item.path.toLowerCase(), item);
  return index;
}

/**
 * Make sure `folder` exists and return its path spelled as it already exists in the vault, so a rule
 * written as "physics/assets" never creates a second folder beside "Physics/Assets".
 * Throws when a folder is missing and `create` is false.
 */
export async function ensureFolder(vault: Vault, folder: string, create: boolean): Promise<string> {
  const index = buildIndex(vault);
  let current = '';
  for (const segment of folder.split('/').filter((part) => part !== '')) {
    const wanted = joinPath(current, segment);
    const existing = index.get(wanted.toLowerCase());
    if (existing instanceof TFolder) {
      current = existing.path;
      continue;
    }
    if (existing) throw new Error(`${existing.path} is a file, so the folder ${wanted} cannot be created.`);
    if (!create) throw new Error(`The folder ${wanted} does not exist and "create if missing" is off.`);
    await vault.createFolder(wanted);
    current = wanted;
  }
  return current;
}
