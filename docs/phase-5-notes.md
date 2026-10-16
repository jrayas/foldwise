# Phase 5 notes: link-safe rename and move

## What exists
- **Rename** (inline, on the card): the name becomes a text box with Save and Cancel (Enter and Escape work too). The extension is shown and stays as it is. Problems are shown as you type and Save is disabled until the name is fine.
- **Move**: a folder picker with your eight most recent destinations first (tagged "recent"), then every folder, with fuzzy search. Moving between top-level folders works.
- **Open note**: opens the note directly when one note uses the file, shows a list of notes when several do, and is greyed out ("No note uses this") when none do. It is also greyed out, "Checking which notes use this…", until Obsidian has read the links.
- **Used**: each card shows "1 note", "3 notes" or "No notes". Built from Obsidian's link data, in about 20 ms for 10,000 notes with 20 links each, and rebuilt a second after links change.
- **Selection**: a tick box on each card, Shift-click for a range, and a bar with "Select all in this view", "Move…", "Rename…" and "Clear". Selecting all 10,200 files took 53 ms.
- **Bulk move**: pick the folder, confirm (the message says how many files get a number added), then a progress bar. Clashes get -2, -3 quietly; nothing is overwritten.
- **Bulk rename**: a pattern with `{name}`, `{n}` or `{n:3}` (zero-padded counter), `{date:YYYYMMDD}` (the file's modified date) and `{folder}`. Every new name is previewed first. Files that cannot be renamed (invalid, name taken, two files given one name) are skipped with the reason shown; the rest go ahead.
- **Pure core** (unit-tested): `renamePlan.ts`, `bulkRename.ts`, `usage.ts`, `recentFolders.ts`, `conflictMode.ts`. 332 tests in total.
- **One place makes the changes**: `src/obsidian/fileOps.ts` calls Obsidian's `fileManager.renameFile`, so Obsidian rewrites the links. Foldwise never edits note text. Batches run in groups of 10 with a 30 ms pause, and stop at the first failure.

## Decisions
1. **The extension never changes.** Typing a different recognised extension (`.jpg` on a `.png`) is refused: renaming does not convert a file. (My plan said "warn"; refusing is safer.)
2. **Rename conflicts follow the conflict mode** of the rule whose save-to folder holds the file (deepest wins), else General: add a number, ask, or cancel. Move always asks when one file clashes; a bulk move numbers quietly.
3. **Typed names are rejected, not quietly corrected**: no `\ / : * ? " < > | # ^ [ ]`, no leading or trailing dot, no Windows reserved names, no control characters, at most 200 characters.
4. **A name that differs only in capitals** (`slope.png` to `Slope.png`) is done in two steps through a temporary name, because Mac and Windows file systems can refuse it in one. Links are rewritten twice and end correct. No temporary file was left behind.
5. **Recent folders** are kept in `data.json` (eight, newest first, without duplicates).
6. **Selection is dropped for files that no longer exist**, and cleared after a bulk operation.
7. **No undo.** The confirmation says so.

## An important finding: "update internal links" can be off
In my scratch vault Obsidian's setting **Files and links, "Automatically update internal links" was OFF** (I had to switch it on in the test vault; I did not check whether a brand-new vault always starts that way). With it off, `renameFile` does not rewrite links, and renaming a used file breaks them. Foldwise checks the setting before renaming or moving files that notes use, and asks first ("Links will not update", with "Rename anyway" or "Move anyway"). It never changes your setting. Worth knowing before you test: if you see the warning, that is why.
This reads an internal Obsidian setting (`vault.getConfig('alwaysUpdateLinks')`) that is not in the published typings. If it ever goes missing, Foldwise assumes links update and skips the warning.

## Verified in the real app
- Rename through the card: validation messages, wrong extension refused, Escape cancels, Enter saves; links in a note updated for `![[x.png]]`, `[[x.png]]`, `![[x.png|300]]` and `![](path/x.png)`; the card, the usage count and the preview followed.
- Capitals-only rename (one file left, links correct).
- Conflicts in all three modes: add a number, ask (accept and cancel), cancel; no file overwritten.
- Move: the picker, recents first, dismissing does nothing, a clash asks and numbers on accept; links followed for a file used by two notes.
- Open note: one note opens it, two notes show a list, none is greyed out. (With Obsidian's DOM menus; see below.)
- Selection, Shift range, Select all, bulk rename of 30 files (links followed), bulk move of 3 files with one clash, and a batch that fails in the middle stopping there and reporting it, with the later files untouched.
- The "links will not update" warning with Cancel, and no prompt for an unused file.
- On the 10,200-file vault: renaming 200 large files took 1.1 s; the 92 cached previews were kept, not regenerated, and the cards still loaded from the cache.
- The production files only (88 KB `main.js`).

## Not verified
- **Native macOS menus.** Obsidian uses native menus on macOS by default and they are not in the page, so I tested the "⋯" menu and the several-notes list with `nativeMenus` switched off. The code path is the same `Menu` API, but I have not seen the native version.
- Windows, a real phone, and a case-sensitive file system (Linux) for capitals-only renames.
- Real clipboard and real mouse drags (events were sent from script).
- Keyboard-only use and screen readers.
- Links inside canvases and in properties (front matter): Obsidian's link data is what Foldwise uses, so "Used" only counts what Obsidian reports for notes.
- Renaming or moving while another sync tool is busy.

## Known rough edges
- Bulk rename numbers files in the order the page shows them (so sort first).
- Files that fall outside the current filter stay selected; the bar counts them.
- A bulk move onto a name that exists renames the incoming file (-2), and says how many in the confirmation, but not which.
