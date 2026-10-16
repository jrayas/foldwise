# Phase 3 notes: Asset Manager page

## What exists
- **Index** (`src/core/assetIndex.ts`, `src/obsidian/assetIndexer.ts`): path, name, folder, extension, type, size and modified date for every image and PDF. No file contents are read. It is built once after `onLayoutReady` and follows `create`, `modify`, `delete` and `rename` events, including whole-folder renames and deletes. Hidden folders are skipped.
- **Filtering** (`src/core/assetFilter.ts`): Parent (top-level folder), Subfolder (below the parent, including its children), Type, name search (about 200 ms debounce) and sort by date, name (natural order, so "shot 2" precedes "shot 10") or size, in either direction.
- **Virtual list** (`src/core/virtualList.ts`): only the cards on screen, plus two spare rows each side, exist in the page. Every card has the same height, so the arithmetic is exact. Grid columns follow the pane width.
- **Cards** (`src/view/card.ts`): breadcrumb strip (each part filters to that folder), name, size, type, real dimensions (read from the loaded image), date, "Used" (shows "–" until Phase 6), the standard frame, and Rename / Move / Open note (disabled until Phase 5). Narrow cards collapse the three buttons into one "⋯" menu.
- **Standard frame**: Small 160 × 107, Medium 240 × 160 (default), Large 360 × 240. Images fit inside, are never stretched, cropped or enlarged, and sit on a neutral background. Clicking opens the original at full size in a dialog; a PDF opens in a tab.
- **Image loading**: at most 4 at once (2 on mobile), with a pulsing placeholder. A card that scrolls away before its image starts is dropped from the queue, and one that is part-way through is stopped.
- **Page**: opened by the ribbon icon or the "Open asset manager" command; one tab is reused. Its filters, sort, view and photo size are saved with the workspace layout.
- **Settings**: General now has an "Asset manager" group (photo size and default view). New pages start from those.
- **Measuring**: `npm run vault:synthetic` builds 10,000 files in `dev/synthetic`; `npm run debug:launch -- --synthetic` opens a copy.

## Measured (macOS, Obsidian 1.14.4, scratch vault of 10,000 files, 1 column in a normal window)
| What | Result |
|---|---|
| Index build | 7 ms for 10,000 files |
| Open the page | 18 ms |
| Cards in the page | 5 to 8 |
| Page elements in total | 230 to 355 |
| Scroll to any position | one frame (about 16 ms) |
| Sweep of the whole list | no long task over 50 ms |
| JavaScript heap | 34 MB |
| `main.js` | 55 KB (was 35 KB) |

Grid with two columns draws twice the cards per row; the cost stays flat.

## Decisions
1. **Originals, not thumbnails** (your call). Each visible card decodes the full file. The synthetic images are small, so this does NOT yet show the cost of real multi-megabyte screenshots; Phase 4 is where that is measured and fixed.
2. **Parent means the top-level folder**, not "folders that have rules" as the plan first said. It works without any rules and matches how the breadcrumb splits a path. Saved views per rule arrive in Phase 6.
3. **Sort defaults to newest first.**
4. **Index not saved to disk**: the scan takes 7 ms per 10,000 files, so persisting it (planned for Phase 6) may not be worth it. Worth re-checking on a slower disk or a real vault.
5. **Empty-state and "Clear filters"** are included; the Used/Unused filter and selection count are left for later phases.
6. **List view** is a compact row with a 96 × 64 frame; it ignores the photo size setting.

## Verified in the real app
Opening from the ribbon and the command (one tab reused); every filter and sort through the toolbar controls; breadcrumb filtering; the empty state; live updates for create, rename, folder rename and delete; Grid and List; phone-width layout with the "⋯" menu; the full-size preview (loads the 480-pixel original); the Settings page group; and the production files only (55 KB `main.js`), where pasting still works.

## Not verified
- Real screenshots of 1 to 5 MB (see decision 1).
- Windows and a real phone (emulated width only).
- Scrolling by dragging the scrollbar or a trackpad; I set `scrollTop` directly.
- Restoring the page after a full Obsidian restart (the state round trip was tested, not a restart).
- Very large vaults on a slow disk, and very fast scrolling with real images (blank gaps).
- Keyboard use and screen readers: buttons have labels, but nothing was tested.

## Known rough edges
- The Rename, Move and Open note buttons look disabled on purpose.
- A very long single list (about 70,000 files in one column) would exceed the browser's maximum element height; Phase 3 does not guard against it.
- The Photo size dropdown is hidden in List view.
