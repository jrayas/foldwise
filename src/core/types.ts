// Data model for Foldwise settings. Plain JSON, no Obsidian dependency.

export type ConflictMode = 'auto-number' | 'ask' | 'cancel';
export type FileKind = 'image' | 'pdf';
export type SubSort = 'none' | 'date' | 'type';
export type SortKey = 'modified' | 'name' | 'size';
export type SortDirection = 'asc' | 'desc';
/** The Used / Unused filter. '' shows everything. */
export type UsedFilter = '' | 'used' | 'unused';

/** Scope folders are relative to the rule's own folder (`exclude: ['Books']` on `Mathematics` means `Mathematics/Books`). */
export type Scope =
  | { mode: 'everything' }
  | { mode: 'exclude'; folders: string[] }
  | { mode: 'include'; folders: string[] };

/** Settings a rule or preset may override. A missing key means "inherit from General". */
export interface Overrides {
  namingPattern?: string;
  conflict?: ConflictMode;
  fileTypes?: FileKind[];
  subSort?: SubSort;
}

export interface Rule {
  id: string;
  enabled: boolean;
  /** Vault-relative folder the rule applies to. "" is the vault root. */
  appliesTo: string;
  saveTo: string;
  createIfMissing: boolean;
  scope: Scope;
  overrides: Overrides;
  /** Display grouping only; never affects routing. */
  group?: string;
}

/** Presets copy their values into a rule once (decision 3); rules never refer back to a preset. */
export interface Preset {
  id: string;
  name: string;
  overrides: Overrides;
  scope?: Scope;
}

export type Fallback = { mode: 'obsidian-default' } | { mode: 'folder'; path: string };

export interface GeneralSettings {
  fallback: Fallback;
  namingPattern: string;
  conflict: ConflictMode;
  fileTypes: FileKind[];
}

export type FrameSize = 'small' | 'medium' | 'large';
export type ViewMode = 'grid' | 'list';

/** Defaults for the Asset Manager page; each open page can change them for itself. */
export interface AssetManagerSettings {
  frameSize: FrameSize;
  defaultView: ViewMode;
  /** Folders last moved to, newest first, for the Move picker. */
  recentFolders: string[];
}

/** Disposable preview images in the plugin's own cache folder. Originals are never touched. */
export interface ThumbnailSettings {
  enabled: boolean;
  /** Cache size limit in megabytes; the oldest previews are removed first. */
  limitMb: number;
  /** Images smaller than this many kilobytes are shown directly, since a preview would save nothing. */
  directBelowKb: number;
}

/** The filters a saved view remembers. The search text is deliberately not kept. */
export interface ViewFilters {
  /** Top-level folder, '/' for files in the vault root, '' for all. */
  parent: string;
  subfolder: string;
  kind: FileKind | '';
  used: UsedFilter;
  sort: SortKey;
  direction: SortDirection;
}

/** A tab the person pinned on the asset manager page. */
export interface SavedView {
  id: string;
  name: string;
  filters: ViewFilters;
}

export interface FoldwiseSettings {
  schemaVersion: 1;
  general: GeneralSettings;
  assetManager: AssetManagerSettings;
  thumbnails: ThumbnailSettings;
  rules: Rule[];
  presets: Preset[];
  views: SavedView[];
}

export const DEFAULT_SETTINGS: FoldwiseSettings = {
  schemaVersion: 1,
  general: {
    fallback: { mode: 'obsidian-default' },
    namingPattern: '{note}-{date:YYYYMMDD}-{n}',
    conflict: 'auto-number',
    fileTypes: ['image', 'pdf'],
  },
  assetManager: { frameSize: 'medium', defaultView: 'grid', recentFolders: [] },
  thumbnails: { enabled: true, limitMb: 200, directBelowKb: 100 },
  rules: [],
  presets: [],
  views: [],
};
