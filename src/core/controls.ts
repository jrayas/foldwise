// Maps settings-control keys onto the nested settings object, so the Obsidian settings UI can bind
// flat keys such as "rule:physics:saveTo" to rule data. Pure: no Obsidian dependency.
//
// Keys:  general.<field>            e.g. general.fallbackMode, general.fileType.pdf
//        rule:<id>:<field>          e.g. rule:physics:saveTo, rule:physics:useGeneralNaming
// A rule id may itself contain "." or ":"; the field is whatever follows the last ":".
import { normalisePath } from './paths';
import { THUMBNAIL_DIRECT_KB, THUMBNAIL_LIMIT_MB } from './settings';
import { setOverride, setScopeMode, updateRule } from './ruleEdit';
import type { ConflictMode, FileKind, FoldwiseSettings, FrameSize, Preset, Rule, Scope, SubSort, ViewMode } from './types';

const CONFLICT_MODES: readonly ConflictMode[] = ['auto-number', 'ask', 'cancel'];
const FILE_KINDS: readonly FileKind[] = ['image', 'pdf'];
const SUB_SORTS: readonly SubSort[] = ['none', 'date', 'type'];
const SCOPE_MODES: readonly Scope['mode'][] = ['everything', 'exclude', 'include'];
const FRAME_SIZES: readonly FrameSize[] = ['small', 'medium', 'large'];
const VIEW_MODES: readonly ViewMode[] = ['grid', 'list'];
const FALLBACK_MODES = ['obsidian-default', 'folder'] as const;

const isOneOf = <T extends string>(allowed: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value);
const isNonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

type ParsedKey =
  | { kind: 'general'; field: string }
  | { kind: 'assets'; field: string }
  | { kind: 'thumbs'; field: string }
  | { kind: 'preset'; id: string; field: string } | { kind: 'rule'; id: string; field: string };

function parseKey(key: string): ParsedKey | null {
  if (key.startsWith('general.')) return { kind: 'general', field: key.slice('general.'.length) };
  if (key.startsWith('preset:')) {
    const rest = key.slice('preset:'.length);
    const split = rest.lastIndexOf(':');
    if (split > 0) return { kind: 'preset', id: rest.slice(0, split), field: rest.slice(split + 1) };
  }
  if (key.startsWith('thumbs.')) return { kind: 'thumbs', field: key.slice('thumbs.'.length) };
  if (key.startsWith('assets.')) return { kind: 'assets', field: key.slice('assets.'.length) };
  if (key.startsWith('rule:')) {
    const rest = key.slice('rule:'.length);
    const split = rest.lastIndexOf(':');
    if (split > 0) return { kind: 'rule', id: rest.slice(0, split), field: rest.slice(split + 1) };
  }
  return null;
}

const fileKindOf = (field: string): FileKind | null => {
  const kind = field.startsWith('fileType.') ? field.slice('fileType.'.length) : '';
  return isOneOf(FILE_KINDS, kind) ? kind : null;
};

const withKinds = (current: readonly FileKind[], kind: FileKind, on: boolean): FileKind[] =>
  FILE_KINDS.filter((candidate) => (candidate === kind ? on : current.includes(candidate)));

