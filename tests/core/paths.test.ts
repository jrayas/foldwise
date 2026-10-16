import { describe, expect, it } from 'vitest';
import { ancestorsOf, folderOf, isInside, joinPath, normalisePath, relativeTo, samePath } from '../../src/core/paths';

describe('normalisePath', () => {
  it('converts backslashes and trims slashes', () => {
    expect(normalisePath('Mathematics\\Books\\')).toBe('Mathematics/Books');
    expect(normalisePath('/Mathematics//Books/')).toBe('Mathematics/Books');
    expect(normalisePath('./Physics')).toBe('Physics');
  });
  it('treats empty and root as the vault root', () => {
    expect(normalisePath('')).toBe('');
    expect(normalisePath('/')).toBe('');
    expect(normalisePath('.')).toBe('');
  });
});

describe('folderOf', () => {
  it('returns the parent folder of a note path', () => {
    expect(folderOf('Mathematics/Concepts/limits.md')).toBe('Mathematics/Concepts');
    expect(folderOf('Inbox/idea.md')).toBe('Inbox');
  });
  it('returns the root for a note at the vault root', () => {
    expect(folderOf('readme.md')).toBe('');
  });
  it('accepts Windows-style separators', () => {
    expect(folderOf('Mathematics\\Books\\calc.md')).toBe('Mathematics/Books');
  });
});

describe('ancestorsOf', () => {
  it('lists the folder then each parent, nearest first, ending at the root', () => {
    expect(ancestorsOf('Mathematics/Books/Deep')).toEqual([
      'Mathematics/Books/Deep',
      'Mathematics/Books',
      'Mathematics',
      '',
    ]);
  });
  it('returns just the root for the root', () => {
    expect(ancestorsOf('')).toEqual(['']);
  });
});

describe('samePath', () => {
  it('ignores case and separator style', () => {
    expect(samePath('Mathematics/Books', 'mathematics\\books\\')).toBe(true);
    expect(samePath('Maths', 'Mathematics')).toBe(false);
  });
});

describe('isInside', () => {
  it('is true for the folder itself and for descendants', () => {
    expect(isInside('Mathematics', 'Mathematics')).toBe(true);
    expect(isInside('Mathematics/Books/Deep', 'Mathematics')).toBe(true);
  });
  it('does not match on a shared prefix only', () => {
    expect(isInside('Mathematics2/x', 'Mathematics')).toBe(false);
    expect(isInside('Maths', 'Mathematics')).toBe(false);
  });
  it('treats the vault root as containing everything', () => {
    expect(isInside('Inbox', '')).toBe(true);
    expect(isInside('', '')).toBe(true);
  });
  it('is case-insensitive and separator-agnostic', () => {
    expect(isInside('mathematics\\BOOKS\\x', 'Mathematics/Books')).toBe(true);
  });
});

describe('joinPath', () => {
  it('joins and normalises, ignoring empty parts', () => {
    expect(joinPath('Mathematics', 'Books')).toBe('Mathematics/Books');
    expect(joinPath('', 'Books')).toBe('Books');
    expect(joinPath('/Mathematics/', '\\Books\\')).toBe('Mathematics/Books');
    expect(joinPath('', '')).toBe('');
  });
});

describe('relativeTo', () => {
  it('returns the part of a folder below an ancestor', () => {
    expect(relativeTo('Mathematics', 'Mathematics/Books')).toBe('Books');
    expect(relativeTo('Mathematics', 'Mathematics/Books/Deep')).toBe('Books/Deep');
  });
  it('returns an empty string for the folder itself', () => {
    expect(relativeTo('Mathematics', 'Mathematics')).toBe('');
  });
  it('returns null for a folder outside the ancestor', () => {
    expect(relativeTo('Mathematics', 'Physics/Books')).toBeNull();
    expect(relativeTo('Mathematics', 'Mathematics2/x')).toBeNull();
  });
  it('measures from the vault root when the ancestor is the root', () => {
    expect(relativeTo('', 'Physics/Books')).toBe('Physics/Books');
  });
  it('ignores case in the ancestor but keeps the picked spelling', () => {
    expect(relativeTo('mathematics', 'Mathematics/Books')).toBe('Books');
    expect(relativeTo('MATHEMATICS', 'mathematics\\Books')).toBe('Books');
  });
});
