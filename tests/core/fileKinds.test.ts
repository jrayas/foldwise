import { describe, expect, it } from 'vitest';
import { classifyFile } from '../../src/core/fileKinds';

describe('classifyFile', () => {
  it.each([
    ['image.png', 'image/png', 'png', 'image'],
    ['PHOTO.JPG', 'image/jpeg', 'jpg', 'image'],
    ['scan.jpeg', '', 'jpeg', 'image'],
    ['anim.gif', 'image/gif', 'gif', 'image'],
    ['pic.webp', 'image/webp', 'webp', 'image'],
    ['vector.svg', 'image/svg+xml', 'svg', 'image'],
    ['paper.pdf', 'application/pdf', 'pdf', 'pdf'],
    ['Paper.PDF', '', 'pdf', 'pdf'],
  ])('classifies %s (%s) as %s %s', (name, type, ext, kind) => {
    expect(classifyFile({ name, type })).toEqual({ ext, kind });
  });

  it('falls back to the MIME type when the name has no usable extension', () => {
    expect(classifyFile({ name: 'image', type: 'image/png' })).toEqual({ ext: 'png', kind: 'image' });
    expect(classifyFile({ name: '', type: 'image/jpeg' })).toEqual({ ext: 'jpg', kind: 'image' });
    expect(classifyFile({ name: 'download.bin', type: 'application/pdf' })).toEqual({ ext: 'pdf', kind: 'pdf' });
  });

  it('prefers a recognised extension over the MIME type', () => {
    expect(classifyFile({ name: 'a.png', type: 'image/jpeg' })).toEqual({ ext: 'png', kind: 'image' });
  });

  it.each([
    ['notes.txt', 'text/plain'],
    ['archive.tar.gz', 'application/gzip'],
    ['movie.mp4', 'video/mp4'],
    ['song.mp3', 'audio/mpeg'],
    ['noext', ''],
    ['', ''],
  ])('does not handle %s (%s)', (name, type) => {
    expect(classifyFile({ name, type })).toBeNull();
  });
});
