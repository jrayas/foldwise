import { describe, expect, it } from 'vitest';
import { checkPattern, formatDate, noteNameOf, renderPattern, sanitiseName } from '../../src/core/naming';
import { DEFAULT_SETTINGS } from '../../src/core/types';

const now = new Date(2026, 9, 16, 14, 5, 9); // 16 Oct 2026, 14:05:09 local time
const defaultPattern = DEFAULT_SETTINGS.general.namingPattern;

describe('formatDate', () => {
  it('formats the supported tokens', () => {
    expect(formatDate(now, 'YYYYMMDD')).toBe('20261016');
    expect(formatDate(now, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-10-16 14:05:09');
    expect(formatDate(now, 'YYYY')).toBe('2026');
  });
  it('zero-pads month, day, hour, minute and second', () => {
    expect(formatDate(new Date(2026, 0, 5, 3, 4, 5), 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-05 03:04:05');
  });
  it('keeps unsupported letters as text', () => {
    expect(formatDate(now, 'YYYY-M-D')).toBe('2026-M-D');
  });
});

describe('noteNameOf', () => {
  it('returns the note name without its extension', () => {
    expect(noteNameOf('Mathematics/Concepts/limits.md')).toBe('limits');
    expect(noteNameOf('a/b.c.md')).toBe('b.c');
    expect(noteNameOf('readme')).toBe('readme');
    expect(noteNameOf('Mathematics\\Books\\calc.md')).toBe('calc');
  });
});

describe('sanitiseName', () => {
  it('leaves ordinary names, spaces and accents alone', () => {
    expect(sanitiseName('Résumé limits 2')).toBe('Résumé limits 2');
  });
  it('replaces each Windows-illegal character with a hyphen', () => {
    for (const bad of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
      expect(sanitiseName(`a${bad}b`)).toBe('a-b');
    }
  });
  it('replaces characters that break Obsidian links', () => {
    expect(sanitiseName('a#b^c[d]e')).toBe('a-b-c-d-e');
  });
  it('collapses a run of illegal characters into one hyphen', () => {
    expect(sanitiseName('a::b')).toBe('a-b');
    expect(sanitiseName('My: note?')).toBe('My- note-');
  });
  it('removes control characters', () => {
    expect(sanitiseName('a\u0000b\tc\u007f')).toBe('abc');
  });
  it('strips trailing dots and spaces and leading dots', () => {
    expect(sanitiseName('note. . ')).toBe('note');
    expect(sanitiseName('.hidden')).toBe('hidden');
  });
  it('protects Windows reserved names', () => {
    expect(sanitiseName('CON')).toBe('CON_');
    expect(sanitiseName('nul')).toBe('nul_');
    expect(sanitiseName('COM1')).toBe('COM1_');
    expect(sanitiseName('con.backup')).toBe('con_.backup');
    expect(sanitiseName('console')).toBe('console');
  });
  it('never returns an empty name', () => {
    expect(sanitiseName('')).toBe('untitled');
    expect(sanitiseName('  ')).toBe('untitled');
    expect(sanitiseName('...')).toBe('untitled');
  });
});

describe('renderPattern', () => {
  it('renders the default pattern', () => {
    const result = renderPattern(defaultPattern, { noteName: 'limits', now, n: 1 });
    expect(result).toEqual({ name: 'limits-20261016-1', warnings: [], usesN: true });
  });
  it('uses the number it is given', () => {
    expect(renderPattern(defaultPattern, { noteName: 'limits', now, n: 3 }).name).toBe('limits-20261016-3');
  });
  it('sanitises the note name', () => {
    expect(renderPattern(defaultPattern, { noteName: 'a/b', now, n: 1 }).name).toBe('a-b-20261016-1');
  });
  it('sanitises the whole result, such as a colon from a time format', () => {
    expect(renderPattern('{note}-{date:HH:mm}', { noteName: 'x', now, n: 1 }).name).toBe('x-14-05');
  });
  it('reports whether the pattern uses {n}', () => {
    expect(renderPattern('{note}-{date:YYYYMMDD}', { noteName: 'x', now, n: 1 }).usesN).toBe(false);
  });
  it('replaces every {n}', () => {
    expect(renderPattern('{n}-{n}', { noteName: 'x', now, n: 2 }).name).toBe('2-2');
  });
  it('shortens a very long note name but keeps the date and counter intact', () => {
    const result = renderPattern(defaultPattern, { noteName: 'x'.repeat(300), now, n: 7 });
    expect(result.name).toBe(`${'x'.repeat(80)}-20261016-7`);
  });
  it('shortens by characters, not by UTF-16 units, and drops a trailing space or dot', () => {
    const result = renderPattern('{note}-{n}', { noteName: `${'é'.repeat(79)} .tail`, now, n: 1 });
    expect(result.name).toBe(`${'é'.repeat(79)}-1`);
    const emoji = renderPattern('{note}', { noteName: '😀'.repeat(100), now, n: 1 });
    expect([...emoji.name]).toHaveLength(80);
  });
  it('does not expand tokens that appear inside a note name', () => {
    expect(renderPattern('{note}', { noteName: '{n}', now, n: 5 }).name).toBe('{n}');
  });
  it('leaves an unknown token in place and warns once', () => {
    const result = renderPattern('{note}-{foo}-{foo}', { noteName: 'limits', now, n: 1 });
    expect(result.name).toBe('limits-{foo}-{foo}');
    expect(result.warnings).toEqual(['Unknown token {foo}.']);
  });
  it('warns when {date} has no format', () => {
    for (const pattern of ['{date}', '{date:}']) {
      const result = renderPattern(pattern, { noteName: 'x', now, n: 1 });
      expect(result.warnings).toEqual([expect.stringContaining('needs a format')]);
    }
  });
  it('warns about unsupported date letters', () => {
    const result = renderPattern('{date:YYYY-M}', { noteName: 'x', now, n: 1 });
    expect(result.name).toBe('2026-M');
    expect(result.warnings).toEqual([expect.stringContaining('Unsupported date letter "M"')]);
  });
});

describe('checkPattern', () => {
  it('accepts the default pattern', () => {
    expect(checkPattern(defaultPattern)).toEqual([]);
  });
  it('warns about an empty pattern', () => {
    expect(checkPattern('')).toEqual([expect.stringContaining('empty')]);
  });
  it('warns when names could repeat', () => {
    expect(checkPattern('{note}')).toEqual([expect.stringContaining('duplicate')]);
    expect(checkPattern('{note}-{date:YYYYMMDD}')).toEqual([expect.stringContaining('duplicate')]);
  });
  it('accepts a pattern made unique by a time with seconds', () => {
    expect(checkPattern('{note}-{date:YYYYMMDDHHmmss}')).toEqual([]);
  });
  it('includes token problems', () => {
    expect(checkPattern('{note}-{foo}-{n}')).toEqual(['Unknown token {foo}.']);
  });
});
