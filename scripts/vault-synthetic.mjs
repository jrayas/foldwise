// Builds a large synthetic vault for performance testing: 10,000 images (and some PDFs) spread over the
// example folders, with varied sizes and dates. Output: dev/synthetic (git-ignored).
// Usage: node scripts/vault-synthetic.mjs [count] [--large N]
//   --large N  also add N realistic multi-megabyte screenshots (1 to 4 MB each) in a "Large" folder
import { mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomFillSync } from 'node:crypto';
import { root, isInside } from './lib/env.mjs';

const args = process.argv.slice(2);
const largeAt = args.indexOf('--large');
const large = largeAt >= 0 ? Number(args[largeAt + 1] ?? 200) : 0;
const count = Number(args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--large') ?? 10_000);
const out = path.join(root, 'dev', 'synthetic');
if (!isInside(out, root)) throw new Error('Refusing to write outside the project.');

// Minimal PNG encoder (8-bit RGB), so no image library is needed.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
function png(width, height, seed, noise) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);
    rows[start] = 0;
    for (let x = 0; x < width; x++) {
      const i = start + 1 + x * 3;
      const edge = x < 6 || y < 6 || x > width - 7 || y > height - 7;
      rows[i] = edge ? 40 : Math.floor((x * 8) / width) * 32;
      rows[i + 1] = edge ? 40 : Math.floor((y * 8) / height) * 32;
      rows[i + 2] = edge ? 40 : (seed * 37) % 255;
      if (noise && random() < noise) rows[i] = random() * 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A big, hard-to-compress picture: a share of the rows is random noise, like a busy real screenshot.
function bigPng(width, height, noisyShare) {
  const stride = width * 3 + 1;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const start = y * stride;
    if ((y * 2654435761) % 1000 < noisyShare * 1000) randomFillSync(rows, start + 1, stride - 1);
    else for (let x = 0; x < width; x++) rows.fill(Math.floor((x * 8) / width) * 32, start + 1 + x * 3, start + 4 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

// Mostly small files, a few large noisy ones: about 40 KB on average, so 10,000 files stay near 400 MB.
const variants = [
  [480, 300, 0], [640, 400, 0.004], [800, 500, 0.001], [300, 300, 0], [1200, 800, 0.003],
  [1920, 1080, 0.002], [200, 120, 0], [480, 300, 0.002], [96, 96, 0], [640, 360, 0.001],
].map(([w, h, n], i) => png(w, h, i + 1, n));
console.log('Variant sizes (KB):', variants.map((v) => Math.round(v.length / 1024)).join(', '));
const pdf = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const folders = [
  ['Mathematics/Assets/Diagrams', 18], ['Mathematics/Assets/Screenshots', 22], ['Mathematics/Books/Files', 6],
  ['Physics/Assets', 20], ['Physics/Books/Files', 4], ['Engineering/Assets', 20], ['Engineering/Books/Files', 4], ['Inbox', 6],
];
const weight = folders.reduce((sum, [, w]) => sum + w, 0);

await rm(out, { recursive: true, force: true });
for (const [folder] of folders) await mkdir(path.join(out, folder), { recursive: true });
await mkdir(path.join(out, '.obsidian'), { recursive: true });
await writeFile(path.join(out, '.obsidian', 'community-plugins.json'), JSON.stringify(['foldwise']));
await writeFile(path.join(out, 'readme.md'), '# Synthetic vault\n');

const now = Date.now();
const year = 365 * 24 * 3600 * 1000;
let written = 0;
for (let i = 0; i < count; i++) {
  let pick = (i * 7919) % weight;
  const [folder] = folders.find(([, w]) => (pick -= w) < 0) ?? folders[0];
  const isPdf = i % 100 === 99;
  const name = isPdf ? `document-${i}.pdf` : `Screenshot ${String(i).padStart(5, '0')}.png`;
  const file = path.join(out, folder, name);
  await writeFile(file, isPdf ? pdf : variants[i % variants.length]);
  const time = new Date(now - ((i * 104729) % year));
  await utimes(file, time, time);
  written++;
}
if (large > 0) {
  await mkdir(path.join(out, 'Large'), { recursive: true });
  const bigs = [[1024, 640, 0.5], [1280, 720, 0.8], [1600, 900, 1], [1280, 720, 1], [1920, 1080, 0.5]].map(([w, h, n]) => bigPng(w, h, n));
  console.log('Large variant sizes (MB):', bigs.map((b) => (b.length / 1048576).toFixed(1)).join(', '));
  for (let i = 0; i < large; i++) {
    const file = path.join(out, 'Large', `Big screenshot ${String(i).padStart(4, '0')}.png`);
    await writeFile(file, bigs[i % bigs.length]);
    const time = new Date(now - ((i * 7919) % year));
    await utimes(file, time, time);
  }
  written += large;
}
console.log(`Synthetic vault ready: ${out} (${written} files)`);
