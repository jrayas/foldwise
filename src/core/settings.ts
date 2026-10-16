// Turns untrusted saved JSON into valid settings. Pure: no Obsidian dependency.
// Lenient by design: a bad piece is replaced or dropped and reported, never a reason to lose everything.
import { normalisePath } from './paths';
import { MAX_RECENT_FOLDERS, pushRecent } from './recentFolders';
import {
  DEFAULT_SETTINGS,
  type AssetManagerSettings,
  type ConflictMode,
  type Fallback,
  type FileKind,
  type FoldwiseSettings,
  type FrameSize,
  type GeneralSettings,
  type Overrides,
  type Preset,
  type Rule,
  type Scope,
  type SavedView,
  type ViewFilters,
  type SubSort,
  type ThumbnailSettings,
  type ViewMode,
} from './types';

export const CURRENT_SCHEMA_VERSION = 1;

/** Upgrades data saved at one schema version to the next. Receives a copy, so it may change it freely. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version to migrate FROM. Empty until schema 2 exists. */
export const MIGRATIONS: Record<number, Migration> = {};

export interface LoadedSettings {
  settings: FoldwiseSettings;
  /** Plain-English notes about anything replaced or dropped. Empty when the data was clean. */
  warnings: string[];
  /** The data came from a newer schema than this plugin knows. The caller should not save over it. */
  fromFutureVersion: boolean;
}

/** A fresh copy of the defaults, safe to change. */
export function defaultSettings(): FoldwiseSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

const CONFLICT_MODES: readonly ConflictMode[] = ['auto-number', 'ask', 'cancel'];
const FILE_KINDS: readonly FileKind[] = ['image', 'pdf'];
const SUB_SORTS: readonly SubSort[] = ['none', 'date', 'type'];
const FRAME_SIZES: readonly FrameSize[] = ['small', 'medium', 'large'];
const VIEW_MODES: readonly ViewMode[] = ['grid', 'list'];

