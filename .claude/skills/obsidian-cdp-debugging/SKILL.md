---
name: obsidian-cdp-debugging
description: Run, drive, debug and measure an Obsidian plugin inside a real, isolated Obsidian app through its Chromium remote-debugging port (Chrome DevTools Protocol). Use when asked to run, test, screenshot, benchmark or debug the plugin in the real app, reproduce a bug, check the UI, or verify the release files (main.js, manifest.json, styles.css) work on their own.
---

# Driving a real Obsidian through the debugging port

Obsidian is Electron (Chromium). Started with `--remote-debugging-port`, it accepts Chrome DevTools Protocol (CDP) commands, so a script can evaluate JavaScript in the live app, click, type, take screenshots and measure performance. No extra dependency is needed: Node 22 has global `fetch` and `WebSocket`.

Use British English in any comments or docs written for this project. Follow the project's CLAUDE.md: propose scripts and wait for "go" before writing code.

## Safety rules
- Always run a SECOND, isolated Obsidian with its own `--user-data-dir`. Never attach to the user's everyday Obsidian, and never edit their real `obsidian.json`.
- Always run against a SCRATCH COPY of a test vault (for example copied into the scratchpad or `dev/`), never the user's real vault and never the repo itself.
- The debugging port gives full control of the app. Bind it to localhost only, use it only for dev, and stop the instance when finished.
- Ask before killing any Obsidian process you did not start.

## Method
1. **Isolated launch.** One cross-platform Node script (not shell-specific) starts Obsidian with:
   - `--remote-debugging-port=9222` and `--user-data-dir=<scratch dir>`;
   - anti-throttling flags, so timings are honest when the window is not in front: `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows`;
   - the scratch vault pre-registered in the scratch profile's `obsidian.json` (so it opens straight into it).
   Executable: macOS `/Applications/Obsidian.app/Contents/MacOS/Obsidian`; Windows and Linux paths differ, so detect them in the script.
2. **Connect.** `fetch('http://127.0.0.1:9222/json')` lists the open windows. Pick the page whose URL starts with `app://`. Open its `webSocketDebuggerUrl` with `new WebSocket(...)` and send JSON `{id, method, params}` messages. The settings dialog may be a separate target, so connect to it separately when needed.
3. **Run code in the app.** `Runtime.evaluate` with `awaitPromise: true, returnByValue: true`. Typical uses: reload the plugin (`app.plugins.disablePlugin(id)` then `enablePlugin(id)`), run commands (`app.commands.executeCommandById`), read plugin state (`app.plugins.plugins[id]`), inspect the vault and metadata cache, call internal handlers directly.
4. **Console and errors.** Enable `Runtime` and `Log` and collect `Runtime.consoleAPICalled` and `Runtime.exceptionThrown` events. Always read them after a reload or action.
5. **Use the real interface.** Find DOM rows by text or selector and change them, or send real input with `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` (clicks, drags, typing). Use this for the settings tab, the Asset Manager view, pan/scroll and drag behaviour.
6. **Look at the screen.** `Page.captureScreenshot`, save to the scratchpad directory, then view the image. Screenshots catch layout faults numbers miss (wrong frame size, stretched or cropped images, overlap, upside-down or missing elements).
7. **Measure.** Time each render with `performance.now()`; compare screenshots frame to frame to prove something moved or updated; record long main-thread tasks (PerformanceObserver `longtask`) and memory (`Performance.getMetrics` / `performance.memory`). Run against the synthetic 10,000-image vault for Phase 3 onwards.
8. **Test the shipped files.** Create a fresh scratch vault, copy in ONLY `main.js`, `manifest.json` and `styles.css` under `.obsidian/plugins/<id>/`, enable the plugin and repeat the key checks. This proves the release works on its own.

## Reload loop for development
`npm run dev` (esbuild watch) writes the three files into the scratch vault's plugin folder. After each rebuild: reload the plugin through CDP, read console errors, run the check, screenshot if visual.

