import { describe, expect, it } from 'vitest';
import { readControl, writeControl } from '../../src/core/controls';
import type { FoldwiseSettings } from '../../src/core/types';
import { rule, settingsWith } from '../fixtures/exampleVault';

const base = (): FoldwiseSettings => settingsWith([rule('a', 'Physics', 'Physics/Assets'), rule('b', 'Mathematics', 'Mathematics/Assets')]);

describe('General controls', () => {
  it('reads the defaults', () => {
    const s = base();
    expect(readControl(s, 'general.fallbackMode')).toBe('obsidian-default');
    expect(readControl(s, 'general.fallbackPath')).toBe('');
    expect(readControl(s, 'general.namingPattern')).toBe('{note}-{date:YYYYMMDD}-{n}');
    expect(readControl(s, 'general.conflict')).toBe('auto-number');
    expect(readControl(s, 'general.fileType.image')).toBe(true);
    expect(readControl(s, 'general.fileType.pdf')).toBe(true);
  });

  it('switches the fallback to a folder and back', () => {
    let s = writeControl(base(), 'general.fallbackMode', 'folder');
    expect(s.general.fallback).toEqual({ mode: 'folder', path: '' });
    s = writeControl(s, 'general.fallbackPath', '/Inbox\\Files/');
    expect(s.general.fallback).toEqual({ mode: 'folder', path: 'Inbox/Files' });
    expect(readControl(s, 'general.fallbackPath')).toBe('Inbox/Files');
    s = writeControl(s, 'general.fallbackMode', 'obsidian-default');
    expect(s.general.fallback).toEqual({ mode: 'obsidian-default' });
  });

  it('ignores a fallback path while the fallback is Obsidian\'s setting', () => {
    expect(writeControl(base(), 'general.fallbackPath', 'X').general.fallback).toEqual({ mode: 'obsidian-default' });
  });

  it('writes pattern, conflict mode and file types', () => {
    let s = writeControl(base(), 'general.namingPattern', '{note}-{n}');
    s = writeControl(s, 'general.conflict', 'ask');
    s = writeControl(s, 'general.fileType.pdf', false);
    expect(s.general).toMatchObject({ namingPattern: '{note}-{n}', conflict: 'ask', fileTypes: ['image'] });
    s = writeControl(s, 'general.fileType.pdf', true);
    expect(s.general.fileTypes).toEqual(['image', 'pdf']);
  });

  it('ignores invalid values', () => {
    const s = base();
    expect(writeControl(s, 'general.conflict', 'banana')).toBe(s);
    expect(writeControl(s, 'general.namingPattern', 42)).toBe(s);
    expect(writeControl(s, 'general.fallbackMode', 'sideways')).toBe(s);
  });
});

describe('Asset manager controls', () => {
  it('reads and writes the frame size and default view', () => {
    let s = base();
    expect(readControl(s, 'assets.frameSize')).toBe('medium');
    expect(readControl(s, 'assets.defaultView')).toBe('grid');
    s = writeControl(s, 'assets.frameSize', 'large');
    s = writeControl(s, 'assets.defaultView', 'list');
    expect(readControl(s, 'assets.frameSize')).toBe('large');
    expect(readControl(s, 'assets.defaultView')).toBe('list');
  });

  it('ignores unknown values and fields, returning the same object', () => {
    const s = base();
    expect(writeControl(s, 'assets.frameSize', 'huge')).toBe(s);
    expect(writeControl(s, 'assets.defaultView', 5)).toBe(s);
    expect(writeControl(s, 'assets.nothing', 'x')).toBe(s);
    expect(readControl(s, 'assets.nothing')).toBeUndefined();
  });
});

describe('Thumbnail controls', () => {
  it('reads dropdown values as text', () => {
    const s = base();
    expect(readControl(s, 'thumbs.enabled')).toBe(true);
    expect(readControl(s, 'thumbs.limitMb')).toBe('200');
    expect(readControl(s, 'thumbs.directBelowKb')).toBe('100');
  });

  it('writes numbers from text or numbers, within range', () => {
    let s = base();
    s = writeControl(s, 'thumbs.limitMb', '500');
    s = writeControl(s, 'thumbs.directBelowKb', 0);
    s = writeControl(s, 'thumbs.enabled', false);
    expect(s.thumbnails).toEqual({ enabled: false, limitMb: 500, directBelowKb: 0 });
  });

  it('ignores bad values, returning the same object', () => {
    const s = base();
    expect(writeControl(s, 'thumbs.limitMb', '5')).toBe(s);
    expect(writeControl(s, 'thumbs.limitMb', 'lots')).toBe(s);
    expect(writeControl(s, 'thumbs.limitMb', '')).toBe(s);
    expect(writeControl(s, 'thumbs.directBelowKb', 99999)).toBe(s);
    expect(writeControl(s, 'thumbs.enabled', 'on')).toBe(s);
    expect(writeControl(s, 'thumbs.other', 1)).toBe(s);
  });
});

