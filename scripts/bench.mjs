// Times the pure core on fake records. Usage: npm run bench [-- 10000 100000 500000]
// Bundles the TypeScript with esbuild into the system temp folder, so nothing is written to the project.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const sizes = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
if (sizes.length === 0) sizes.push(10000, 100000, 500000);

const dir = await mkdtemp(join(tmpdir(), 'foldwise-bench-'));
try {
  const outfile = join(dir, 'bench.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./bench-core.ts', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
  });
  const { runBench } = await import(pathToFileURL(outfile).href);
  const rows = runBench(sizes);
  console.log(`Node ${process.version}, ${process.platform}/${process.arch}`);
  console.log('Median and worst of several runs, in milliseconds.\n');
  for (const size of sizes) {
    console.log(`${size.toLocaleString('en-GB')} files`);
    for (const row of rows.filter((r) => r.size === size)) {
      console.log(`  ${row.task.padEnd(40)} median ${row.medianMs.toFixed(1).padStart(8)}   worst ${row.worstMs.toFixed(1).padStart(8)}`);
    }
    console.log('');
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