type Warnings = string[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonBlankString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** A list of file kinds with unknown entries dropped, or null (and a warning) when it is not a list. */
function parseFileTypes(value: unknown, label: string, warnings: Warnings): FileKind[] | null {
  if (!Array.isArray(value)) {
    warnings.push(`${label}: file types must be a list, so the setting was ignored.`);
    return null;
  }
  const kinds = [...new Set(value.filter((entry): entry is FileKind => oneOf(FILE_KINDS, entry)))];
  const unknown = value.filter((entry) => !oneOf(FILE_KINDS, entry));
  if (unknown.length > 0) {
    warnings.push(`${label}: unknown file types ${unknown.map((entry) => JSON.stringify(entry)).join(', ')} were dropped.`);
  }
  return kinds;
}

function parseFallback(value: unknown, warnings: Warnings): Fallback {
  if (value === undefined) return { ...DEFAULT_SETTINGS.general.fallback };
  if (isRecord(value)) {
    if (value.mode === 'obsidian-default') return { mode: 'obsidian-default' };
    // A blank path is kept: the user may have chosen "a fixed folder" without picking one yet. Validation
    // flags it, and routing leaves pastes to Obsidian until a folder is chosen.
    if (value.mode === 'folder' && typeof value.path === 'string') {
      return { mode: 'folder', path: normalisePath(value.path) };
    }
  }
  warnings.push('General: the fallback setting was not valid, so Obsidian\'s own attachment setting is used.');
  return { ...DEFAULT_SETTINGS.general.fallback };
}

function parseGeneral(value: unknown, warnings: Warnings): GeneralSettings {
  const defaults = DEFAULT_SETTINGS.general;
  if (value === undefined) return structuredClone(defaults);
  if (!isRecord(value)) {
    warnings.push('General settings were not valid, so the defaults are used.');
    return structuredClone(defaults);
  }

  let namingPattern = defaults.namingPattern;
  if (value.namingPattern !== undefined) {
    if (isNonBlankString(value.namingPattern)) namingPattern = value.namingPattern;
    else warnings.push('General: the naming pattern was not valid, so the default is used.');
  }

  let conflict = defaults.conflict;
  if (value.conflict !== undefined) {
    if (oneOf(CONFLICT_MODES, value.conflict)) conflict = value.conflict;
    else warnings.push('General: the conflict setting was not valid, so the default is used.');
  }

  let fileTypes = [...defaults.fileTypes];
  if (value.fileTypes !== undefined) {
    fileTypes = parseFileTypes(value.fileTypes, 'General', warnings) ?? fileTypes;
  }

  return { fallback: parseFallback(value.fallback, warnings), namingPattern, conflict, fileTypes };
}

function parseAssetManager(value: unknown, warnings: Warnings): AssetManagerSettings {
  const defaults = DEFAULT_SETTINGS.assetManager;
  if (value === undefined) return structuredClone(defaults);
  if (!isRecord(value)) {
    warnings.push('Asset Manager settings were not valid, so the defaults are used.');
    return structuredClone(defaults);
  }
  let { frameSize, defaultView } = defaults;
  let recentFolders: string[] = [];
  if (value.recentFolders !== undefined) {
    if (Array.isArray(value.recentFolders)) {
      const folders = value.recentFolders.filter((entry): entry is string => typeof entry === 'string');
      // The list is newest first, so add the oldest first and let pushRecent put each newer one in front.
      recentFolders = [...folders].reverse().reduce<string[]>((list, folder) => pushRecent(list, folder, MAX_RECENT_FOLDERS), []);
    } else warnings.push('Asset Manager: the recent folders were not a list, so they were cleared.');
  }
  if (value.frameSize !== undefined) {
    if (oneOf(FRAME_SIZES, value.frameSize)) frameSize = value.frameSize;
    else warnings.push('Asset Manager: the frame size was not valid, so the default is used.');
  }
  if (value.defaultView !== undefined) {
    if (oneOf(VIEW_MODES, value.defaultView)) defaultView = value.defaultView;
    else warnings.push('Asset Manager: the default view was not valid, so the default is used.');
  }
  return { frameSize, defaultView, recentFolders };
}

/** Allowed ranges, shared with the settings controls. */
export const THUMBNAIL_LIMIT_MB = { min: 10, max: 10_000 };
export const THUMBNAIL_DIRECT_KB = { min: 0, max: 5_000 };

const inRange = (value: unknown, range: { min: number; max: number }): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;

function parseThumbnails(value: unknown, warnings: Warnings): ThumbnailSettings {
  const defaults = DEFAULT_SETTINGS.thumbnails;
  if (value === undefined) return { ...defaults };
  if (!isRecord(value)) {
    warnings.push('Thumbnail settings were not valid, so the defaults are used.');
    return { ...defaults };
  }
  let { enabled, limitMb, directBelowKb } = defaults;
  if (value.enabled !== undefined) {
    if (typeof value.enabled === 'boolean') enabled = value.enabled;
    else warnings.push('Thumbnails: "enabled" was not true or false, so it is on.');
  }
  if (value.limitMb !== undefined) {
    if (inRange(value.limitMb, THUMBNAIL_LIMIT_MB)) limitMb = Math.round(value.limitMb);
    else warnings.push('Thumbnails: the cache size limit was not valid, so the default is used.');
  }
  if (value.directBelowKb !== undefined) {
    if (inRange(value.directBelowKb, THUMBNAIL_DIRECT_KB)) directBelowKb = Math.round(value.directBelowKb);
    else warnings.push('Thumbnails: the "show originals below" size was not valid, so the default is used.');
  }
  return { enabled, limitMb, directBelowKb };
}

function parseOverrides(value: unknown, label: string, warnings: Warnings): Overrides {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    warnings.push(`${label}: overrides were not valid and were ignored.`);
    return {};
  }
  const overrides: Overrides = {};
  if (value.namingPattern !== undefined) {
    if (isNonBlankString(value.namingPattern)) overrides.namingPattern = value.namingPattern;
    else warnings.push(`${label}: the naming pattern override was not valid and was ignored.`);
  }
  if (value.conflict !== undefined) {
    if (oneOf(CONFLICT_MODES, value.conflict)) overrides.conflict = value.conflict;
    else warnings.push(`${label}: the conflict override was not valid and was ignored.`);
  }
  if (value.fileTypes !== undefined) {
    const kinds = parseFileTypes(value.fileTypes, label, warnings);
    if (kinds) overrides.fileTypes = kinds;
  }
  if (value.subSort !== undefined) {
    if (oneOf(SUB_SORTS, value.subSort)) overrides.subSort = value.subSort;
    else warnings.push(`${label}: the sub-sort override was not valid and was ignored.`);
  }
  return overrides;
}

