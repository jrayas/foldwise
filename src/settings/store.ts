import { normalizePath, Notice, type Plugin } from 'obsidian';
import { defaultSettings, normaliseSettings } from '../core/settings';
import type { FoldwiseSettings } from '../core/types';

/** Loads and saves Foldwise settings as plain JSON in the plugin folder (data.json). */
export class SettingsStore {
  settings: FoldwiseSettings = defaultSettings();
  /** Notes about anything replaced or dropped on the last load. */
  warnings: string[] = [];
  /** True when data.json came from a newer schema; saving is switched off so nothing is lost. */
  readOnly = false;

  private saveTimer: number | null = null;
  private readonly listeners = new Set<() => void>();

  /** Runs whenever the settings change and a save is queued. Returns a function that stops listening. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<void> {
    const read = await this.readRaw();

    if (read.kind === 'unreadable') {
      const backup = await this.keepCopy(read.text);
      this.settings = defaultSettings();
      this.warnings = [
        backup
          ? `data.json could not be read. The defaults are used and a copy was kept as ${backup}.`
          : 'data.json could not be read and the defaults are used.',
      ];
      this.readOnly = false;
      return;
    }

    const loaded = normaliseSettings(read.kind === 'data' ? read.value : null);
    this.settings = loaded.settings;
    this.warnings = loaded.warnings;
    this.readOnly = loaded.fromFutureVersion;
  }

  /** Returns false, and writes nothing, when saving is switched off. */
  async save(): Promise<boolean> {
    if (this.readOnly) return false;
    await this.plugin.saveData(this.settings);
    return true;
  }

  /** Save soon, collapsing a burst of changes (typing, toggling) into one write. */
  queueSave(delayMs = 500): void {
    for (const listener of [...this.listeners]) listener();
    if (this.readOnly) return;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.save().catch(() => new Notice('Foldwise could not save its settings.'));
    }, delayMs);
  }

  /** Write any queued change now. Call when the settings close or the plugin unloads. */
  async flush(): Promise<void> {
    if (this.saveTimer === null) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.save();
  }

  private get dataPath(): string | null {
    const dir = this.plugin.manifest.dir;
    return dir ? normalizePath(`${dir}/data.json`) : null;
  }

  /**
   * Read data.json ourselves rather than with loadData(), which logs a JSON error and returns nothing,
   * making a corrupt file look like a first run.
   */
  private async readRaw(): Promise<{ kind: 'none' } | { kind: 'data'; value: unknown } | { kind: 'unreadable'; text: string | null }> {
    const path = this.dataPath;
    if (!path) {
      const value: unknown = await this.plugin.loadData();
      return value === null || value === undefined ? { kind: 'none' } : { kind: 'data', value };
    }
    const adapter = this.plugin.app.vault.adapter;
    if (!(await adapter.exists(path))) return { kind: 'none' };
    let text: string;
    try {
      text = await adapter.read(path);
    } catch {
      return { kind: 'unreadable', text: null };
    }
    try {
      return { kind: 'data', value: JSON.parse(text) as unknown };
    } catch {
      return { kind: 'unreadable', text };
    }
  }

  /** Keep a copy of an unreadable data.json before anything can overwrite it. Returns the copy's file name. */
  private async keepCopy(text: string | null): Promise<string | null> {
    const dir = this.plugin.manifest.dir;
    if (!dir || text === null) return null;
    const backupName = `data.corrupt-${Date.now()}.json`;
    try {
      await this.plugin.app.vault.adapter.write(normalizePath(`${dir}/${backupName}`), text);
      return backupName;
    } catch {
      return null;
    }
  }
}