export function readControl(settings: FoldwiseSettings, key: string): unknown {
  const parsed = parseKey(key);
  if (!parsed) return undefined;
  const { general } = settings;

  if (parsed.kind === 'preset') {
    const preset = settings.presets.find((candidate) => candidate.id === parsed.id);
    if (!preset) return undefined;
    if (parsed.field === 'name') return preset.name;
    return readControl({ ...settings, rules: [asRule(preset)] }, `rule:${PRESET_RULE_ID}:${parsed.field}`);
  }

  if (parsed.kind === 'thumbs') {
    const { thumbnails } = settings;
    switch (parsed.field) {
      case 'enabled': return thumbnails.enabled;
      case 'limitMb': return String(thumbnails.limitMb);
      case 'directBelowKb': return String(thumbnails.directBelowKb);
      default: return undefined;
    }
  }

  if (parsed.kind === 'assets') {
    switch (parsed.field) {
      case 'frameSize': return settings.assetManager.frameSize;
      case 'defaultView': return settings.assetManager.defaultView;
      default: return undefined;
    }
  }

  if (parsed.kind === 'general') {
    const kind = fileKindOf(parsed.field);
    if (kind) return general.fileTypes.includes(kind);
    switch (parsed.field) {
      case 'fallbackMode': return general.fallback.mode;
      case 'fallbackPath': return general.fallback.mode === 'folder' ? general.fallback.path : '';
      case 'namingPattern': return general.namingPattern;
      case 'conflict': return general.conflict;
      default: return undefined;
    }
  }

  const rule = settings.rules.find((candidate) => candidate.id === parsed.id);
  if (!rule) return undefined;
  const { overrides } = rule;
  const kind = fileKindOf(parsed.field);
  if (kind) return (overrides.fileTypes ?? general.fileTypes).includes(kind);
  switch (parsed.field) {
    case 'enabled': return rule.enabled;
    case 'appliesTo': return rule.appliesTo;
    case 'saveTo': return rule.saveTo;
    case 'createIfMissing': return rule.createIfMissing;
    case 'useGeneralNaming': return overrides.namingPattern === undefined;
    case 'namingPattern': return overrides.namingPattern ?? general.namingPattern;
    case 'useGeneralConflict': return overrides.conflict === undefined;
    case 'conflict': return overrides.conflict ?? general.conflict;
    case 'useGeneralFileTypes': return overrides.fileTypes === undefined;
    case 'subSort': return overrides.subSort ?? 'none';
    case 'scopeMode': return rule.scope.mode;
    default: return undefined;
  }
}

function writeGeneral(settings: FoldwiseSettings, field: string, value: unknown): FoldwiseSettings {
  const { general } = settings;
  const withGeneral = (patch: Partial<typeof general>): FoldwiseSettings => ({ ...settings, general: { ...general, ...patch } });

  const kind = fileKindOf(field);
  if (kind) return typeof value === 'boolean' ? withGeneral({ fileTypes: withKinds(general.fileTypes, kind, value) }) : settings;

  switch (field) {
    case 'fallbackMode':
      if (!isOneOf(FALLBACK_MODES, value)) return settings;
      if (value === 'obsidian-default') return withGeneral({ fallback: { mode: 'obsidian-default' } });
      return general.fallback.mode === 'folder' ? settings : withGeneral({ fallback: { mode: 'folder', path: '' } });
    case 'fallbackPath':
      if (typeof value !== 'string' || general.fallback.mode !== 'folder') return settings;
      return withGeneral({ fallback: { mode: 'folder', path: normalisePath(value) } });
    case 'namingPattern':
      return isNonBlank(value) ? withGeneral({ namingPattern: value }) : settings;
    case 'conflict':
      return isOneOf(CONFLICT_MODES, value) ? withGeneral({ conflict: value }) : settings;
    default:
      return settings;
  }
}

function writeAssets(settings: FoldwiseSettings, field: string, value: unknown): FoldwiseSettings {
  const { assetManager } = settings;
  if (field === 'frameSize' && isOneOf(FRAME_SIZES, value)) return { ...settings, assetManager: { ...assetManager, frameSize: value } };
  if (field === 'defaultView' && isOneOf(VIEW_MODES, value)) return { ...settings, assetManager: { ...assetManager, defaultView: value } };
  return settings;
}

/**
 * A preset is edited with the same controls as a rule, so it is viewed as a rule for a moment: the shared
 * logic does the work and only the preset's own fields are copied back.
 */
const PRESET_RULE_ID = 'preset';

function asRule(preset: Preset): Rule {
  return {
    id: PRESET_RULE_ID,
    enabled: true,
    appliesTo: '',
    saveTo: '',
    createIfMissing: true,
    scope: structuredClone(preset.scope ?? { mode: 'everything' }),
    overrides: structuredClone(preset.overrides),
  };
}

function writePreset(settings: FoldwiseSettings, id: string, field: string, value: unknown): FoldwiseSettings {
  const preset = settings.presets.find((candidate) => candidate.id === id);
  if (!preset) return settings;
  let next: Preset;
  if (field === 'name') {
    if (typeof value !== 'string' || value.trim() === '') return settings;
    const taken = settings.presets.some((other) => other.id !== id && other.name.toLowerCase() === value.trim().toLowerCase());
    if (taken) return settings;
    next = { ...preset, name: value.trim() };
  } else {
    const changed = writeControl({ ...settings, rules: [asRule(preset)] }, `rule:${PRESET_RULE_ID}:${field}`, value).rules[0];
    if (!changed) return settings;
    next = { ...preset, overrides: changed.overrides, scope: changed.scope };
  }
  if (JSON.stringify(next) === JSON.stringify(preset)) return settings;
  return { ...settings, presets: settings.presets.map((candidate) => (candidate.id === id ? next : candidate)) };
}

