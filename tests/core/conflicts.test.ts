import { describe, expect, it } from 'vitest';
import { chooseFileName, type NameRequest } from '../../src/core/conflicts';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { existsIn } from '../fixtures/exampleVault';

const now = new Date(2026, 9, 16, 14, 5, 9);
const defaultPattern = DEFAULT_SETTINGS.general.namingPattern;
const folder = 'Mathematics/Assets';

function request(overrides: Partial<NameRequest> = {}): NameRequest {
  return {
    pattern: defaultPattern,
    noteName: 'limits',
    ext: 'png',
    folder,
    now,
    mode: 'auto-number',
    exists: existsIn(),
    ...overrides,
  };
}

const taken = (name: string) => `${folder}/${name}`;

describe('pattern with {n}: the counter finds the first free number', () => {
  it('uses 1 when nothing exists', () => {
    expect(chooseFileName(request())).toEqual({ kind: 'free', fileName: 'limits-20261016-1.png', warnings: [] });
  });
  it('skips numbers that are taken', () => {
    const exists = existsIn(taken('limits-20261016-1.png'), taken('limits-20261016-2.png'));
    expect(chooseFileName(request({ exists }))).toMatchObject({ kind: 'free', fileName: 'limits-20261016-3.png' });
  });
  it('takes the first gap', () => {
    const exists = existsIn(taken('limits-20261016-1.png'), taken('limits-20261016-3.png'));
    expect(chooseFileName(request({ exists }))).toMatchObject({ fileName: 'limits-20261016-2.png' });
  });
  it('ignores the conflict mode, because the counter avoids the clash', () => {
    const exists = existsIn(taken('limits-20261016-1.png'));
    for (const mode of ['auto-number', 'ask', 'cancel'] as const) {
      expect(chooseFileName(request({ exists, mode }))).toMatchObject({ kind: 'free', fileName: 'limits-20261016-2.png' });
    }
  });
});

describe('pattern without {n}', () => {
  const pattern = '{note}-{date:YYYYMMDDHHmmss}';
  const base = 'limits-20261016140509';

  it('uses the plain name when it is free', () => {
    expect(chooseFileName(request({ pattern }))).toMatchObject({ kind: 'free', fileName: `${base}.png` });
  });

  it('auto-number appends -2, then -3', () => {
    const one = existsIn(taken(`${base}.png`));
    expect(chooseFileName(request({ pattern, exists: one }))).toMatchObject({ fileName: `${base}-2.png` });
    const two = existsIn(taken(`${base}.png`), taken(`${base}-2.png`));
    expect(chooseFileName(request({ pattern, exists: two }))).toMatchObject({ fileName: `${base}-3.png` });
  });

  it('cancel stops and names the file in the way', () => {
    const exists = existsIn(taken(`${base}.png`));
    expect(chooseFileName(request({ pattern, exists, mode: 'cancel' }))).toMatchObject({
      kind: 'cancelled',
      conflictWith: taken(`${base}.png`),
    });
  });

  it('ask returns the clash and a free suggestion', () => {
    const exists = existsIn(taken(`${base}.png`), taken(`${base}-2.png`));
    expect(chooseFileName(request({ pattern, exists, mode: 'ask' }))).toEqual({
      kind: 'conflict',
      conflictWith: taken(`${base}.png`),
      suggestedFileName: `${base}-3.png`,
      warnings: [],
    });
  });

  it('does not treat a free name as a conflict in any mode', () => {
    for (const mode of ['auto-number', 'ask', 'cancel'] as const) {
      expect(chooseFileName(request({ pattern, mode })).kind).toBe('free');
    }
  });
});

describe('paths and extensions', () => {
  it('checks the full vault-relative path', () => {
    const checked: string[] = [];
    chooseFileName(request({ exists: (path) => (checked.push(path), false) }));
    expect(checked).toEqual(['Mathematics/Assets/limits-20261016-1.png']);
  });
  it('checks a bare name for the vault root', () => {
    const checked: string[] = [];
    chooseFileName(request({ folder: '', exists: (path) => (checked.push(path), false) }));
    expect(checked).toEqual(['limits-20261016-1.png']);
  });
  it('compares case-insensitively', () => {
    const exists = existsIn('MATHEMATICS/assets/LIMITS-20261016-1.PNG');
    expect(chooseFileName(request({ exists }))).toMatchObject({ fileName: 'limits-20261016-2.png' });
  });
  it('accepts an extension with a leading dot, or none', () => {
    expect(chooseFileName(request({ ext: '.png' }))).toMatchObject({ fileName: 'limits-20261016-1.png' });
    expect(chooseFileName(request({ ext: '' }))).toMatchObject({ fileName: 'limits-20261016-1' });
  });
});

describe('warnings and limits', () => {
  it('passes pattern warnings through', () => {
    const result = chooseFileName(request({ pattern: '{note}-{foo}-{n}' }));
    expect(result.warnings).toEqual(['Unknown token {foo}.']);
  });
  it('gives up rather than loop forever when every name is taken', () => {
    for (const pattern of [defaultPattern, '{note}']) {
      for (const mode of ['auto-number', 'ask'] as const) {
        const result = chooseFileName(request({ pattern, mode, exists: () => true }));
        expect(result.kind).toBe('cancelled');
        expect(result.kind === 'cancelled' && result.reason).toContain('No free file name');
      }
    }
  });
});

// A seeded random check of the safety rule: a result never points at a file that already exists.
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('never overwrites (seeded random cases)', () => {
  const names = [
    ...Array.from({ length: 8 }, (_, i) => `limits-20261016-${i + 1}.png`),
    'limits-20261016.png', 'limits-20261016-2.png', 'limits-20261016-3.png',
    'limits.png', 'limits-2.png', 'limits-3.png', 'limits-4.png',
  ];
  const patterns = [defaultPattern, '{note}-{date:YYYYMMDD}', '{note}'];
  const modes = ['auto-number', 'ask', 'cancel'] as const;

  it('holds for 1000 random folders, patterns and modes', () => {
    const random = seededRandom(20261016);
    for (let round = 0; round < 1000; round++) {
      const existing = names.filter(() => random() < 0.5).map(taken);
      const exists = existsIn(...existing);
      const pattern = patterns[Math.floor(random() * patterns.length)]!;
      const mode = modes[Math.floor(random() * modes.length)]!;
      const result = chooseFileName(request({ pattern, mode, exists }));

      if (result.kind === 'free') {
        expect(exists(taken(result.fileName))).toBe(false);
      } else if (result.kind === 'conflict') {
        expect(mode).toBe('ask');
        expect(exists(result.conflictWith)).toBe(true);
        expect(exists(taken(result.suggestedFileName))).toBe(false);
      } else {
        expect(mode).toBe('cancel');
        expect(exists(result.conflictWith!)).toBe(true);
      }
    }
  });
});
