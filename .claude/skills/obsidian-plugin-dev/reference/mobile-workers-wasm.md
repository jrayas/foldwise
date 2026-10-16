# Mobile, Web Workers and WebAssembly (2026-10-15)

## Platforms
| | Desktop | iOS / iPadOS | Android |
|---|---|---|---|
| Runtime | Electron (installer 1.14: Electron 43.7.5 / Chromium 150; older installers still run) | Capacitor (WebKit) | Capacitor (Chromium WebView) |
| Minimum OS | per Electron | iOS 15.6 (App Store, verified) | not published |
| Node/Electron APIs | yes | no | no |
| Status bar item | yes | no | no |
| Regex lookbehind | yes | iOS 16.4+ only (lint error) | yes |
| Debug | DevTools | Safari Web Inspector (iOS 16.4+) | `chrome://inspect` |

- Detect with `Platform.isDesktopApp`, `isMobileApp`, `isIosApp`, `isAndroidApp`, `isPhone`, `isTablet` — never `navigator` (lint error).
- Emulate mobile on desktop: DevTools console `this.app.emulateMobile(true)`.
- Keep memory small on mobile; avoid large in-memory structures.
- JS target es2021 (ES2022 static blocks need iOS 16.4).

## Web Workers (no official guidance — secondary evidence)
- Docs only say workers must be cleaned up on unload.
- A separate worker file in your release is **never installed**. Build the worker as its own bundle, embed its code as a string in `main.js`, and start it from a Blob URL:
```ts
const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
const worker = new Worker(url);
URL.revokeObjectURL(url);
this.register(() => worker.terminate());
```
- Listed plugins doing this (secondary): Typst Renderer (fenjalien/obsidian-typst, esbuild inline-worker plugin), Typst Mate (`isDesktopOnly: false`).
- Transfer big data with transferable `ArrayBuffer`s. Do not assume `SharedArrayBuffer` (needs cross-origin isolation; unverified in Obsidian).
- Test on a real iPhone and Android device before promising mobile support.

## WebAssembly
- Embed the `.wasm` bytes in `main.js` (esbuild `binary` loader or base64) and call `WebAssembly.instantiate(bytes, imports)`. Avoid `instantiateStreaming(fetch(...))` (MIME/fetch problems reported with Capacitor; secondary).
- Rust: `wasm32-unknown-unknown`. Rust ≥1.87 enables bulk-memory, nontrapping-fptoint, reference-types, multivalue, sign-ext, mutable-globals by default — all supported from Safari 15, so fine for iOS 15.6. **Do not enable `simd128`** unless you require iOS 16.4+ (or ship two builds). For a strict MVP build use `-Ctarget-cpu=mvp` with nightly `-Zbuild-std`.
- wasm-pack and wasm-bindgen: the CLI version must match the crate version.
- Keep it small: `opt-level = "z"` or `"s"`, `lto = true`, `wasm-opt`; avoid heavy crates (serde, regex) unless needed. Base64 adds ~33%.
- Lint/review: generated glue must not use `eval`/`new Function`. Keep the Rust source in the repository; embedded binary blobs without source may look like obfuscation (policy).
- Build verification: the directory runs your `build` script. Whether its environment has Rust is undocumented — consider committing the built `.wasm` and keeping `npm run build` JS-only, with a separate `build:wasm` script, and test with **Review branch** before releasing.
- Free Wasm memory and terminate workers in `onunload` / view `onClose`.

## Rendering libraries
- PixiJS 8 compiles some code with `new Function` unless you `import 'pixi.js/unsafe-eval'` (installs eval-free polyfills). The bundled library code still contains the string; whether the scanner flags bundled code is unknown.
- Lint `no-static-styles-assignment` (error) flags **literal** style values (`el.style.color = 'red'`, `style.setProperty('x','y')`, `setAttribute('style', …)`, literal non-`--` keys in `setCssProps`/`setCssStyles`). Use CSS classes + Obsidian CSS variables for static styling; for values computed at runtime (canvas size, colours from settings) use `el.setCssProps({ '--my-var': value })` and read the variable in `styles.css` (the rule message recommends `setCssProps`).
