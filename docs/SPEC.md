# Foldwise: Full Specification (v2)

> Original specification, kept as additional detail alongside `CLAUDE.md`.
> `CLAUDE.md` holds the working rules and condensed decisions. This file holds the full reasoning, layouts and wireframes.
> The plugin was originally called "Asset Manager"; the project name is now **Foldwise**.

## 1. Purpose

A custom Obsidian plugin that does two things:

1. **Routes** pasted files (mainly screenshots) into the correct asset folder automatically, using per-folder rules.
2. **Manages** everything saved, through one adaptive page where you can view, filter, move, rename and open the note that uses each file.

## 2. Core concepts

| Term | Meaning |
|---|---|
| **Folder rule** | "Notes inside folder X save pasted files to asset folder Y" |
| **Inheritance** | A subfolder with no rule of its own follows its nearest parent rule |
| **Scope** | Per rule: Everything, Exclude listed subfolders, or Include only listed subfolders |
| **Fallback** | What happens when no rule matches (Obsidian default or a fixed folder) |
| **Preset** | A saved bundle of naming and scope settings, applied to several folders |
| **Thumbnail cache** | Small disposable previews stored in the plugin's own folder, never in the vault |
| **Single source of truth** | One real file per image. Notes link to it, and all actions act on it |

## 3. Routing logic

```
Paste in a note
      │
Walk up from the note's folder
      │
Find nearest enabled rule ── none ──► Fallback
      │
Check scope
  ├─ Exclude list matches the note's path ──► skip, keep walking up
  └─ Include-only list lacks the note's path ─► skip, keep walking up
      │
Resolve the file name from the naming pattern
      │
Resolve conflicts (auto-number / ask / cancel)
      │
Save to the asset folder (create it if needed)
```

## 4. Example vault

```
Vault/
├── Mathematics/            RULE → Mathematics/Assets   (exclude: Books)
│   ├── Assets/
│   │   ├── Diagrams/
│   │   └── Screenshots/
│   ├── Concepts/
│   ├── Questions/
│   ├── Knowledge/
│   └── Books/              RULE → Mathematics/Books/Files
│       └── Files/
├── Physics/                RULE → Physics/Assets       (exclude: Books)
│   ├── Assets/
│   ├── Concepts/ · Questions/ · Knowledge/
│   └── Books/              RULE → Physics/Books/Files
├── Engineering/            RULE → Engineering/Assets   (exclude: Books)
│   ├── Assets/
│   └── Books/              RULE → Engineering/Books/Files
└── Inbox/                  no rule → Fallback
```

## 5. Settings: master-detail structure

### 5.1 Level 1: Overview (master)

```
┌──────────────────────────────────────────────────────────┐
│ Foldwise · Settings                                      │
├──────────────────────────────────────────────────────────┤
│ General                                              [>] │
│ Folders                                  [+ Add folder]  │
│   Search: [__________]                                   │
│   ┌────────────────────────────────────────────────┐     │
│   │ ● Mathematics   → Mathematics/Assets   [>]     │     │
│   │     ○ Books     → Mathematics/Books/Files      │     │
│   │ ● Physics       → Physics/Assets       [>]     │     │
│   │     ○ Books     → Physics/Books/Files          │     │
│   │ ● Engineering   → Engineering/Assets   [>]     │     │
│   │ ○ Personal      → Personal/Receipts   (off)    │     │
│   └────────────────────────────────────────────────┘     │
│   Badges: custom naming · custom scope · warning         │
│ Presets                                              [>] │
│ Asset Manager page                                   [>] │
│ Thumbnails and performance (advanced)                [>] │
│ Import / Export                                      [>] │
└──────────────────────────────────────────────────────────┘
```

- One line per folder: on/off dot, name, target, badges.
- Child rules are indented under their parent.
- Drag to reorder or group (for example, group the three subjects under "Subjects").
- Row actions: Duplicate, Apply preset, Disable, Delete.

### 5.2 Level 2: Single folder (detail)

```
┌──────────────────────────────────────────────────────────┐
│ ‹ Back       Physics                     Enabled [On]    │
│ Summary: Files pasted in Physics (except Books) are      │
│ saved to Physics/Assets.                                 │
├──────────────────────────────────────────────────────────┤
│ [ Basics ] [ Naming ] [ Scope ] [ Advanced ] [ Test ]    │
└──────────────────────────────────────────────────────────┘
```