/** Dropdown values arrive as text, so numbers are read from strings too. */
function toNumber(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function writeThumbs(settings: FoldwiseSettings, field: string, value: unknown): FoldwiseSettings {
  const { thumbnails } = settings;
  const withThumbs = (patch: Partial<typeof thumbnails>): FoldwiseSettings => ({ ...settings, thumbnails: { ...thumbnails, ...patch } });
  if (field === 'enabled') return typeof value === 'boolean' ? withThumbs({ enabled: value }) : settings;
  const number = toNumber(value);
  if (number === null) return settings;
  if (field === 'limitMb' && number >= THUMBNAIL_LIMIT_MB.min && number <= THUMBNAIL_LIMIT_MB.max) return withThumbs({ limitMb: Math.round(number) });
  if (field === 'directBelowKb' && number >= THUMBNAIL_DIRECT_KB.min && number <= THUMBNAIL_DIRECT_KB.max) return withThumbs({ directBelowKb: Math.round(number) });
  return settings;
}

function writeRule(settings: FoldwiseSettings, rule: Rule, field: string, value: unknown): Rule {
  const { general } = settings;
  const { overrides } = rule;

  const kind = fileKindOf(field);
  if (kind) {
    if (typeof value !== 'boolean' || overrides.fileTypes === undefined) return rule;
    return setOverride(rule, 'fileTypes', withKinds(overrides.fileTypes, kind, value));
  }

  switch (field) {
    case 'enabled':
      return typeof value === 'boolean' ? { ...rule, enabled: value } : rule;
    case 'createIfMissing':
      return typeof value === 'boolean' ? { ...rule, createIfMissing: value } : rule;
    case 'appliesTo':
      return typeof value === 'string' ? { ...rule, appliesTo: normalisePath(value) } : rule;
    case 'saveTo':
      return typeof value === 'string' ? { ...rule, saveTo: normalisePath(value) } : rule;
    case 'useGeneralNaming':
      if (typeof value !== 'boolean') return rule;
      if (value) return setOverride(rule, 'namingPattern', undefined);
      return overrides.namingPattern === undefined ? setOverride(rule, 'namingPattern', general.namingPattern) : rule;
    case 'namingPattern':
      return overrides.namingPattern !== undefined && isNonBlank(value) ? setOverride(rule, 'namingPattern', value) : rule;
    case 'useGeneralConflict':
      if (typeof value !== 'boolean') return rule;
      if (value) return setOverride(rule, 'conflict', undefined);
      return overrides.conflict === undefined ? setOverride(rule, 'conflict', general.conflict) : rule;
    case 'conflict':
      return overrides.conflict !== undefined && isOneOf(CONFLICT_MODES, value) ? setOverride(rule, 'conflict', value) : rule;
    case 'useGeneralFileTypes':
      if (typeof value !== 'boolean') return rule;
      if (value) return setOverride(rule, 'fileTypes', undefined);
      return overrides.fileTypes === undefined ? setOverride(rule, 'fileTypes', [...general.fileTypes]) : rule;
    case 'subSort':
      if (!isOneOf(SUB_SORTS, value)) return rule;
      return setOverride(rule, 'subSort', value === 'none' ? undefined : value);
    case 'scopeMode':
      return isOneOf(SCOPE_MODES, value) ? { ...rule, scope: setScopeMode(rule.scope, value) } : rule;
    default:
      return rule;
  }
}

/** Returns new settings, or the same object when the key, rule or value is not recognised. */
export function writeControl(settings: FoldwiseSettings, key: string, value: unknown): FoldwiseSettings {
  const parsed = parseKey(key);
  if (!parsed) return settings;
  if (parsed.kind === 'preset') return writePreset(settings, parsed.id, parsed.field, value);
  if (parsed.kind === 'thumbs') return writeThumbs(settings, parsed.field, value);
  if (parsed.kind === 'assets') return writeAssets(settings, parsed.field, value);
  if (parsed.kind === 'general') return writeGeneral(settings, parsed.field, value);

  const rule = settings.rules.find((candidate) => candidate.id === parsed.id);
  if (!rule) return settings;
  const next = writeRule(settings, rule, parsed.field, value);
  return next === rule ? settings : { ...settings, rules: updateRule(settings.rules, rule.id, next) };
}