## Confirmed on this project (Obsidian desktop, macOS, 2026-10-16)
- The scripts in `scripts/` implement the method; use them rather than rewriting:
  - `npm run vault:create` builds the template vault (`dev/testvault`).
  - `npm run dev` (esbuild watch) writes the build into the template's plugin folder.
  - `npm run debug:launch [-- --release]` makes a fresh scratch vault and profile in `dev/scratch/`, starts the isolated Obsidian and accepts the trust prompt. `--release` uses only the root `main.js`, `manifest.json` and `styles.css`.
  - `npm run debug -- status | eval "<js>" | reload | console [ms] | screenshot [file] | trust | stop`.
- Registering the scratch vault by writing `obsidian.json` inside the scratch `--user-data-dir` works; the real profile is never touched.
- The first-open "Trust author and enable plugins" prompt is a normal DOM button; clicking it through CDP works (the launch script does this, scratch vault only).
- `reload` re-copies the built files, disables then enables the plugin, and prints console output from the reload. Verified with a temporary `console.debug` line.
- `--remote-allow-origins=*` is passed on launch; it was not tested without it.
- `status` reports `loaded` and `restrictedMode`; expect `{"loaded":true,...,"restrictedMode":false}`.
- `timeout` does not exist on macOS; keep helper scripts free of shell-specific commands.

## Learned while testing the settings UI (Obsidian 1.14.4 desktop)
- **Settings open in their own window** (a second CDP target titled "Settings - <vault> - Obsidian"), not inside the main window. Use `--window settings` with `eval`, `screenshot` and `console`. That window has **no `app` global**: do DOM work there and read plugin state with a separate call to the main window. In emulated mobile mode (`app.emulateMobile(true)`) settings are a modal in the main window instead, and the call reloads the window.
- **Modals mount into `activeDocument`**, which is the Settings window while it is open. A modal opened from code can therefore be invisible to a query on the main `document`. Query the right window.
- `npm run debug -- stop` waits for the port to be free; launching straight after a plain kill fails with "port already in use".
- `debug -- paste <note> [--name a.png,b.png] [--type image/png] [--html]` simulates a paste (a real `ClipboardEvent` carrying files) and reports files added, the note text, open modals and notices.
- `debug -- screenshot --size 420x800` captures at a phone-sized window.
- Seeding rules without a settings file: assign to `app.plugins.plugins.foldwise.store.settings` in an `eval`, then call `app.plugins.plugins.foldwise.settingTab.update()`.
- zsh does not word-split an unquoted `$VAR`, so write flags such as `--window settings` out in full.
- Controls in the declarative settings UI commit on the `input` event (text) and `change` (dropdown); toggles respond to a click on `.checkbox-container`. Page navigation has no API: the Back button is `.setting-page-back-button`.

## Learned while testing the Asset Manager page (Obsidian 1.14.4 desktop)
- `npm run debug:launch -- --synthetic` opens a copy of the 10,000-image vault (`npm run vault:synthetic` builds it in `dev/synthetic`, about 125 MB, git-ignored). Measure with `eval`: wrap everything in an async function, scroll `.foldwise-scroller`, wait two animation frames, count `.foldwise-card` and `.foldwise-assets *`, and use a `PerformanceObserver` for `longtask`.
- **Stale CSS:** `npm run dev` copies `styles.css` only when it rebuilds JavaScript. After a CSS-only change, touch a source file (or restart the watcher) before `reload`, and check with `grep` that the vault copy has the new rule. Stale files produced a "my fix did nothing" screenshot.
- Old `npm run dev` watchers pile up across sessions; `pkill -f esbuild.config.mjs` before starting one.
- `DropdownComponent` renders **two** `<select>` elements in 1.14 (the second mirrors the first). To drive one in a test, take the even-numbered selects, set `.value` and dispatch `change`.
- `document` and `activeDocument` can be different windows. A modal opened by a click can be in `activeDocument`, so query that, and expect screenshots of the main window not to show it.
- Put `--window settings` AFTER the command: `debug -- eval "..." --window settings`. Before the command it prints the usage text.