/** Undefined stays undefined (not set). An invalid scope becomes "everything", with a warning. */
function parseScope(value: unknown, label: string, warnings: Warnings): Scope | undefined {
  if (value === undefined) return undefined;
  const everything: Scope = { mode: 'everything' };
  if (!isRecord(value)) {
    warnings.push(`${label}: the scope was not valid, so it was reset to everything.`);
    return everything;
  }
  if (value.mode === 'everything') return everything;
  if ((value.mode === 'exclude' || value.mode === 'include') && Array.isArray(value.folders)) {
    const strings = value.folders.filter((entry): entry is string => typeof entry === 'string');
    if (strings.length !== value.folders.length) {
      warnings.push(`${label}: scope folders that were not text were dropped.`);
    }
    return { mode: value.mode, folders: [...new Set(strings.map(normalisePath))] };
  }
  warnings.push(`${label}: the scope was not valid, so it was reset to everything.`);
  return everything;
}

function uniqueId(id: string, used: Set<string>, label: string, warnings: Warnings): string {
  if (!used.has(id)) return id;
  let n = 2;
  while (used.has(`${id}-${n}`)) n++;
  const renamed = `${id}-${n}`;
  warnings.push(`${label}: the id "${id}" was already used, so it was renamed to "${renamed}".`);
  return renamed;
}

function parseRules(value: unknown, warnings: Warnings): Rule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push('Rules were not a list, so none were loaded.');
    return [];
  }
  const rules: Rule[] = [];
  const usedIds = new Set<string>();

  value.forEach((entry: unknown, index) => {
    const label = `Rule ${index + 1}`;
    if (!isRecord(entry)) {
      warnings.push(`${label} was not valid and was dropped.`);
      return;
    }
    if (!isNonBlankString(entry.id)) {
      warnings.push(`${label} has no id and was dropped.`);
      return;
    }
    if (typeof entry.appliesTo !== 'string' || typeof entry.saveTo !== 'string') {
      warnings.push(`${label} ("${entry.id}") is missing its folder or save-to folder and was dropped.`);
      return;
    }

    const id = uniqueId(entry.id, usedIds, label, warnings);
    usedIds.add(id);

    let createIfMissing = true;
    if (entry.createIfMissing !== undefined) {
      if (typeof entry.createIfMissing === 'boolean') createIfMissing = entry.createIfMissing;
      else warnings.push(`${label}: "create if missing" was not true or false, so it is on.`);
    }
    let enabled = true;
    if (entry.enabled !== undefined) {
      if (typeof entry.enabled === 'boolean') enabled = entry.enabled;
      else warnings.push(`${label}: "enabled" was not true or false, so it is on.`);
    }

    const rule: Rule = {
      id,
      enabled,
      appliesTo: normalisePath(entry.appliesTo),
      saveTo: normalisePath(entry.saveTo),
      createIfMissing,
      scope: parseScope(entry.scope, label, warnings) ?? { mode: 'everything' },
      overrides: parseOverrides(entry.overrides, label, warnings),
    };
    if (isNonBlankString(entry.group)) rule.group = entry.group;
    rules.push(rule);
  });
  return rules;
}

function parsePresets(value: unknown, warnings: Warnings): Preset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push('Presets were not a list, so none were loaded.');
    return [];
  }
  const presets: Preset[] = [];
  const usedIds = new Set<string>();

  value.forEach((entry: unknown, index) => {
    const label = `Preset ${index + 1}`;
    if (!isRecord(entry) || !isNonBlankString(entry.id) || !isNonBlankString(entry.name)) {
      warnings.push(`${label} needs an id and a name and was dropped.`);
      return;
    }
    const id = uniqueId(entry.id, usedIds, label, warnings);
    usedIds.add(id);
    const preset: Preset = { id, name: entry.name, overrides: parseOverrides(entry.overrides, label, warnings) };
    const scope = parseScope(entry.scope, label, warnings);
    if (scope) preset.scope = scope;
    presets.push(preset);
  });
  return presets;
}

