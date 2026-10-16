# Pre-release review checklist (2026-10-15)

## Release and repository
- [ ] `npm run build` is the production build (minified, no inline sourcemap) and reproduces the release `main.js`.
- [ ] `npm run lint` passes with `obsidianmd.configs.recommended` (no errors; warnings reviewed).
- [ ] Tag == `manifest.version` (`x.y.z`, no `v`); assets `main.js`, `manifest.json`, optional `styles.css`.
- [ ] Everything the plugin needs at runtime is inside those files.
- [ ] `versions.json` updated; `manifest.json` committed on the default branch.
- [ ] `README.md` explains purpose and usage and discloses: payments, accounts, network use (which services, why), files outside the vault, ads, server-side telemetry (with privacy policy), closed source.
- [ ] `LICENSE` recognised by GitHub; third-party licences respected and attributed.
- [ ] Test files and scripts use names the scanner ignores.

## Manifest
- [ ] id/name/description rules (see manifest-and-release.md); `minAppVersion` accurate; `isDesktopOnly` true only for Node/Electron use; `fundingUrl` only for donations.

## Policies
- [ ] No obfuscation, client-side telemetry, dynamic ads, static ads outside own UI, self-installing/updating code.
- [ ] Not a fork without the original author's public permission (or the documented unreachable-author process).
- [ ] No use of the "Obsidian" trademark that suggests a first-party plugin.

## Code
- [ ] Sample code and placeholder names removed.
- [ ] `this.app`, not global `app`; no `console.log`.
- [ ] No `eval`, `new Function`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`; DOM via `createEl`/`createDiv`/`createSpan`; clear with `el.empty()`.
- [ ] No inline styles, no `<style>`/`<link>`; CSS classes + Obsidian CSS variables in `styles.css`.
- [ ] `requestUrl` not `fetch`; `normalizePath` for paths; `vault.configDir` not `.obsidian`; `fileManager.trashFile` for deletions.
- [ ] Vault API over Adapter API; `vault.process`/`processFrontMatter` for background edits; Editor API for the active note.
- [ ] No API newer than minAppVersion without a literal `requireApiVersion('x.y.z')` guard; no deprecated APIs.
- [ ] `Platform` for OS checks; no regex lookbehind; popout-safe timers/documents.
- [ ] No view instances stored on the plugin; `instanceof` checks on `leaf.view`; no leaf detaching in `onunload`.
- [ ] Commands: correct callback type (`callback`, `checkCallback`, `editorCallback`), no default hotkeys, clean ids/names.

## Settings and UI text
- [ ] minAppVersion ≥ 1.13.0 → `getSettingDefinitions()` only; else `display()`.
- [ ] Sentence case; no top-level heading; headings only with several sections; no "settings" in headings; `setHeading()` not HTML headings.

## Resources and performance
- [ ] All listeners, intervals, workers, Wasm instances, observers and blob URLs released on unload.
- [ ] `onload` light; startup work in `onLayoutReady`; cheap view constructors; debounced event handlers.
- [ ] Tested on desktop and, if not desktop-only, on iOS and Android (or stated as untested).