| Tab | Contents |
|---|---|
| **Basics** | Applies-to folder (picker), save-to folder (picker), create if missing |
| **Naming** | Pattern, live preview, "Inherit from General" toggle, apply preset |
| **Scope** | Everything / Exclude / Include only, with subfolder chips and a picker |
| **Advanced** | Sub-sort by (none, date, file type), file types handled, conflict override |
| **Test** | Enter a note path, see the target folder, final file name and the reason |

- Every setting starts as "inherit from General", and shows an Overridden badge only when changed.
- The plain-English summary at the top updates live.

### 5.3 General (global defaults)

- Fallback: Obsidian default, or a fixed folder.
- Default naming pattern, for example `{note}-{date:YYYYMMDD}-{n}`.
- Conflict behaviour: Auto-number, Ask, or Cancel.
- Default file types handled.

### 5.4 Presets

- Save a naming and scope setup (for example "Subject folder", "Books folder").
- Apply to one or many folders in one action.
- Editing a preset can optionally update every folder using it.

### 5.5 Asset Manager page settings

- Default view: Grid or List.
- **Photo frame size:** Small (160 x 107), Medium (240 x 160, default), Large (360 x 240).
- Image fit: Fit inside the frame (default) or Fill by cropping.
- Open in: main tab or sidebar.
- File types shown: images, PDFs, audio, other.
- Auto-create a saved view for each folder rule.

### 5.6 Thumbnails and performance (advanced)

- Thumbnail cache: On or Off.
- Cache size limit (for example 200 MB, oldest removed first).
- Render originals directly if under X KB.
- Maximum simultaneous thumbnails (default 4, lower on mobile).
- Use Rust/WASM engine: On or Off.
- Buttons: Clear thumbnail cache, Rebuild index.

### 5.7 Validation (on save)

- Target folder doesn't exist (offer to create it).
- Two rules overlap ambiguously.
- Asset folder sits inside an excluded area.
- Pattern could produce duplicate names.
- Warnings show as a badge in the Level 1 list.

### 5.8 Storage

- Settings are stored as plain JSON in the plugin folder, so they are easy to back up and sync.
- Import/export of the whole rule set or a single folder.
- The same structure is passed to the rule engine.

## 6. Asset Manager page

**One adaptive page, not one page per folder.** It is filtered by parent folder through saved views.

### 6.1 Page layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Views: [All] [Mathematics] [Physics] [Engineering] [+]                   │
│ Parent: [All ▾]  Subfolder: [All ▾]  Type: [All ▾]  Used: [Any ▾]        │
│ Search: [________]   View: (Grid)(List)            Selected: 0           │
├──────────────────────────────────────────────────────────────────────────┤
│  (cards, virtual scrolled)                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 The card

Every card has the same height, so virtual scrolling can calculate exactly which cards are visible.

```
  📁 Mathematics / Assets / Diagrams                         ← location (top)
┌──────────────────────────────────────────────────────────────────────┐
│                                                       │              │
│  limits-graph.png          ┌────────────────────┐     │   [Rename]   │
│                            │                    │     │              │
│  Size    84 KB             │       PHOTO        │     │   [Move]     │
│  Type    PNG               │   standard frame   │     │              │
│  Dims    1200 x 800        │     240 x 160      │     │  [Open note] │
│  Date    16 Oct 2026       │                    │     │              │
│  Used    2 notes           └────────────────────┘     │              │
└──────────────────────────────────────────────────────────────────────┘
   name and details (left)        photo (centre)           actions (right)
```

| Zone | Contents |
|---|---|
| **Top strip** | Folder location as a breadcrumb. Each part is clickable to filter by that folder |
| **Left** | File name, then size, type, real dimensions, date, usage |
| **Centre** | Photo in a standard fixed frame |
| **Right** | Rename, Move, Open note, stacked top to bottom with generous spacing, behind a thin divider |

### 6.3 Standard photo frame

- Every image sits in the same frame (default 240 x 160).
- Images are scaled to fit inside, never stretched, centred on a neutral background.
- Small images are not enlarged beyond their real size.
- Real dimensions are always shown in the details.
- Clicking the photo opens a full-size preview of the original.

### 6.4 Thumbnails: link to the original, show a cached preview

