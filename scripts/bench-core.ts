// Benchmarks for the pure core, run by scripts/bench.mjs. Fake records only: no vault and no Obsidian.
import { AssetIndex, makeRecord, type AssetRecord } from '../src/core/assetIndex';
import { DEFAULT_QUERY, queryAssets, type AssetQuery } from '../src/core/assetFilter';
import { previewBulkRename } from '../src/core/bulkRename';
import { resolveRule } from '../src/core/resolveRule';
import { UsageMap, type ResolvedLinks } from '../src/core/usage';
import type { Rule } from '../src/core/types';

export interface BenchRow {
  size: number;
  task: string;
  medianMs: number;
  worstMs: number;
}

/** Same numbers every run, so two runs compare fairly. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function fakeRecords(count: number): AssetRecord[] {
  const rand = random(7);
  const records: AssetRecord[] = [];
  for (let i = 0; i < count; i++) {
    const top = `Folder ${Math.floor(rand() * 60)}`;
    const sub = `Assets/Part ${Math.floor(rand() * 12)}`;
    const pdf = rand() < 0.1;
    const name = `${pdf ? 'Paper' : 'Screenshot'} ${i} ${Math.floor(rand() * 1e6).toString(36)}.${pdf ? 'pdf' : 'png'}`;
    records.push(makeRecord(`${top}/${sub}/${name}`, pdf ? 'pdf' : 'png', pdf ? 'pdf' : 'image', Math.floor(rand() * 4e6), 1.6e12 + Math.floor(rand() * 1e10)));
  }
  return records;
}

function fakeLinks(records: AssetRecord[], notes: number): ResolvedLinks {
  const rand = random(11);
  const links: ResolvedLinks = {};
  for (let n = 0; n < notes; n++) {
    const targets: Record<string, number> = {};
    for (let k = 0; k < 4; k++) targets[records[Math.floor(rand() * records.length)].path] = 1;
    links[`Folder ${n % 60}/Note ${n}.md`] = targets;
  }
  return links;
}

function fakeRules(count: number): Rule[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    enabled: true,
    appliesTo: `Folder ${i}`,
    saveTo: `Folder ${i}/Assets`,
    createIfMissing: true,
    scope: { mode: 'exclude' as const, folders: ['Books'] },
    overrides: {},
  }));
}

function time(task: string, size: number, runs: number, work: () => unknown): BenchRow {
  work(); // warm up, so the first run's compilation is not counted
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    work();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { size, task, medianMs: times[Math.floor(times.length / 2)], worstMs: times[times.length - 1] };
}

export function runBench(sizes: number[]): BenchRow[] {
  const rows: BenchRow[] = [];
  for (const size of sizes) {
    const records = fakeRecords(size);
    const runs = size >= 500000 ? 5 : 15;
    const query = (patch: Partial<AssetQuery>): AssetQuery => ({ ...DEFAULT_QUERY, ...patch });
    const index = new AssetIndex();
    rows.push(time('index build (load)', size, runs, () => new AssetIndex().load(records)));
    index.load(records);

    rows.push(time('filter: sort by modified', size, runs, () => queryAssets(records, query({}))));
    rows.push(time('filter: sort by size', size, runs, () => queryAssets(records, query({ sort: 'size' }))));
    rows.push(time('filter: search "screenshot 1"', size, runs, () => queryAssets(records, query({ search: 'screenshot 1', sort: 'size' }))));
    rows.push(time('filter: one parent + type', size, runs, () => queryAssets(records, query({ parent: 'Folder 7', kind: 'image', sort: 'size' }))));
    rows.push(time('filter: sort by name', size, Math.min(runs, 5), () => queryAssets(records, query({ sort: 'name', direction: 'asc' }))));

    const links = fakeLinks(records, Math.max(1000, Math.floor(size / 2)));
    const isAsset = (path: string) => /\.(png|pdf)$/.test(path);
    rows.push(time('usage map rebuild', size, runs, () => new UsageMap().rebuild(links, isAsset)));
    const usage = new UsageMap();
    usage.rebuild(links, isAsset);
    rows.push(time('filter: Unused + sort by size', size, runs, () => queryAssets(records, query({ used: 'unused', sort: 'size' }), usage)));

    const rules = fakeRules(60);
    const notes = Object.keys(links).slice(0, 2000);
    rows.push(time('rule matching, 2000 notes x 60 rules', size, runs, () => notes.forEach((note) => resolveRule(rules, note))));

    const selection = records.slice(0, Math.min(size, 5000)).map((record) => ({ path: record.path, mtime: record.mtime }));
    rows.push(time('bulk rename preview, 5000 files', size, runs, () => previewBulkRename(selection, '{folder}-{date:YYYYMMDD}-{n:4}', () => false)));
  }
  return rows;
}
