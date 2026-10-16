import type { App } from 'obsidian';
import type { FileKind, FoldwiseSettings } from '../core/types';
import type { SettingsStore } from './store';

export interface TestInput {
  path: string;
  kind: FileKind;
}

/** What the rule page needs from the settings tab. */
export interface RuleFormContext {
  app: App;
  store: SettingsStore;
  readOnly: () => boolean;
  /** Replace the settings, queue a save and refresh the page. */
  apply: (next: FoldwiseSettings) => void;
  update: () => void;
  /** What the user typed into each rule's Test section. Kept in memory only. */
  testInputs: Map<string, TestInput>;
}
