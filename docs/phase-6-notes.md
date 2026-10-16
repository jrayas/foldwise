# Phase 6 notes: Used/Unused, saved views, presets, import and export

## What exists
- **Used / Unused filter** ("Used by notes": Any, Used, Unused) on the asset manager page. It uses the usage data from Phase 5. While Obsidian is still reading links the filter waits and the page says "Checking which notes use these files…", so it never shows a wrong answer.
- **Tabs across the top**: All, then one tab per enabled folder rule that has a save-to folder (in rule order, named after the rule's folder), then your pinned views, then "+". A tab shows as active only while the filters match it exactly (typing in the search box makes it a custom filter again), so there is no tab state to get out of step.
- **Pinned views**: "+" pins the current Parent, Subfolder, Type, Used and sort as a named tab (the search text is not kept). Right-click a pinned tab to rename or remove it, or press its ×. If the filters already match a tab, you are told instead of getting a duplicate. The tab strip scrolls sideways when there are many.
- **Presets** (Settings, Presets list): add, rename, delete, and edit with the same controls as a folder rule (naming, conflict, file types, scope). "Apply to folders…" lists your folder rules with ticks and shows exactly what would change in each before anything does; folders that already match are left out. A rule page gets "Apply a preset…", "Save as a preset…" and "Export this rule…".
- **Import and export** (Settings, Import and export): export everything, or one folder rule, as plain JSON with a small header. Copy it to the clipboard or save it as a `.json` file in a vault folder you pick (never overwriting: `…-2.json`). Import from pasted text or a `.json` file in the vault, see what it holds, then **Merge** or **Replace everything**.
- **Right-click a folder, "Open assets for this folder"**: opens (or reuses) the page filtered to that folder and everything under it. For the vault root it shows everything.
- **Pure core** (unit-tested): `savedViews.ts`, `presets.ts`, `exportImport.ts`, the `used` filter in `assetFilter.ts`, and preset controls in `controls.ts`. 388 tests in total.

## Decisions
1. **Presets are copied once** (CLAUDE.md decision 3, over the SPEC's "optionally update every folder"). Editing a preset never changes folders that already received it. "Apply again…" is the preset page's own button.
2. **Applying makes a rule's naming, conflict, file-type and sub-sort settings exactly the preset's**: anything the preset does not set goes back to "inherit from General", and the preview says so. The scope is copied too when the preset has one. Folders, the on/off switch and the id never change.
3. **Merge never changes what is there.** A rule for a folder that already has one is skipped and listed. Presets and views whose names are taken are skipped. Ids are renewed on a clash. General and the other settings stay as they are.
4. **Replace backs up first**, to `data.backup-YYYYMMDD-HHmmss.json` in the plugin folder, and needs a confirmation. Importing that backup undoes the replace (the importer reads a bare settings file too).
5. **Imported text is untrusted.** It goes through the same lenient loader as saved settings. Anything over 5 MB, not JSON, or from a newer schema is refused. Paths in an import are only ever stored as rule folders.
6. **No persisted index.** The scan takes 7 ms per 10,000 files, so the spec's saved index would add code for nothing. Re-check on a slow disk.
7. **Saved views are part of `data.json`** as an extra field, with the schema version still 1. An older Foldwise would drop it on save; nothing is released yet.
8. **Not built:** the SPEC's "auto-create a view per rule" switch (rule tabs are always on), "open in main tab or sidebar", and the embeddable gallery block.

## Measured (10,200-file vault, macOS)
- Changing the Used, Type or folder filter: 8 to 21 ms.
- Rebuilding the usage data after an edit: 20 ms for 10,000 notes with 20 links each (it was 885 ms before I replaced a per-comparison locale sort with one shared collator and sorted each list only when asked for).
- `main.js` 112 KB (was 88 KB).

## Verified in the real app
- Tabs: All and rule tabs appear and disappear as rules change; clicking a tab applies its filters and shows it active; a disabled rule has no tab.
- Used filter against real notes: 4 unused and 2 used files out of 6, correct.
- Pinning (with a suggested name), the duplicate warning, switching away and back, search making the tab inactive, renaming and removing a pinned tab.
- Folder right-click on a new page and an existing one (using a stand-in for the context menu); not shown for files.
- Presets through the real Settings page: add, edit name, naming, scope (with chips) and conflict; apply to two of three folders through the preview modal (the third untouched, folders and on/off unchanged); save a rule as a preset; apply a preset to one rule with the confirmation.
- Export: preview, saved twice into a vault folder with numbering and no overwrite.
- Import from a file in the vault: merge (all three rules skipped because their folders have rules, presets skipped); empty, non-JSON and newer-version text refused; Replace with a smaller setup, confirmation, backup file written, then Replace with the backup text restored the original exactly (the backup equalled the earlier export's data).
- Phone-width: the tab strip scrolls.
- The production files only.

## Not verified
- The real clipboard: "Copy to clipboard" was not pressed (script-driven focus can block it). The file route was tested.
- The native macOS context menus (the pinned-tab menu and the folder item): tested with Obsidian's own menus and a stand-in object.
- Windows, a real phone.
- Dragging tabs to reorder (not built).
- Keyboard and screen-reader use.

## Known rough edges
- Rule tabs are named after the rule's folder, so two rules on the same folder show two tabs with one name.
- An imported rule keeps its on/off setting as exported; check imported rules before pasting.
- Deleting a rule removes its tab immediately; a view pinned for that folder stays.
