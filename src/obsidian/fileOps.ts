import { type App, TFile } from 'obsidian';
import { folderOf, joinPath } from '../core/paths';
import { splitName } from '../core/renamePlan';

/**
 * Every rename and move in Foldwise goes through here, and through Obsidian's file manager, so links in notes
 * are updated by Obsidian itself. Foldwise never edits note text.
 */

export interface Step {
  path: string;
  newPath: string;
  /** Only the capitals change. Mac and Windows may refuse that in one step, so it is done in two. */
  caseOnly?: boolean;
}

/** `getConfig` is internal to Obsidian (not in its typings). If it is missing, links are assumed to update. */
export function linksUpdateAutomatically(app: App): boolean {
  const vault = app.vault as unknown as { getConfig?: (key: string) => unknown };
  return vault.getConfig?.('alwaysUpdateLinks') !== false;
}

export async function renameOne(app: App, step: Step): Promise<void> {
  const file = app.vault.getFileByPath(step.path);
  if (!file) throw new Error(`${step.path} no longer exists.`);
  if (step.caseOnly) {
    const { base, ext } = splitName(step.newPath.slice(step.newPath.lastIndexOf('/') + 1));
    const temporary = joinPath(folderOf(step.newPath), `${base}.foldwise-${Date.now().toString(36)}${ext === '' ? '' : `.${ext}`}`);
    await app.fileManager.renameFile(file, temporary);
    const moved = app.vault.getFileByPath(temporary);
    if (!(moved instanceof TFile)) throw new Error(`Could not finish renaming ${step.path}.`);
    await app.fileManager.renameFile(moved, step.newPath);
    return;
  }
  await app.fileManager.renameFile(file, step.newPath);
}

export interface BatchResult {
  done: number;
  total: number;
  /** The step that stopped the batch, if any. Nothing after it was attempted. */
  failed: { path: string; message: string } | null;
}

const BATCH_SIZE = 10;
const PAUSE_MS = 30;

const pause = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Carry out steps one by one, in small groups with a short pause between, so other plugins and sync can keep
 * up. Stops at the first failure and says exactly how far it got.
 */
export async function runBatch(
  app: App,
  steps: Step[],
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<BatchResult> {
  let done = 0;
  onProgress(0, steps.length);
  for (const step of steps) {
    if (isCancelled()) break;
    try {
      await renameOne(app, step);
    } catch (error) {
      return { done, total: steps.length, failed: { path: step.path, message: error instanceof Error ? error.message : String(error) } };
    }
    done++;
    onProgress(done, steps.length);
    if (done % BATCH_SIZE === 0) await pause(PAUSE_MS);
  }
  return { done, total: steps.length, failed: null };
}
