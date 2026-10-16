// A short most-recent-first list of folders, for the Move picker. Pure.
import { normalisePath } from './paths';

export const MAX_RECENT_FOLDERS = 8;

/** Put `folder` first, removing any earlier copy (ignoring case), and keep at most `max`. "" is the vault root. */
export function pushRecent(list: readonly string[], folder: string, max = MAX_RECENT_FOLDERS): string[] {
  const clean = normalisePath(folder);
  const rest = list.filter((entry) => entry.toLowerCase() !== clean.toLowerCase());
  return [clean, ...rest].slice(0, max);
}
