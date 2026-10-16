// Which notes use which asset, worked out from Obsidian's link data (note -> files it links or embeds).
// Pure: Obsidian hands over its `resolvedLinks`. Only notes are covered; links elsewhere are not seen.

export type ResolvedLinks = Record<string, Record<string, number>>;

/** One shared collator: building one per comparison is far slower. */
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

export class UsageMap {
  private readonly notes = new Map<string, string[]>();
  /** Paths whose notes list has been sorted already. Sorting waits until a list is asked for. */
  private readonly sorted = new Set<string>();
  /** False until the first build, so the page can say "checking" instead of "no note uses this". */
  ready = false;
  version = 0;

  /** Build again from scratch. `isAsset` says which link targets are assets worth recording. */
  rebuild(resolved: ResolvedLinks, isAsset: (path: string) => boolean): void {
    const next = new Map<string, string[]>();
    for (const [note, targets] of Object.entries(resolved)) {
      for (const target of Object.keys(targets)) {
        if (!isAsset(target)) continue;
        const list = next.get(target);
        if (list) list.push(note);
        else next.set(target, [note]);
      }
    }
    this.notes.clear();
    this.sorted.clear();
    for (const [path, list] of next) this.notes.set(path, list);
    this.ready = true;
    this.version++;
  }

  /** Notes that use this file, A to Z. Empty when none (or before the first build). */
  notesFor(path: string): string[] {
    const list = this.notes.get(path);
    if (!list) return [];
    if (!this.sorted.has(path)) {
      list.sort((a, b) => collator.compare(a, b));
      this.sorted.add(path);
    }
    return list;
  }

  count(path: string): number {
    return this.notes.get(path)?.length ?? 0;
  }
}

/** "Not checked yet", "Unused", "1 note", "3 notes". */
export function usageText(map: UsageMap, path: string): string {
  if (!map.ready) return '–';
  const count = map.count(path);
  if (count === 0) return 'No notes';
  return count === 1 ? '1 note' : `${count} notes`;
}
