// Pure path helpers. Vault-relative, "/"-separated, no Obsidian dependency.
// Comparison is case-insensitive because Mac and Windows vaults usually are;
// the stored case is always preserved for display and for creating folders.

/** Normalise to a vault-relative path: "/" separators, no leading or trailing slash. "" is the vault root. */
export function normalisePath(path: string): string {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.');
  return parts.join('/');
}

/** Folder containing a note path. "" when the note sits at the vault root. */
export function folderOf(notePath: string): string {
  const parts = normalisePath(notePath).split('/');
  parts.pop();
  return parts.join('/');
}

/** The folder, then each parent, nearest first, ending with the vault root (""). */
export function ancestorsOf(folder: string): string[] {
  const parts = normalisePath(folder).split('/').filter((part) => part !== '');
  const result: string[] = [];
  for (let length = parts.length; length > 0; length--) {
    result.push(parts.slice(0, length).join('/'));
  }
  result.push('');
  return result;
}

/** Key used for all comparisons. */
function keyOf(path: string): string {
  return normalisePath(path).toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return keyOf(a) === keyOf(b);
}

/** True when `path` is `folder` itself or lies anywhere beneath it. The root contains everything. */
export function isInside(path: string, folder: string): boolean {
  const folderKey = keyOf(folder);
  if (folderKey === '') return true;
  const pathKey = keyOf(path);
  return pathKey === folderKey || pathKey.startsWith(folderKey + '/');
}

/** Join path parts into one normalised vault-relative path. Empty parts are ignored. */
export function joinPath(...parts: string[]): string {
  return normalisePath(parts.join('/'));
}

/**
 * The part of `path` below `ancestor` ("" for the folder itself), or null when `path` is not inside it.
 * The ancestor is matched ignoring case; the returned part keeps the spelling of `path`.
 */
export function relativeTo(ancestor: string, path: string): string | null {
  if (!isInside(path, ancestor)) return null;
  const normalisedPath = normalisePath(path);
  const normalisedAncestor = normalisePath(ancestor);
  if (normalisedAncestor === '') return normalisedPath;
  return normalisedPath.slice(normalisedAncestor.length).replace(/^\//, '');
}
