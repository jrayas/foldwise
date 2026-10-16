# Phase 2 notes: master-detail settings, Test section and validation

Status: complete, pending review. Nothing is committed or pushed.

## What exists
| Area | Files |
|---|---|
| Pure logic (all unit-tested) | `src/core/validate.ts`, `summary.ts`, `ruleEdit.ts`, `controls.ts`, `describeRoute.ts`, `relativeTo` in `paths.ts` |
| Settings UI | `src/settings/tab.ts` (tab, General, Folders list), `rulePage.ts` (a rule's page), `scopeEditor.ts`, `testPanel.ts`, `ruleForm.ts` |
| Obsidian helpers | `src/obsidian/folderSuggest.ts`, `confirmModal.ts`, `vaultFacts.ts` |
| Saving | `src/settings/store.ts`: `queueSave()` (debounced) and `flush()`; `main.ts` reloads on `onExternalSettingsChange` |
| Tests | 234 in total (was 154) |

## What the user sees
- **General** (a page): fallback (Obsidian's setting or a fixed folder, with a folder picker), default naming pattern with a live example name, conflict mode, file types.
- **Folders** (a list): search, "+" to add, drag to reorder, delete with confirmation. Each row shows the folder, where it saves, "Off" when disabled, "Custom …" badges, and a warning triangle when validation finds a problem.
- **A rule's page**: a live plain-English summary, then Basics, Naming, Scope, Advanced, Test and "This rule" (duplicate, delete). Warnings appear at the top, with a "Create the folder" button where that fixes it.
- **Inherit or override**: "Use the General …" toggles. Switching one off copies the current General value as a starting point; switching it back on removes the override, so nothing is stored unless it really differs.

## Validation (warnings only; nothing blocks saving)
Both folders blank (new rule) · applies-to folder missing · save-to folder missing with "create if missing" off (with a fix) · scope folder missing · two enabled rules on one folder · save-to folder inside the rule's own excluded area · naming pattern problems (unknown token, can produce duplicate names) · a disabled rule whose parent excludes it (its notes would fall back) · a fixed fallback with no folder chosen.

## Decisions made
1. **Native pages instead of tabs.** Obsidian's declarative settings have no tabs, so the rule page uses headed groups. This keeps search, mobile layout and Back navigation.
2. **No indentation or drag-into-groups for child rules.** Each row shows the folder path instead. The `group` field exists in the data but is not used yet.
3. **A new or duplicated rule starts off**, so it can never capture every paste by accident.
4. **Test section uses the real vault, read-only**, and can show conflicts. It takes a note path and an image or PDF.
5. **Sub-sort is shown but disabled** ("Not available yet"): the data field exists, routing does not use it.
6. **A blank fixed-fallback path is accepted** (the user may not have picked a folder yet): validation warns, and routing leaves pastes to Obsidian until one is chosen.
7. **Pages carry an explicit `id`** (`general`, `rule:<id>`). Obsidian 1.14 logs an error when two pages share a name, which happens when two rules share a folder. `id` works at runtime but is not in the published typings.
8. **After deleting from inside a rule page, the Back button is clicked through its class** (`.setting-page-back-button`), because there is no navigation API. If Obsidian renames it, the user lands on an empty page with a working Back arrow.

## Verified in the real app (scratch Obsidian)
General page controls, live example, hidden/visible rows · list search box, add, duplicate (same-folder copies, no id clash), delete with confirm and cancel · rule page: toggles, folder fields, naming override and example, scope chips add and remove, Test section (empty, excluded, served, PDF, existing file renumbering) · warnings, the "Create the folder" fix, the General fallback warning · saving to `data.json` and reloading · `onReorder` wiring · phone-width layout and Obsidian's mobile emulation · the shipped production files only (35 KB `main.js`, `styles.css` applied) · Phase 1 pasting still works.

## Not verified / known gaps
- **Dragging a row to reorder** was not done through the UI (headless); the callback and the reorder logic are tested.
- **The folder picker's suggestions** (the native `folder` control) were not clicked through; typed values were. The scope chips box has its own suggester, also typed-only in tests.
- **Mobile is emulated only**, and Windows is untested.
- **Settings page uses internal class names** for Back (see decision 8).
- **Presets, Import/Export, Asset Manager and Thumbnails entries** are not in the settings yet (Phases 3 to 6).
- The earlier unexplained missing ask-mode modal remains unexplained. One new fact: modals mount into `activeDocument`, which can be a different window.
