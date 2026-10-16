---
name: obsidian-plugin-dev
description: Build, lint, release and submit an Obsidian community plugin against the current Obsidian API (verified 2026-10-15 for Obsidian 1.14.x). Use when creating a new Obsidian plugin, adding views/settings/commands to one, preparing a release, fixing community-directory review errors, or checking mobile, Web Worker or WebAssembly compatibility. Covers manifest rules, esbuild/TypeScript/ESLint setup, declarative settings (1.13+), custom views, metadata/link APIs, deprecations and the review checklist.
---

# Obsidian plugin development guide

Verified against primary sources on **2026-10-15**. Snapshot:

| Item | Value |
|---|---|
| Obsidian stable | 1.14.4 desktop + Android; iOS App Store 1.14.5 |
| `obsidian` npm typings | 1.14.4 |
| First public build with declarative settings | 1.13.4 |
| Template | github.com/obsidianmd/obsidian-sample-plugin (0BSD) |
| Linter | eslint-plugin-obsidianmd 0.4.2 (`recommended`) |
| Submission | community.obsidian.md (automated review) |

## Step 0: is this snapshot still current?
If today is more than 30 days after the date above, or the user names a newer Obsidian version, re-check before relying on version numbers (the rules rarely change, versions do):

```sh
curl -s https://registry.npmjs.org/obsidian | python3 -c "import sys,json;print(json.load(sys.stdin)['dist-tags'])"
curl -s https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json | head -3
curl -s https://registry.npmjs.org/eslint-plugin-obsidianmd | python3 -c "import sys,json;print(json.load(sys.stdin)['dist-tags'])"
```
Then skim https://obsidian.md/changelog/ "Developers" sections since the snapshot, and grep the new `obsidian.d.ts` for `@since` and `@deprecated` tags (the npm CHANGELOG.md is stale since 1.7.2). Tell the user which facts you re-verified.

## Golden rules
1. Users receive **only** `main.js`, `manifest.json` and optional `styles.css` from a GitHub release whose tag equals `manifest.version`. Bundle everything else (workers, Wasm, assets) into `main.js`.
2. Every API must exist in the installed `obsidian.d.ts` with `@since` ≤ your `minAppVersion`, or be inside a literal `if (requireApiVersion('x.y.z'))` guard (the linter understands only that form, ternaries and `&&`).
3. No Node.js/Electron APIs unless `isDesktopOnly: true`.
4. Clean up everything you create (`registerEvent`, `registerDomEvent`, `registerInterval`, `register`, child `Component`s; terminate workers; free Wasm).
5. Keep `onload` cheap; do startup work in `workspace.onLayoutReady`; keep view constructors cheap (views are deferred since 1.7.2).
6. Run `npm run lint` with `obsidianmd.configs.recommended` before every release; the directory runs the same checks.
7. No obfuscation, telemetry, remote code, self-updating, `eval`/`new Function`, `innerHTML`, inline styles, or `<style>`/`<link>` elements.
8. UI text in sentence case; no top-level settings heading; no "settings" in headings.

## Workflow
1. **Scaffold** from the sample plugin; rename `MyPlugin`, `SampleSettingTab` etc.; delete all sample code (lint errors otherwise). See [reference/build-and-lint.md](reference/build-and-lint.md).
2. **Manifest**: follow [reference/manifest-and-release.md](reference/manifest-and-release.md) (id/name/description rules are strict).
3. **Choose minAppVersion**: use the newest version whose APIs you need; if unsure, latest stable. If ≥ 1.13.0 use declarative settings only.
4. **Write features** using [reference/api-cheatsheet.md](reference/api-cheatsheet.md) (views, settings, commands, metadata/links, events, deprecations).
5. **Mobile, workers, Wasm**: [reference/mobile-workers-wasm.md](reference/mobile-workers-wasm.md).
6. **Pre-release check**: [reference/review-checklist.md](reference/review-checklist.md).
7. **Release** with the sample's GitHub Action (tag = version, no `v`), then **submit** at community.obsidian.md. Fix automated-review errors by publishing a new release.

## Evidence discipline
State whether a claim is from official docs/typings (verified), third-party (secondary) or unverified. Never claim something works on mobile without testing on a device or `app.emulateMobile(true)`; say "untested" otherwise.

## Key sources
- Developer docs: https://docs.obsidian.md (source: github.com/obsidianmd/obsidian-developer-docs, `en/`)
- API typings: https://github.com/obsidianmd/obsidian-api
- Policies: https://docs.obsidian.md/Developer+policies
- Submission requirements: https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Review FAQ: https://docs.obsidian.md/Community+directory/Frequently+asked+questions
- ESLint plugin: https://github.com/obsidianmd/eslint-plugin
