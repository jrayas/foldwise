import esbuild from 'esbuild';
import process from 'node:process';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';

const prod = process.argv[2] === 'production';
const pluginId = 'foldwise';

// In dev mode the three release files go straight into the test vault's plugin folder.
const outDir = prod ? '.' : path.join('dev', 'testvault', '.obsidian', 'plugins', pluginId);

const copyStaticFiles = {
  name: 'copy-static-files',
  setup(build) {
    build.onEnd(async () => {
      if (prod) return;
      await mkdir(outDir, { recursive: true });
      for (const file of ['manifest.json', 'styles.css']) {
        await copyFile(file, path.join(outDir, file));
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtinModules,
  ],
  format: 'cjs',
  target: 'es2021',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: path.join(outDir, 'main.js'),
  minify: prod,
  plugins: [copyStaticFiles],
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
