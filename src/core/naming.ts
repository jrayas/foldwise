// File naming. Pure: no Obsidian dependency (so no moment); a small date formatter is included instead.
import { normalisePath } from './paths';

const DATE_TOKENS = ['YYYY', 'MM', 'DD', 'HH', 'mm', 'ss'] as const;
const SUPPORTED_DATE_TEXT = DATE_TOKENS.join(', ');

type DatePart = { kind: 'token'; value: (typeof DATE_TOKENS)[number] } | { kind: 'literal'; value: string };

function splitDateFormat(format: string): DatePart[] {
  const parts: DatePart[] = [];
  let index = 0;
  while (index < format.length) {
    const token = DATE_TOKENS.find((candidate) => format.startsWith(candidate, index));
    if (token) {
      parts.push({ kind: 'token', value: token });
      index += token.length;
    } else {
      parts.push({ kind: 'literal', value: format.charAt(index) });
      index += 1;
    }
  }
  return parts;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** Format a date (local time) using YYYY, MM, DD, HH, mm and ss. Any other character is kept as text. */
export function formatDate(date: Date, format: string): string {
  return splitDateFormat(format)
    .map((part) => {
      if (part.kind === 'literal') return part.value;
      switch (part.value) {
        case 'YYYY': return pad(date.getFullYear(), 4);
        case 'MM': return pad(date.getMonth() + 1);
        case 'DD': return pad(date.getDate());
        case 'HH': return pad(date.getHours());
        case 'mm': return pad(date.getMinutes());
        case 'ss': return pad(date.getSeconds());
      }
    })
    .join('');
}

/** Letters in a date format that are not part of a supported token (likely a mistake, since they print as text). */
function unsupportedDateLetters(format: string): string[] {
  const letters = splitDateFormat(format)
    .filter((part) => part.kind === 'literal' && /[A-Za-z]/.test(part.value))
    .map((part) => part.value);
  return [...new Set(letters)];
}

/** The note's file name without its extension. */
export function noteNameOf(notePath: string): string {
  const parts = normalisePath(notePath).split('/');
  const file = parts[parts.length - 1] ?? '';
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

const ILLEGAL_CHARACTERS = /[\\/:*?"<>|#^[\]]+/g; // Windows-illegal, plus those that break Obsidian links
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i;

/** Make a file name safe on Mac and Windows and in Obsidian links. Never returns an empty string. */
export function sanitiseName(name: string): string {
  const printable = [...name].filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('');
  const cleaned = printable
    .replace(ILLEGAL_CHARACTERS, '-')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');
  if (cleaned === '') return 'untitled';
  return cleaned.replace(RESERVED_WINDOWS_NAME, '$1_');
}

export interface PatternContext {
  /** Note name without extension. */
  noteName: string;
  now: Date;
  /** Value of {n}. Finding a free number is the conflict step's job. */
  n: number;
}

export interface RenderedPattern {
  /** File name without extension. */
  name: string;
  warnings: string[];
  usesN: boolean;
}

const TOKEN = /\{([^{}]*)\}/g;

/** Longest note name used in a file name, leaving room for the date, counter and extension within path limits. */
const MAX_NOTE_NAME_LENGTH = 80;

function shortenNoteName(name: string): string {
  const characters = [...name];
  if (characters.length <= MAX_NOTE_NAME_LENGTH) return name;
  return characters.slice(0, MAX_NOTE_NAME_LENGTH).join('').replace(/[.\s]+$/, '');
}

/** Expand {note}, {date:FORMAT} and {n}. Unknown tokens stay in place and are reported. */
export function renderPattern(pattern: string, context: PatternContext): RenderedPattern {
  const warnings = new Set<string>();
  let usesN = false;

  const rendered = pattern.replace(TOKEN, (whole: string, inner: string) => {
    if (inner === 'note') return shortenNoteName(context.noteName);
    if (inner === 'n') {
      usesN = true;
      return String(context.n);
    }
    if (inner === 'date' || inner === 'date:') {
      warnings.add('The {date} token needs a format, for example {date:YYYYMMDD}.');
      return whole;
    }
    if (inner.startsWith('date:')) {
      const format = inner.slice('date:'.length);
      for (const letter of unsupportedDateLetters(format)) {
        warnings.add(`Unsupported date letter "${letter}" in ${whole}. Supported: ${SUPPORTED_DATE_TEXT}.`);
      }
      return formatDate(context.now, format);
    }
    warnings.add(`Unknown token ${whole}.`);
    return whole;
  });

  return { name: sanitiseName(rendered), warnings: [...warnings], usesN };
}

/** Problems with a pattern, for validation and live previews. An empty list means it looks fine. */
export function checkPattern(pattern: string): string[] {
  if (pattern.trim() === '') return ['The naming pattern is empty.'];
  const { warnings, usesN } = renderPattern(pattern, { noteName: 'note', now: new Date(2000, 0, 1), n: 1 });
  const hasSeconds = /\{date:[^{}]*ss[^{}]*\}/.test(pattern);
  if (!usesN && !hasSeconds) {
    warnings.push('This pattern can produce duplicate names; add {n} or a time with seconds.');
  }
  return warnings;
}
