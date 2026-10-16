# Project: Foldwise (Obsidian plugin)

## How we work (read first)
- Use British English in all comments, docs and UI text.
- ASK ME before writing any code. For each phase: propose a short plan (files, approach, risks), wait for my "go", then implement.
- Work one phase at a time. Stop at the end of each phase with a summary and what to test.
- Must run on Mac and Windows. Use cross-platform paths and scripts, and no shell-specific commands in npm scripts.
- Keep dependencies minimal. Explain any new dependency before adding it.
- Build in TypeScript first. Do not add Rust/WASM until I say so (Phase 7), after measuring.

## Permissions mode
- I start sessions in bypass-permissions mode, so tool prompts will not stop you. The "ASK ME before writing any code" rule above still applies in full: bypass mode is not a "go".
- Still confirm before anything destructive or hard to reverse (deleting files, installing global tools, touching anything outside this project folder or the test vault).

## Skills
- `obsidian-plugin-dev`: invoke it with the Skill tool BEFORE any work on the plugin (scaffold, manifest, esbuild/TypeScript/ESLint setup, settings, custom views, metadata/link APIs, mobile, Web Worker/WASM, release, community-directory review). Follow its guidance for the current Obsidian API (verified for 1.14.x) over your memory.
- If the skill and this file disagree, tell me and let me decide. My phase and approval rules here take precedence.

## Reference
- `docs/SPEC.md` is the full specification (wireframes, per-tab contents, thumbnail rationale). This file is the condensed working version. Read the relevant SPEC section before planning each phase.
- Known mismatches to settle with me: SPEC lists audio/other file types but v1 is images and PDFs only; SPEC lets editing a preset optionally update linked folders but decision 3 says presets are copied once.

## Purpose
A custom Obsidian plugin that does two things:
1. ROUTES pasted files (mainly screenshots) into the correct asset folder using per-folder rules.
2. MANAGES saved assets on one adaptive page: view, filter, move, rename, open the note that uses each file.

## Core concepts
- Folder rule: notes inside folder X save pasted files to asset folder Y.
- Inheritance: a subfolder with no rule follows its nearest parent rule.
- Scope per rule: Everything, Exclude listed subfolders, or Include-only listed subfolders.
- Fallback: when no rule matches, use Obsidian's default attachment setting or a fixed folder.
- Preset: saved bundle of naming and scope settings applied to several folders.
- Single source of truth: one real file per image. Never auto-copy images into the vault.
- Thumbnail cache: small disposable previews in the plugin's own folder, never in the vault.

## Routing logic
1. Paste in a note.
2. Walk up from the note's folder to find the nearest ENABLED rule. None found, use Fallback.
3. Check scope: if the note's path matches the Exclude list, or is missing from the Include-only list, skip this rule and keep walking up.
4. Resolve the file name from the naming pattern (default `{note}-{date:YYYYMMDD}-{n}`).
5. Resolve conflicts (auto-number / ask / cancel). Never silently overwrite.
6. Save to the asset folder, creating it if needed.

The routing logic must be a PURE function (rules + note path in, target folder + name out) with no Obsidian dependency, so it is unit-testable and can later move to WASM.

## Example vault (use for tests)
```
Vault/
├── Mathematics/  RULE → Mathematics/Assets (exclude: Books)
│   └── Books/    RULE → Mathematics/Books/Files
├── Physics/      RULE → Physics/Assets (exclude: Books)
│   └── Books/    RULE → Physics/Books/Files
├── Engineering/  RULE → Engineering/Assets (exclude: Books)
│   └── Books/    RULE → Engineering/Books/Files
└── Inbox/        no rule → Fallback
```

## Settings: master-detail
Level 1 (overview): General, Folders list (one line each: on/off dot, name, target, badges; children indented; search; drag to reorder/group; row actions Duplicate / Apply preset / Disable / Delete), Presets, Asset Manager page, Thumbnails and performance (advanced), Import/Export.

Level 2 (single folder, drill-in page): header with Back, folder name, Enabled toggle, live plain-English summary. Tabs: Basics (applies-to folder, save-to folder, create if missing) · Naming (pattern, live preview, inherit toggle, preset) · Scope (Everything / Exclude / Include only, chips plus picker) · Advanced (sub-sort, file types, conflict override) · Test (enter a note path, see target, final name and reason).