describe('rule controls', () => {
  it('reads and writes the basics, tidying folder paths', () => {
    const original = base();
    let s = writeControl(original, 'rule:a:enabled', false);
    s = writeControl(s, 'rule:a:appliesTo', '/Physics\\Optics/');
    s = writeControl(s, 'rule:a:saveTo', 'Physics/Optics/Pics');
    s = writeControl(s, 'rule:a:createIfMissing', false);
    expect(s.rules[0]).toMatchObject({ enabled: false, appliesTo: 'Physics/Optics', saveTo: 'Physics/Optics/Pics', createIfMissing: false });
    expect(readControl(s, 'rule:a:appliesTo')).toBe('Physics/Optics');
    expect(s.rules[1]).toBe(original.rules[1]);
  });

  it('works for rule ids that contain colons and dots', () => {
    const s = settingsWith([rule('a:b.c', 'X', 'Y')]);
    expect(readControl(s, 'rule:a:b.c:appliesTo')).toBe('X');
    expect(writeControl(s, 'rule:a:b.c:saveTo', 'Z').rules[0]?.saveTo).toBe('Z');
  });

  it('inherits naming from General until overridden, and back again', () => {
    let s = base();
    expect(readControl(s, 'rule:a:useGeneralNaming')).toBe(true);
    expect(readControl(s, 'rule:a:namingPattern')).toBe('{note}-{date:YYYYMMDD}-{n}');

    s = writeControl(s, 'rule:a:useGeneralNaming', false);
    expect(s.rules[0]?.overrides.namingPattern).toBe('{note}-{date:YYYYMMDD}-{n}');
    s = writeControl(s, 'rule:a:namingPattern', 'a-{n}');
    expect(readControl(s, 'rule:a:namingPattern')).toBe('a-{n}');
    expect(readControl(s, 'rule:a:useGeneralNaming')).toBe(false);

    s = writeControl(s, 'rule:a:useGeneralNaming', true);
    expect(s.rules[0]?.overrides).toEqual({});
    expect(readControl(s, 'rule:a:namingPattern')).toBe('{note}-{date:YYYYMMDD}-{n}');
  });

  it('follows a General change while inheriting', () => {
    let s = writeControl(base(), 'general.conflict', 'cancel');
    expect(readControl(s, 'rule:a:conflict')).toBe('cancel');
    s = writeControl(s, 'rule:a:useGeneralConflict', false);
    s = writeControl(s, 'rule:a:conflict', 'ask');
    s = writeControl(s, 'general.conflict', 'auto-number');
    expect(readControl(s, 'rule:a:conflict')).toBe('ask');
  });

  it('does not store a naming value written while inheriting', () => {
    const s = base();
    expect(writeControl(s, 'rule:a:namingPattern', 'x-{n}')).toBe(s);
  });

  it('overrides file types starting from the current effective list', () => {
    let s = writeControl(base(), 'general.fileType.pdf', false);
    expect(readControl(s, 'rule:a:fileType.pdf')).toBe(false);
    s = writeControl(s, 'rule:a:useGeneralFileTypes', false);
    expect(s.rules[0]?.overrides.fileTypes).toEqual(['image']);
    s = writeControl(s, 'rule:a:fileType.pdf', true);
    expect(s.rules[0]?.overrides.fileTypes).toEqual(['image', 'pdf']);
    s = writeControl(s, 'rule:a:useGeneralFileTypes', true);
    expect(s.rules[0]?.overrides.fileTypes).toBeUndefined();
  });

  it('treats sub-sort "none" as the default, so it is not stored', () => {
    let s = writeControl(base(), 'rule:a:subSort', 'date');
    expect(s.rules[0]?.overrides.subSort).toBe('date');
    expect(readControl(s, 'rule:a:subSort')).toBe('date');
    s = writeControl(s, 'rule:a:subSort', 'none');
    expect(s.rules[0]?.overrides.subSort).toBeUndefined();
    expect(readControl(s, 'rule:a:subSort')).toBe('none');
  });

  it('changes the scope mode, keeping folders between exclude and include', () => {
    let s = writeControl(base(), 'rule:a:scopeMode', 'exclude');
    expect(s.rules[0]?.scope).toEqual({ mode: 'exclude', folders: [] });
    s = { ...s, rules: [{ ...s.rules[0]!, scope: { mode: 'exclude', folders: ['Books'] } }, s.rules[1]!] };
    s = writeControl(s, 'rule:a:scopeMode', 'include');
    expect(s.rules[0]?.scope).toEqual({ mode: 'include', folders: ['Books'] });
    expect(readControl(s, 'rule:a:scopeMode')).toBe('include');
  });

  it('leaves settings untouched for an unknown rule, field or key', () => {
    const s = base();
    expect(writeControl(s, 'rule:zzz:enabled', true)).toBe(s);
    expect(writeControl(s, 'rule:a:nonsense', 1)).toBe(s);
    expect(writeControl(s, 'nonsense', 1)).toBe(s);
    expect(readControl(s, 'rule:zzz:enabled')).toBeUndefined();
    expect(readControl(s, 'nonsense')).toBeUndefined();
  });

  it('never changes its input', () => {
    const s = base();
    const copy = structuredClone(s);
    writeControl(s, 'rule:a:useGeneralNaming', false);
    writeControl(s, 'general.fileType.image', false);
    expect(s).toEqual(copy);
  });
});
