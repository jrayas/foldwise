# Phase 1 notes: rules, routing, fallback, naming, conflicts

Status: complete, pending review. Nothing is committed or pushed.

## What exists
| Area | Files |
|---|---|
| Pure core (no Obsidian import) | `src/core/types.ts`, `paths.ts`, `resolveRule.ts`, `naming.ts`, `conflicts.ts`, `route.ts`, `fileKinds.ts`, `settings.ts` |
| Obsidian adapter | `src/obsidian/paste.ts`, `conflictModal.ts`, `vaultIndex.ts`, `src/settings/store.ts`, `src/main.ts` |
| Tests (154) | `tests/core/*.test.ts`, `tests/fixtures/exampleVault.ts` |
| Dev tooling | `scripts/` (vault, launch, debug), see `.claude/skills/obsidian-cdp-debugging/SKILL.md` |

## Commands
- `npm test`, `npm run lint`, `npm run build`.
- `npm run vault:create` builds `dev/testvault` (the example vault). `npm run dev` builds into its plugin folder.
- `npm run debug:launch [-- --release]` starts an isolated scratch Obsidian. Then `npm run debug -- status | eval "<js>" | reload | paste <note> | screenshot | console | stop`.

## Decisions made (CLAUDE.md left unchanged; move these there if you agree)
1. Scope folders are relative to the rule's own folder (`exclude: ["Books"]` on `Mathematics` means `Mathematics/Books`).
2. A skipped rule (disabled, excluded or not included) keeps the walk going upwards. Disabling `Mathematics/Books` while `Mathematics` excludes Books therefore sends Books notes to the fallback (decision 1).
3. Two enabled rules on one folder: the first in list order wins.
4. `{n}` is a counter (first free number); the conflict mode only applies to patterns without `{n}`.
5. Pattern tokens: `{note}`, `{date:FORMAT}`, `{n}`. Date letters supported: YYYY MM DD HH mm ss (local time). Unknown tokens stay as text and are reported.
6. The `{note}` part is shortened to 80 characters. Illegal characters become `-`; Windows reserved names get a `_`.
7. A fixed fallback folder is created if missing. Rules follow their own "create if missing" setting.
8. Folder matching ignores case; an existing folder's spelling is reused.
9. Paste only (no drag-and-drop yet). A paste carrying `text/html` is left to Obsidian (`LEAVE_RICH_CLIPBOARDS_TO_OBSIDIAN` in `paste.ts`).
10. If any pasted file is not handled (type or rule), the whole paste is left to Obsidian.
11. Settings load leniently: bad pieces are replaced and reported. A corrupt `data.json` is copied to `data.corrupt-<timestamp>.json`. Settings from a newer schema load but are never saved over.
12. `minAppVersion` 1.13.4, `isDesktopOnly` false. Known mismatches from CLAUDE.md settled: v1 handles images and PDFs only; presets copy values once.

## Known gaps and risks
- Real clipboard pastes are untested (only simulated). Please try a real screenshot and a copy from a web page.
- No settings UI yet (Phase 2): rules come from `data.json` in the plugin folder.
- Not tested on Windows or mobile. The Windows Obsidian path in `scripts/lib/env.mjs` is a guess (`OBSIDIAN_BIN` overrides it).
- Obsidian's `loadData()` hides JSON errors, so the store reads `data.json` itself.
- Once, early on, the ask-mode modal did not appear in two runs and could not be reproduced afterwards (10+ later runs fine). Cause unknown.
- `npm audit` reports 3 moderate findings, all inside the lint plugin's nested `moment` (dev only, not bundled).
- No README or LICENSE yet (needed before release).