const SORT_KEYS = ['modified', 'name', 'size'] as const;
const DIRECTIONS = ['asc', 'desc'] as const;
const USED_FILTERS = ['', 'used', 'unused'] as const;
const KIND_FILTERS = ['', 'image', 'pdf'] as const;
export const MAX_SAVED_VIEWS = 50;

function parseFilters(value: unknown): ViewFilters {
  const raw = isRecord(value) ? value : {};
  return {
    parent: typeof raw.parent === 'string' ? raw.parent : '',
    subfolder: typeof raw.subfolder === 'string' ? normalisePath(raw.subfolder) : '',
    kind: oneOf(KIND_FILTERS, raw.kind) ? raw.kind : '',
    used: oneOf(USED_FILTERS, raw.used) ? raw.used : '',
    sort: oneOf(SORT_KEYS, raw.sort) ? raw.sort : 'modified',
    direction: oneOf(DIRECTIONS, raw.direction) ? raw.direction : 'desc',
  };
}

function parseViews(value: unknown, warnings: Warnings): SavedView[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push('Saved views were not a list, so none were loaded.');
    return [];
  }
  const views: SavedView[] = [];
  const usedIds = new Set<string>();
  let capped = false;
  value.forEach((entry: unknown, index) => {
    const label = `Saved view ${index + 1}`;
    if (!isRecord(entry) || !isNonBlankString(entry.id) || !isNonBlankString(entry.name)) {
      warnings.push(`${label} needs an id and a name and was dropped.`);
      return;
    }
    if (views.length >= MAX_SAVED_VIEWS) {
      if (!capped) warnings.push(`Only the first ${MAX_SAVED_VIEWS} saved views are kept.`);
      capped = true;
      return;
    }
    const id = uniqueId(entry.id, usedIds, label, warnings);
    usedIds.add(id);
    views.push({ id, name: entry.name.trim(), filters: parseFilters(entry.filters) });
  });
  return views;
}

function readVersion(data: Record<string, unknown>, warnings: Warnings): number {
  if (data.schemaVersion === undefined) return CURRENT_SCHEMA_VERSION;
  const version = data.schemaVersion;
  if (typeof version === 'number' && Number.isInteger(version) && version >= 0) return version;
  warnings.push(`The saved schema version is not valid, so version ${CURRENT_SCHEMA_VERSION} is assumed.`);
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Validate and migrate saved data. Missing data (first run) is silent; anything wrong is reported in
 * `warnings`. The input is never changed and the result never shares objects with it.
 */
export function normaliseSettings(raw: unknown, migrations: Record<number, Migration> = MIGRATIONS): LoadedSettings {
  const warnings: Warnings = [];
  if (raw === null || raw === undefined) return { settings: defaultSettings(), warnings, fromFutureVersion: false };
  if (!isRecord(raw)) {
    warnings.push('Saved settings were not readable, so the defaults are used.');
    return { settings: defaultSettings(), warnings, fromFutureVersion: false };
  }

  let data = raw;
  let version = readVersion(data, warnings);
  let fromFutureVersion = false;

  if (version > CURRENT_SCHEMA_VERSION) {
    fromFutureVersion = true;
    warnings.push(
      `Settings were saved by a newer version of Foldwise (schema ${version}). They are loaded as far as possible and will not be overwritten.`,
    );
  } else {
    while (version < CURRENT_SCHEMA_VERSION) {
      const step = migrations[version];
      if (!step) {
        warnings.push(`No migration from settings version ${version}; loading as far as possible.`);
        break;
      }
      data = step(structuredClone(data));
      version += 1;
    }
  }

  const settings: FoldwiseSettings = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    general: parseGeneral(data.general, warnings),
    assetManager: parseAssetManager(data.assetManager, warnings),
    thumbnails: parseThumbnails(data.thumbnails, warnings),
    rules: parseRules(data.rules, warnings),
    presets: parsePresets(data.presets, warnings),
    views: parseViews(data.views, warnings),
  };
  return { settings, warnings, fromFutureVersion };
}
