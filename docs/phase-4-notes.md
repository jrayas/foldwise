# Phase 4 notes: thumbnail cache

## What exists
- **Previews** (`src/obsidian/thumbnailService.ts`): when a card scrolls into view, the original is read, decoded once, drawn at up to twice the frame size (never larger than the original) and saved as WebP (JPEG if WebP is unavailable). The card shows the preview; the original is only read to make it.
- **Where**: `<vault>/.obsidian/plugins/foldwise/cache/`, never in the vault's notes. Files are named by a hash and are written under a temporary name first, then renamed, so a crash cannot leave a half-written preview.
- **Key** (`src/core/thumbCache.ts`): path + frame width + the original's size and modified time. A changed original gets a new preview and the old one is deleted.
- **Rename and move**: the entry is re-keyed and its file renamed, so nothing is regenerated. Folder renames and deletes are followed too.
- **Real dimensions** are stored with each preview, so a card shows "1600 × 900" without loading the original.
- **Limit**: default 200 MB. Least recently used previews go first (on every new preview and on start-up).
- **Direct display**: files under 100 KB, GIFs and SVGs are shown as they are (a preview would save nothing, or break animation). PDFs keep their icon.
- **Settings** (General, "Thumbnails and performance"): on/off, size limit, "show originals below", the current cache size, and Clear cache.
- **Clear cache** deletes only files in the cache folder whose names look like previews, and nothing else. The original files are never written to.
- **Failure handling**: if a preview cannot be made or read, the card falls back to the original. A damaged preview is forgotten and made again next time.
- **Pure core**: `thumbSize.ts` (sizes and rules) and `thumbCache.ts` (the index, key, trimming, re-keying, lenient loading) have unit tests. 286 tests in total.
- **Test vault**: `npm run vault:synthetic -- --large 200` adds 200 realistic screenshots of 0.9 to 4.1 MB (514 MB) in a "Large" folder.

## Measured (macOS, Obsidian 1.14.4, 200 large images, 40 jumps through the list, 4 loading at a time)
| | Originals | Previews, first visit | Previews, cached |
|---|---|---|---|
| Renderer memory after the sweep (grid) | 405 MB | 241 MB | 198 MB |
| Renderer memory after the sweep (list) | 371 MB | 213 MB | 242 MB |
| Peak renderer memory (grid) | 405 MB | 264 MB | 235 MB |
| Frame time while scrolling (median) | 10 ms | 11 ms | 10 ms |
| Long tasks over 50 ms | none | none | none |
| Time to sweep 40 jumps (grid) | 1.6 s | 2.3 s | 1.7 s |
| Disk used (grid, medium frame) | none | 9.6 MB for 200 previews | same |

Reading it honestly:
- **Memory is the real gain**: about 40% less after browsing 200 big images, and the gap grows the more you browse, because the browser keeps decoded originals.
- **Smoothness was already fine** in this test: decoding happens off the main thread, so frame times were the same. I did not see the stutter I expected from originals. A slower computer or bigger pictures may differ.
- **First visit costs more**: about 40% longer in grid, because each preview is decoded in full, shrunk and saved. It is a one-off per image, and happens 4 at a time.
- **JavaScript heap rose** from 35 MB to about 85 to 105 MB after generating previews. It was not collected by the end of the run. I have not checked whether it falls back later.
- Each preview is about 48 KB (grid, medium) or 4 KB (list), against 0.9 to 4 MB for the original.
- The first-screen time measurement did not work (images were already in the browser's own cache), so it is not reported.

## Decisions
1. Previews are twice the frame size, WebP quality 0.8.
2. One preview per frame size, so changing Photo size makes a second set. Old sets age out under the limit.
3. A limit change applies at the next new preview or restart, not immediately.
4. The cache is on by default.
5. The index (`index.json`) is saved at most every 2 seconds, and when the plugin closes.

## Verified in the real app
Previews made and shown (480 × 300 WebP from a 1024 × 640 original, real dimensions shown); a rename keeping its preview with no regeneration; a modified original getting a new preview and the old file deleted; trimming to a 1 MB limit leaving 22 previews and 22 files in step with the index; the off switch showing originals and writing nothing; Clear cache from the Settings page, and removing every file while leaving all 200 originals; a damaged preview falling back to the original, being discarded and made again; the index surviving a plugin restart; the production files only (67 KB `main.js`).

## Not verified
- A real phone or tablet: WebP encoding, `createImageBitmap` and memory limits there. The JPEG fallback has never run.
- Windows.
- Very large originals (20 MB and up, or tens of thousands of pixels wide).
- Whether Obsidian Sync or another sync tool copies the `cache` folder between devices (it lives inside `.obsidian/plugins/foldwise`). Clear cache fixes it either way, but I haven't checked.
- Whether the JavaScript heap falls back after a while.
- PDF previews on request (not built; PDFs show an icon).
- A full Obsidian restart (the plugin was disabled and enabled instead).

## Known rough edges
- Hand-edited limits outside the dropdown choices (for example 300 MB) are kept and shown, but the allowed range is 10 to 10,000 MB.
- Two views open at once share one cache and one generation queue, but each has its own loading slots.
