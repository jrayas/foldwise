# Phase 7: measuring before any Rust/WASM

**Verdict: no Rust/WASM worker is justified. Phase 7 is skipped for now.** The one real slowness was in TypeScript and is fixed.

## What was measured
`npm run bench [-- 10000 100000 500000]` times the pure `src/core/` functions on fake records (fixed random seed, Node 22, Apple silicon). It writes nothing to the project. Numbers are the median of several runs, in milliseconds.

| Task | 10k files | 100k files | 500k files |
|---|---|---|---|
| Index build | 0.3 | 4 | 33 |
| Filter, sort by date | 1.4 | 27 | 210 |
| Filter, sort by size | 1.6 | 21 | 143 |
| Name search | 0.4 | 4 | 36 |
| One folder and type | 0.2 | 2 | 11 |
| **Sort by name, before the fix** | **71** | **818** | **3,945** |
| Sort by name, after the fix | 4 | 52 | 296 |
| Usage map rebuild | 2 | 62 | 435 |
| Unused filter | 0.3 | 6 | 46 |
| Rule matching (2,000 notes, 60 rules) | 10 | 10 | 11 |
| Bulk rename preview (5,000 files) | 6 | 6 | 7 |

## The one problem, fixed in TypeScript
Sorting by name used `String.localeCompare(..., options)`, which builds a new collator on every comparison. A shared `Intl.Collator` gives identical ordering and is about 15 times faster (`src/core/assetFilter.ts`). The same trap was found earlier in the usage map.

## Real app check
Release build, 10,201-file synthetic vault, filter change to the next rendered frame: sort by name 18 ms, by size 21 ms, by date 17 ms.

## Against the thresholds
- Under 50 ms per change up to about 100,000 files, except name sorting at 100,000 (52 ms) and the 500,000 cases. 500,000 files in one vault is far beyond this plugin's target, and no case reaches the 100 ms long-task limit before 100,000 files.
- Thumbnails were already decoded off the main thread (Phase 4), so a worker gains little there.
- Moving data into a worker would add copying costs that the numbers above do not justify.

## Reopen Phase 7 if
A real vault shows a long task over 100 ms in the Asset Manager, or users run well past 100,000 assets. The first candidates would then be the usage map rebuild and name sorting.

## Not covered
Windows, mobile devices, and a real vault above about 10,000 files.