Rules: every setting inherits from General by default and shows an "Overridden" badge only when changed. Folder pickers with autocomplete, never hand-typed paths. Validation on save (missing target, overlapping rules, asset folder inside an excluded area, duplicate-name patterns), with warnings as badges in the list. Settings stored as plain JSON in the plugin folder, with import/export.

## Asset Manager page (one adaptive page, not one per folder)
- Top: saved-view tabs (All, one per folder rule, "+" to pin). Filters: Parent, Subfolder, Type, Used/Unused, name search, Grid/List toggle, selection count.
- Card (identical height so virtual scrolling is exact):
  - Top strip: folder location breadcrumb (each part clickable to filter).
  - Left: file name, then size, type, real dimensions, date, usage.
  - Centre: photo in a STANDARD fixed frame (default 240x160; Small 160x107, Large 360x240). Fit inside, never stretch or crop (crop optional), centred on a neutral background, never upscale small images. Click opens a full-size preview of the original.
  - Right: Rename, Move, Open note stacked top to bottom with generous spacing behind a thin divider.
- Rename: inline edit in place with Save/Cancel. Move: folder picker with recent destinations, cross-folder moves allowed. Open note: opens directly if one note uses it, shows a short list if several, greyed out ("No note uses this") if none. Narrow screens: actions collapse into one "⋯" menu. Bulk move and pattern rename for selections.
- Integrity rule: ALL moves and renames go through Obsidian's file manager API so links update automatically.
- Right-click a folder, then "Open assets for this folder" opens the same page pre-filtered.

## Thumbnails
Link to the original, show a cached preview. Never copy originals. Previews are about 2x the frame size, stored in the plugin's cache folder, generated lazily when a card scrolls into view (default 4 at once, fewer on mobile) with a placeholder first. Cache key = path + size + modified date; re-key on rename/move. Originals under about 100 KB render directly. PDFs show an icon, with a preview on request. Cache size limit (default 200 MB, oldest removed first), a Clear cache button, and clearing never touches originals.

## Performance plan
Virtual scrolling with fixed card height · lightweight metadata index (path, name, size, date, type; no file contents) · incremental index updates from vault events (refresh one card, not the page) · lazy "used in" map from Obsidian's link data · debounced search/filters (~200 ms) · batched moves with progress and one refresh at the end · persisted index loaded after layout is ready · test against a synthetic vault of 10,000 images from Phase 3.

## Architecture
- TypeScript main thread: Obsidian API calls, settings UI, virtual list rendering, move/rename execution, vault events.
- Later, Rust/WASM in a Web Worker (Phase 7 only, if measurements justify it): thumbnails, search over the index, rule matching, bulk-rename patterns.

## Safety
Never move existing files unless I trigger "Apply to existing files" (preview first). Never overwrite silently. Deleting a rule never deletes files. Disabled rules are kept but ignored.

## Decisions (defaults, change if I say so)
1. Excluded folders with no rule of their own: use Fallback.
2. Asset folder may live outside the folder it serves (cross-folder allowed).
3. Presets: copy values once (not linked) in v1.
4. v1 file types: images and PDFs.
5. Image fit: fit inside the frame.

## Out of scope for v1
Tagging/metadata on images, duplicate detection, cloud sync, per-image notes, OCR.

## Phases
1. Rules, routing, fallback, naming, conflict handling.
2. Master-detail settings with Test tab and validation.
3. Asset Manager page: index, virtual card list, standard frame, filters.
4. Thumbnail cache.
5. Move and rename (link-safe).
6. Used/Unused, saved views, presets, import/export.
7. Rust/WASM worker for proven bottlenecks.

## Your first task
Do NOT write code yet. Do this:
1. Propose the project setup (Obsidian plugin scaffold, TypeScript, bundler, test runner, lint, cross-platform scripts for Mac and Windows, dev workflow to test in a local test vault).
2. Propose the folder structure and the data model (rule, scope, preset, settings JSON schema).
3. Outline Phase 1 as a step-by-step plan with the unit tests you would write first, using the example vault above.
4. List any questions or risks, then wait for my go.
