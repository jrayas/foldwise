# Build and lint setup (verified 2026-10-15)

Based on obsidianmd/obsidian-sample-plugin (0BSD), with versions pinned from the npm registry on 2026-10-15.

## Compatible version set
| Package | Version | Constraint |
|---|---|---|
| obsidian | 1.14.4 | typings; set to the newest, your minAppVersion governs usage |
| typescript | 5.9.3 | typescript-eslint 8.71.2 supports `>=4.8.4 <6.1.0` — **not TS 7** |
| esbuild | 0.28.2 (sample pins 0.25.5) | |
| eslint, @eslint/js | 9.39.4 | eslint-plugin-obsidianmd needs `@eslint/js ^9.30.1` — **not ESLint 10** |
| typescript-eslint | 8.71.2 | |
| eslint-plugin-obsidianmd | 0.4.2 | declares an exact peer `obsidian: 1.8.7`; npm 10 dry-run still resolves with obsidian 1.14.4 |
| globals, jiti, @types/node | as in sample | jiti lets ESLint load `eslint.config.mts` |

## package.json scripts
```json
"type": "module",
"scripts": {
  "dev": "node esbuild.config.mjs",
  "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
  "version": "node version-bump.mjs && git add manifest.json versions.json",
  "lint": "eslint ."
}
```

## esbuild.config.mjs (essentials)
```js
import esbuild from 'esbuild';
import process from 'process';
import { builtinModules } from 'node:module';

const prod = process.argv[2] === 'production';
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron',
    '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands',
    '@codemirror/language', '@codemirror/lint', '@codemirror/search',
    '@codemirror/state', '@codemirror/view',
    '@lezer/common', '@lezer/highlight', '@lezer/lr', ...builtinModules],
  format: 'cjs',
  target: 'es2021',          // iOS 15.x WebKit: keep es2021
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
});
if (prod) { await context.rebuild(); process.exit(0); } else { await context.watch(); }
```

## tsconfig.json (sample)
`module: ESNext`, `target: ES2021`, `strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `moduleResolution: node`, `isolatedModules`, `skipLibCheck`, `lib: ["ES2021", "DOM"]`, `include: ["src/**/*.ts"]`.

## eslint.config.mts
```ts
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
  globalIgnores(['node_modules', 'dist', 'esbuild.config.mjs', 'version-bump.mjs',
    'versions.json', 'main.js', 'package.json', 'package-lock.json', 'tsconfig.json']),
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mts', 'manifest.json'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
);
```

## What `recommended` enforces (E = error, W = warning)
- Obsidian rules: `no-sample-code` E, `sample-names` E, `detach-leaves` E, `no-forbidden-elements` (`<style>`, `<link>`) E, `no-static-styles-assignment` E, `platform` (no navigator OS sniffing) E, `regex-lookbehind` E, `no-plugin-as-component` E, `no-view-references-in-plugin` E, `no-unsupported-api` E, settings-heading rules E; `require-display` W (minAppVersion < 1.13), `no-deprecated-display` W and `prefer-update-over-display` W (≥ 1.13), `prefer-setting-definitions` W, `ui/sentence-case` W, `validate-manifest` W, `validate-license` W, `vault/iterate` W, `no-tfile-tfolder-cast` W, `object-assign` W, `prefer-window-timers` W, `no-global-this` W, `prefer-create-el` W, `prefer-instanceof` W, `prefer-file-manager-trash-file` W, `hardcoded-config-path` W, `no-nodejs-modules` W (off when desktop-only), command naming rules W.
- General: `no-eval` E, `no-implied-eval` E, Function constructor E, `no-console` E except `warn`/`error`/`debug`, `no-unsanitized/*` E, `@microsoft/sdl/no-inner-html` W, `no-restricted-globals` W (`app`, `fetch` → `requestUrl`, `localStorage` → `app.saveLocalStorage`), restricted imports W (axios, got, ky, node-fetch, superagent, ofetch; `moment` → import from `obsidian`), `@typescript-eslint/no-deprecated` W, `no-explicit-any` W, typescript-eslint `recommendedTypeChecked`.
- package.json: `depend/ban-dependencies` E (native/micro-utility/preferred presets).
- Disable comments: must have a description, must be paired, cannot disable `obsidianmd/*`, `no-console`, `no-eval`, `no-restricted-globals`, `no-deprecated`, `no-explicit-any`, `no-inner-html`, `no-nodejs-modules`, `no-alert`, restricted imports. Unused disables are errors.