| Decision | Detail |
|---|---|
| **One real file** | Notes link to the original. Move, Rename and Open note act on it only |
| **No auto-copies** | The plugin never saves duplicate images into the vault |
| **Disposable previews** | Thumbnails (about 2x the frame size, for sharp screens) live in the plugin's cache folder and can be deleted and rebuilt any time |
| **Lazy generation** | Made only when a card scrolls into view, a few at a time, with a placeholder first |
| **Cache key** | Path + size + modified date. If the original changes, the preview refreshes |
| **Follows renames and moves** | The cache entry is re-keyed, so nothing is regenerated |
| **Small files** | Under the size threshold (about 100 KB), the original is rendered directly |
| **PDFs** | Icon by default, preview only on request |
| **Full preview** | Loads the original, for that one image only |

### 6.5 Card actions

- **Rename:** the file name becomes an editable field in place, with Save and Cancel. Conflicts follow the chosen rule.
- **Move:** opens a folder picker with recent destinations. The cross-folder case is supported, so you can move from Physics to Engineering in the same tool.
- **Open note:** one note uses it, so it opens directly. Several notes use it, so a short list appears. None use it, so the button is greyed out with "No note uses this".
- **Narrow screens:** the three actions collapse into one "⋯" menu.
- **Bulk:** select several cards to move them together, or rename with a pattern.

### 6.6 Filters, views and shortcuts

- Filters: All, parent folder, subfolder, file type, name search, Used or Unused.
- Saved views appear as tabs, generated from folder rules, with "+" to pin more.
- Right-click any folder, then "Open assets for this folder", which opens the same page pre-filtered.
- Optional embeddable gallery block inside a note.

### 6.7 Integrity rule

All moves and renames go through Obsidian's own file manager, so links in notes update automatically.

## 7. Architecture

```
TypeScript (main thread)             Rust/WASM (Web Worker)
────────────────────────             ──────────────────────
Obsidian API calls                   Thumbnail resize/encode
Settings UI (master-detail)          Search and filter over index
Virtual card list rendering          Rule matching (scope logic)
Move / rename execution              Bulk rename pattern engine
Vault event handling                 (later) content hashing
```

**Flow:** settings save as JSON, the rule set loads into the engine, a paste event goes to the engine, the engine returns target folder and name, and TypeScript performs the save.

**Build order:** everything starts in TypeScript, then is measured against a synthetic vault of 10,000 images, and only proven bottlenecks (thumbnails, search) move to WASM.

## 8. Performance plan

1. Virtual scrolling with fixed card height.
2. Cached thumbnails at a standard size, generated lazily with limited concurrency.
3. Lightweight metadata index (path, name, size, date, type), with no file contents read.
4. Incremental index updates from vault events, refreshing one card, not the page.
5. Lazy "used in" map, built in the background from Obsidian's link data.
6. Debounced search and filters (about 200 ms).
7. Batch moves in small groups, with a progress bar and one refresh at the end.
8. Persisted index, loaded after layout is ready, so the page opens instantly.
9. Lower concurrency and smaller frames on mobile.

## 9. Safety and edge cases

- Existing files are never moved unless the user triggers "Apply to existing files", which shows a preview first.
- Name conflicts follow the chosen rule and are never silently overwritten.
- Deleting a rule never deletes files.
- Clearing the thumbnail cache never touches originals.
- Disabled rules are kept, just ignored.
- Moving or renaming a note can optionally carry its assets (a later option).

## 10. Phased delivery

| Phase | Scope |
|---|---|
| **1** | Rules, routing, fallback, naming, conflict handling |
| **2** | Master-detail settings with Test tab and validation |
| **3** | Asset Manager page: index, virtual card list, standard frame, filters |
| **4** | Thumbnail cache (lazy, keyed, size-limited) |
| **5** | Move and rename, with link-safe operations |
| **6** | Used/Unused, saved views, presets, import/export |
| **7** | Rust/WASM worker for proven bottlenecks |

## 11. Out of scope for v1

Tagging or metadata on images, duplicate detection, cloud sync, per-image notes and OCR.

## 12. Open decisions

Defaults for these are recorded in `CLAUDE.md` under "Decisions".

1. Do excluded folders with no rule of their own use the fallback, or must a rule be required?
2. Can an asset folder live outside the folder it serves (the cross-folder case)?
3. Do presets stay linked to folders, or copy values once?
4. Which file types in v1: images only, or PDFs too?
5. Fit inside the frame (default) or crop to fill?
