import { Notice, type App, type Editor, type MarkdownFileInfo, type MarkdownView } from 'obsidian';
import { classifyFile } from '../core/fileKinds';
import { joinPath } from '../core/paths';
import { route, type RouteResult, type RoutedFile } from '../core/route';
import type { SettingsStore } from '../settings/store';
import { ConflictModal } from './conflictModal';
import { buildIndex, ensureFolder } from './vaultIndex';

/**
 * Clipboards that also carry rich text (copying an image from a web page, cells from a spreadsheet)
 * are left to Obsidian, so Foldwise never swallows formatted text. Set to false to route them too.
 */
const LEAVE_RICH_CLIPBOARDS_TO_OBSIDIAN = true;

interface PastedItem {
  file: File;
  routed: RoutedFile;
}

/** The pasted files if every one is a kind Foldwise handles, otherwise null (not ours). */
function pastedItems(evt: ClipboardEvent): PastedItem[] | null {
  const data = evt.clipboardData;
  if (!data) return null;
  if (LEAVE_RICH_CLIPBOARDS_TO_OBSIDIAN && data.types.includes('text/html')) return null;
  const files = Array.from(data.files);
  if (files.length === 0) return null;

  const items: PastedItem[] = [];
  for (const file of files) {
    const classified = classifyFile(file);
    if (!classified) return null;
    items.push({ file, routed: classified });
  }
  return items;
}

export interface PastePlan {
  notePath: string;
  items: PastedItem[];
  results: RouteResult[];
}

/**
 * Work out, without awaiting anything, where each pasted file should go. Returns null when Foldwise
 * should not take over the paste (not a handled file, no note, or a rule that says "use Obsidian's setting").
 */
export function planPaste(
  app: App,
  store: SettingsStore,
  evt: ClipboardEvent,
  info: MarkdownView | MarkdownFileInfo,
): PastePlan | null {
  const notePath = info.file?.path;
  if (!notePath) return null;
  const items = pastedItems(evt);
  if (!items) return null;

  const taken = new Set(buildIndex(app.vault).keys());
  const now = new Date();
  const results: RouteResult[] = [];
  for (const item of items) {
    const result = route(store.settings, notePath, item.routed, { now, exists: (path) => taken.has(path.toLowerCase()) });
    if (result.status === 'passthrough') return null; // leave the whole paste to Obsidian
    if (result.status === 'ok') taken.add(result.path.toLowerCase());
    if (result.status === 'needs-decision') taken.add(result.suggestedPath.toLowerCase());
    results.push(result);
  }
  return { notePath, items, results };
}

/** Save the planned files, asking about name clashes, and insert links at the cursor. Never overwrites. */
export async function savePlan(app: App, editor: Editor, plan: PastePlan): Promise<void> {
  const { notePath, items, results } = plan;
  const links: string[] = [];

  for (const [position, result] of results.entries()) {
    const item = items[position];
    if (!item) continue;
    if (result.status === 'passthrough') continue;
    if (result.status === 'cancelled') {
      new Notice(`Foldwise: ${result.reason}`);
      continue;
    }
    if ('warnings' in result && result.warnings.length > 0) console.warn('Foldwise naming:', result.warnings);

    let fileName = result.status === 'ok' ? result.fileName : result.suggestedFileName;
    if (result.status === 'needs-decision') {
      const useSuggestion = await new ConflictModal(app, result.conflictWith, result.suggestedFileName).ask();
      if (!useSuggestion) continue;
      fileName = result.suggestedFileName;
    }

    try {
      const folder = await ensureFolder(app.vault, result.folder, result.createIfMissing);
      const created = await app.vault.createBinary(joinPath(folder, fileName), await item.file.arrayBuffer());
      links.push(`!${app.fileManager.generateMarkdownLink(created, notePath)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Foldwise could not save ${item.file.name}: ${message}`);
    }
  }

  if (links.length > 0) editor.replaceSelection(links.join('\n'));
}
