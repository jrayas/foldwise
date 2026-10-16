// Decides whether a pasted file is one Foldwise handles (v1: images and PDFs). Pure.
import type { FileKind } from './types';

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  svg: 'image',
  avif: 'image',
  pdf: 'pdf',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

export interface ClassifiedFile {
  /** Lower-case extension without the dot. */
  ext: string;
  kind: FileKind;
}

/** A recognised file extension wins; otherwise the MIME type decides. Null means "not ours". */
export function classifyFile(file: { name: string; type: string }): ClassifiedFile | null {
  const dot = file.name.lastIndexOf('.');
  const nameExt = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  const fromName = KIND_BY_EXTENSION[nameExt];
  if (fromName) return { ext: nameExt, kind: fromName };

  const mimeExt = EXTENSION_BY_MIME[file.type.toLowerCase()];
  const fromMime = mimeExt ? KIND_BY_EXTENSION[mimeExt] : undefined;
  return mimeExt && fromMime ? { ext: mimeExt, kind: fromMime } : null;
}