## Learned while testing the thumbnail cache
- `npm run vault:synthetic -- --large 200` adds 200 realistic multi-megabyte screenshots in a `Large` folder. Small synthetic images hide decode costs.
- Renderer memory: `await process.getProcessMemoryInfo()` works in the app's renderer (`private` is in KB). `performance.memory.usedJSHeapSize` misses decoded images, so use both.
- Frame times were identical with and without previews, because decoding is off the main thread. Measure memory and disk too before claiming a speed-up.
- Chromium's own image cache makes a repeat run look instant. Clear the plugin cache and compare memory, not first-load time.
- To test file-based caches: compare the files on disk with the saved index (orphans), then rename, modify and delete originals through `app.fileManager` and `app.vault`.

## Learned while testing rename, move and bulk actions
- **Native menus (macOS):** `Menu` shows a native menu that is not in the DOM. For tests run `app.vault.setConfig('nativeMenus', false)` in the scratch vault, then read `.menu-item-title`. Query the menu straight after opening it.
- **`activeDocument` can differ from `document`.** Modals opened by the plugin appeared in `activeDocument`. Use `[...activeDocument.querySelectorAll('.modal')].pop()` and click its buttons; a modal left open after a failed script keeps a promise pending (a card editor then stays disabled), so restart the scratch vault between failed runs.
- **Vault link setting:** a scratch vault may have "Automatically update internal links" off. Turn it on for link tests: `app.vault.setConfig('alwaysUpdateLinks', true)`.
- **Passing launch flags through npm:** `npm run debug:launch -- --synthetic` needs the `--` or npm swallows the flag and you silently test the wrong vault. Check `app.vault.getFiles().length`.
- Drive a card by dispatching real DOM events (`input`, `click`, `keydown`) on its elements, wait 1.5 s for async work, then check the vault files and note text, not only the UI.
- Obsidian can leave the debugging port with no window after a script closes things; `debug stop` then `debug:launch` recovers (the scratch vault is rebuilt).

## Learned while testing presets, saved views and import/export
- Drive the **Settings window** with `--window settings` (flag after the command). Its list rows are `.setting-item`; find them by `.setting-item-name` text. Toggles: click `.checkbox-container`. Text: set `.value`, dispatch `input` and `change`. Dropdowns: set `.value` and dispatch `change`. List "+" buttons are `.extra-setting-button`; a list row opens its page when clicked; Back is `.vertical-tab-content-container .setting-page-back-button`.
- Plugin modals opened from the Settings window mount in that window's document, so query `document` there. Modals opened from the main window can end up in `activeDocument` (often the Settings window), as noted before.
- A script in the main window cannot see variables from the Settings window and the reverse. To pass a file's text across, build the eval string in Python with `json.dumps` and read the files from disk.
- `require('obsidian')` is not available in `eval`. To test a `file-menu` handler, trigger `app.workspace.trigger('file-menu', fake, file, 'file-explorer')` with a small stand-in object that records `addItem` callbacks, then call the item's `onClick`.
- Notices are in `activeDocument`: `[...activeDocument.querySelectorAll('.notice')]`.
- After a successful Replace import the backup file can be compared with the earlier export to prove an undo is exact.

## Not yet confirmed
- The built-in Obsidian CLI (`obsidian-cli` inside the app bundle) must be enabled by the user in Settings > General > Advanced; its commands are unchecked. CDP does not depend on it.
- Windows paths for the Obsidian binary (`%LOCALAPPDATA%\\Obsidian\\Obsidian.exe`) are untested; set `OBSIDIAN_BIN` if different.

## Limits (say so rather than claim success)
- Real clipboard paste cannot be driven; call the paste handler or write files through the API instead.
- Mobile can only be emulated (`app.emulateMobile(true)`): report mobile as "untested" unless run on a device.
- Windows behaviour cannot be verified from macOS.
- Visual polish still needs the user's eyes.

## Reporting
State what was run, what was observed (console errors, numbers, screenshot paths as full absolute paths) and what was not covered. Never report a pass for something only inferred.
