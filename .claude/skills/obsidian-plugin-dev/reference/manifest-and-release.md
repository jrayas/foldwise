# Manifest and release (verified 2026-10-15)

## manifest.json
```json
{
  "id": "word-counter",
  "name": "Word counter",
  "version": "1.0.0",
  "minAppVersion": "1.13.4",
  "description": "Count words and characters in the active note.",
  "author": "Your Name",
  "authorUrl": "https://example.com",
  "isDesktopOnly": false
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | lowercase letters and hyphens; must not end with `plugin`; must not contain `obsidian`; unique; **never change** after release; equals the plugin folder name during development (else `onExternalSettingsChange` is not called) |
| `name` | yes | short; Basic Latin only; no punctuation except `-`, `+`, `()`; no emoji; no "Obsidian" (or "Obsi-", "-sidian"); no "Plugin"; not a core feature name on its own ("Graph view", "Bases", "Live Preview"); unique. Renaming via manifest is allowed; invalid names get delisted |
| `version` | yes | `x.y.z` only |
| `minAppVersion` | yes | real minimum; if unsure, latest stable |
| `description` | yes | ≤250 characters; starts with an action ("Translate…", "Import…"); not "This is a plugin…"; ends with "."; no emoji; correct capitalisation (Obsidian, Markdown, PDF) |
| `author` | yes | |
| `isDesktopOnly` | yes | `true` if any Node.js/Electron API is used (`fs`, `crypto`, `os`, `electron`…) |
| `authorUrl` | no | |
| `fundingUrl` | no | only for donation services; string or `{ "Label": "url" }`; remove it if you take no donations |

## versions.json
Maps each plugin version to its minAppVersion, e.g. `{ "1.0.0": "1.13.4" }`. Obsidian uses it to offer older apps the newest compatible release. The sample's `npm version` script (`version-bump.mjs`) updates it.

## Repository
- Root: `README.md` (purpose, usage; disclose network use, accounts, payments, files outside the vault), `LICENSE` (GitHub must recognise it, else a warning), `manifest.json`.
- The directory reads `manifest.json` at HEAD of the default branch.
- Do not commit `main.js` or `node_modules`.
- Private source is allowed: public repo with release assets + private source repo connected through the "Obsidian Community directory" GitHub App; the build output is still verified against the source.

## Release
1. Bump `version` in `manifest.json` and `versions.json` (`npm version patch` with the sample's `.npmrc` `tag-version-prefix=""`).
2. Push a tag equal to the version (no `v`).
3. The sample workflow `.github/workflows/release.yml` builds, attests provenance (`actions/attest`), and creates a **draft** release with `main.js`, `manifest.json`, `styles.css`; publish the draft.

## Submit (first release only)
1. Sign in at https://community.obsidian.md with an Obsidian account; link GitHub.
2. Add the plugin (Set up and claim → Add a plugin).
3. Automated review runs: sections **Manifest, Releases, Source code, Build verification**; results Error / Warning / Recommendation / Pass. Errors block installation; warnings do not.
4. Fix and publish a new release; use **Request review** to recheck, or **Review branch** to preview a scan without releasing.
5. Later updates need only a new GitHub release.

## Scanner facts
- Build command: first of `build`, `build:plugin`, `compile` in package.json — make it your production build.
- Ignored paths: `node_modules, dist, build, pkg, test-vault, .pnpm-store, .obsidian, esbuild.config.mjs, version-bump.mjs, automation, *.test.*, *.tests.*, *.spec.*, *.specs.*, test, tests, __tests__, testUtils, e2e-tests, mocks, __mocks__, *.cjs, *.mjs, *.cts, *.mts, vite, scripts, docs, i18n, i18next, locale, locales, translations, l10n`.
- Run the checks locally with eslint-plugin-obsidianmd.
