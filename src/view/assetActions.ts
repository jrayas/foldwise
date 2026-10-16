import { Menu, Notice, TFile, type App } from 'obsidian';
import type { AssetRecord } from '../core/assetIndex';
import type { BulkItem } from '../core/bulkRename';
import { conflictModeFor } from '../core/conflictMode';
import { pushRecent } from '../core/recentFolders';
import { planMove, planRename } from '../core/renamePlan';
import { formatCount } from '../core/format';
import type { FoldwiseSettings } from '../core/types';
import { buildIndex } from '../obsidian/vaultIndex';
import { ConfirmModal } from '../obsidian/confirmModal';
import { ConflictModal } from '../obsidian/conflictModal';
import { linksUpdateAutomatically, renameOne, runBatch, type Step } from '../obsidian/fileOps';
import { MoveModal } from '../obsidian/moveModal';
import { ProgressModal } from '../obsidian/progressModal';
import type { UsageTracker } from '../obsidian/usageTracker';
import { BulkRenameModal } from './bulkRenameModal';

/** "1 note" or "3 notes". */
function formatNotes(count: number): string {
  return formatCount(count, 'note');
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export interface ActionContext {
  settings: () => FoldwiseSettings;
  updateSettings: (next: FoldwiseSettings) => void;
  usage: UsageTracker;
}

/**
 * What the Rename, Move and Open note buttons do. Each change goes through Obsidian's file manager (see
 * fileOps), so links in notes follow the file. Nothing is overwritten and nothing is deleted.
 */
export class AssetActions {
  constructor(
    private readonly app: App,
    private readonly context: ActionContext,
  ) {}

  /** Lower-case path lookup taken now, so it reflects the vault at the moment of the action. */
  private existsNow(): (path: string) => boolean {
    const index = buildIndex(this.app.vault);
    return (path) => index.has(path.toLowerCase());
  }

  /**
   * Obsidian can be set not to update links. Renaming a file that notes use would then leave those links
   * pointing nowhere, so ask first. `what` completes "…and renaming would break the links in …".
   */
  private async confirmLinks(usedByNotes: number, what: string, action: 'rename' | 'move'): Promise<boolean> {
    const verb = action === 'rename' ? 'renaming' : 'moving';
    if (usedByNotes === 0 || linksUpdateAutomatically(this.app)) return true;
    return new ConfirmModal(
      this.app,
      'Links will not update',
      `Obsidian is set not to update internal links automatically (Settings, Files and links), so ${verb} would leave the links in ${what} broken. You can turn that setting on first.`,
      action === 'rename' ? 'Rename anyway' : 'Move anyway',
    ).ask();
  }

  // ---- one file ----

  async rename(record: AssetRecord, typed: string): Promise<ActionResult> {
    const mode = conflictModeFor(this.context.settings(), record.folder);
    const plan = planRename({ path: record.path, typed, mode, exists: this.existsNow() });
    switch (plan.kind) {
      case 'unchanged':
        return { ok: true };
      case 'invalid':
      case 'cancelled':
        return { ok: false, message: plan.message };
      case 'free':
      case 'conflict': {
        let step: Step;
        if (plan.kind === 'conflict') {
          const name = plan.suggestedPath.slice(plan.suggestedPath.lastIndexOf('/') + 1);
          if (!(await new ConflictModal(this.app, plan.conflictWith, name, 'Rename to').ask())) {
            return { ok: false, message: 'Not renamed.' };
          }
          step = { path: record.path, newPath: plan.suggestedPath };
        } else {
          step = { path: record.path, newPath: plan.newPath, caseOnly: plan.caseOnly };
        }
        if (!(await this.confirmLinks(this.context.usage.map.count(record.path), formatNotes(this.context.usage.map.count(record.path)), 'rename'))) return { ok: false, message: 'Not renamed.' };
        try {
          await renameOne(this.app, step);
          return { ok: true };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      }
    }
  }

  async move(record: AssetRecord): Promise<void> {
    const folder = await this.chooseFolder(`Move ${record.name} to…`);
    if (!folder) return;
    const destination = folder.isRoot() ? '' : folder.path;
    const plan = planMove({ path: record.path, destination, onClash: 'ask', exists: this.existsNow() });

    let newPath: string;
    if (plan.kind === 'unchanged') {
      new Notice(`${record.name} is already in ${destination || 'the vault root'}.`);
      return;
    }
    if (plan.kind === 'cancelled') {
      new Notice(plan.message);
      return;
    }
    if (plan.kind === 'conflict') {
      const name = plan.suggestedPath.slice(plan.suggestedPath.lastIndexOf('/') + 1);
      if (!(await new ConflictModal(this.app, plan.conflictWith, name, 'Move as').ask())) return;
      newPath = plan.suggestedPath;
    } else {
      newPath = plan.newPath;
    }
    if (!(await this.confirmLinks(this.context.usage.map.count(record.path), formatNotes(this.context.usage.map.count(record.path)), 'move'))) return;

    try {
      await renameOne(this.app, { path: record.path, newPath });
      this.rememberFolder(destination);
      new Notice(`Moved to ${destination || 'the vault root'}.`);
    } catch (error) {
      new Notice(`Could not move ${record.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  openNote(record: AssetRecord, event: MouseEvent): void {
    const notes = this.context.usage.map.notesFor(record.path);
    if (notes.length === 0) return;
    const open = (path: string): void => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) void this.app.workspace.getLeaf('tab').openFile(file);
    };
    const [only] = notes;
    if (notes.length === 1 && only) {
      open(only);
      return;
    }
    const menu = new Menu();
    for (const note of notes) menu.addItem((item) => item.setTitle(note).setIcon('file-text').onClick(() => open(note)));
    menu.showAtMouseEvent(event);
  }

  // ---- a selection ----

  async moveMany(records: AssetRecord[]): Promise<boolean> {
    if (records.length === 0) return false;
    const folder = await this.chooseFolder(`Move ${formatCount(records.length, 'file')} to…`);
    if (!folder) return false;
    const destination = folder.isRoot() ? '' : folder.path;
    const label = destination || 'the vault root';

    // Plan against a vault that also contains the names this batch will create, so two files never claim one.
    const index = buildIndex(this.app.vault);
    const claimed = new Set<string>();
    const taken = (path: string): boolean => index.has(path.toLowerCase()) || claimed.has(path.toLowerCase());
    const steps: Step[] = [];
    let renamed = 0;
    let alreadyThere = 0;
    for (const record of records) {
      const plan = planMove({ path: record.path, destination, onClash: 'number', exists: taken });
      if (plan.kind === 'unchanged') alreadyThere++;
      else if (plan.kind === 'free') {
        if (plan.newPath.slice(plan.newPath.lastIndexOf('/') + 1) !== record.name) renamed++;
        claimed.add(plan.newPath.toLowerCase());
        steps.push({ path: record.path, newPath: plan.newPath });
      }
    }
    if (steps.length === 0) {
      new Notice(`Everything selected is already in ${label}.`);
      return false;
    }

    const used = steps.filter((step) => this.context.usage.map.count(step.path) > 0).length;
    if (!(await this.confirmLinks(used, 'the notes that use the selected files', 'move'))) return false;
    const confirmed = await new ConfirmModal(
      this.app,
      `Move ${formatCount(steps.length, 'file')}?`,
      `They will be moved to ${label}. Links in your notes are updated by Obsidian.${renamed > 0 ? ` ${renamed === 1 ? '1 file already has its name in that folder, so it gets a number added' : `${renamed} files already have their names in that folder, so they get a number added`} (for example -2).` : ''}${alreadyThere > 0 ? ` ${formatCount(alreadyThere, 'file')} already there will be left alone.` : ''} There is no undo here.`,
      'Move',
    ).ask();
    if (!confirmed) return false;

    const result = await this.runWithProgress(`Moving ${formatCount(steps.length, 'file')}`, steps);
    if (result.done > 0) this.rememberFolder(destination);
    this.report('Moved', result, label);
    return true;
  }

  async renameMany(records: AssetRecord[]): Promise<boolean> {
    if (records.length === 0) return false;
    const items: BulkItem[] = records.map((record) => ({ path: record.path, mtime: record.mtime }));
    const rows = await new BulkRenameModal(this.app, items, this.existsNow()).ask();
    if (!rows || rows.length === 0) return false;

    const used = rows.filter((row) => this.context.usage.map.count(row.path) > 0).length;
    if (!(await this.confirmLinks(used, 'the notes that use the selected files', 'rename'))) return false;
    const steps: Step[] = rows.map((row) => ({ path: row.path, newPath: row.newPath, caseOnly: row.path.toLowerCase() === row.newPath.toLowerCase() }));
    const result = await this.runWithProgress(`Renaming ${formatCount(steps.length, 'file')}`, steps);
    this.report('Renamed', result);
    return true;
  }

  private async runWithProgress(title: string, steps: Step[]) {
    const progress = new ProgressModal(this.app, title);
    progress.open();
    try {
      return await runBatch(this.app, steps, (done, total) => progress.update(done, total));
    } finally {
      progress.close();
    }
  }

  private report(verb: string, result: { done: number; total: number; failed: { path: string; message: string } | null }, where?: string): void {
    const place = where ? ` to ${where}` : '';
    if (!result.failed) {
      new Notice(`${verb} ${formatCount(result.done, 'file')}${place}.`);
      return;
    }
    const left = result.total - result.done;
    new Notice(
      `${verb} ${result.done} of ${result.total} files${place}. Stopped at ${result.failed.path}: ${result.failed.message} The other ${left} ${left === 1 ? 'was' : 'were'} not changed.`,
      10_000,
    );
  }

  // ---- shared ----

  private async chooseFolder(title: string) {
    return new MoveModal(this.app, this.context.settings().assetManager.recentFolders, title).pick();
  }

  private rememberFolder(destination: string): void {
    const settings = this.context.settings();
    const recent = pushRecent(settings.assetManager.recentFolders, destination);
    this.context.updateSettings({ ...settings, assetManager: { ...settings.assetManager, recentFolders: recent } });
  }
}

