# API cheat sheet (obsidian typings 1.14.4, verified 2026-10-15)

`@since` versions come from the typings. Check any API not listed here in `node_modules/obsidian/obsidian.d.ts` before use.

## Plugin skeleton
```ts
import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type ExampleSettings, ExampleSettingTab } from './settings';

export default class ExamplePlugin extends Plugin {
  settings!: ExampleSettings;

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ExampleSettings>) };
    this.addSettingTab(new ExampleSettingTab(this.app, this));
    this.addCommand({ id: 'do-thing', name: 'Do the thing', callback: () => this.doThing() });
    this.app.workspace.onLayoutReady(() => {
      // vault 'create' fires for every file during load: register here, not earlier
      this.registerEvent(this.app.vault.on('create', (f) => { /* ... */ }));
    });
  }
  onUserEnable() { /* 1.7.2: first enable by the user; e.g. open your view */ }
  async onExternalSettingsChange() { /* 1.5.7: data.json changed on disk (sync) */ }
  private doThing() {}
}
```
Notes: use `this.app` (never global `app`); `{...a, ...b}` instead of two-argument `Object.assign` (lint `object-assign`); command ids/names must not contain the plugin id/name or the word "command"; no default hotkeys.

## Declarative settings (1.13.0+)
```ts
import { App, PluginSettingTab } from 'obsidian';
export class ExampleSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ExamplePlugin) { super(app, plugin); }
  getSettingDefinitions() {
    return [
      { name: 'Enable feature', control: { type: 'toggle', key: 'enabled' } },
      { name: 'Strength', desc: 'How strong it is.',
        control: { type: 'slider', key: 'strength', min: 0, max: 1, step: 0.05,
                   displayFormat: (v: number) => v.toFixed(2) } },          // displayFormat: 1.13.1
      { name: 'Mode', control: { type: 'dropdown', key: 'mode', defaultValue: 'fast',
                                 options: { fast: 'Fast', thorough: 'Thorough' } } },
      { type: 'group', heading: 'Advanced', items: [
        { name: 'Cache folder', control: { type: 'folder', key: 'cacheFolder' } },
        { name: 'Custom row', render: (setting) => { /* imperative Setting; save yourself */ } },
      ] },
    ];
  }
}
```
- Control types: `toggle`, `text`, `textarea`, `number` (min/max/step), `slider` (min/max/step required), `dropdown`, `file`, `folder`, `color`, `secret` (1.13.2). Each accepts `defaultValue`, `validate`, `disabled`.
- Definitions: `control` | `render` | `action` (mutually exclusive), name-only rows, `group`, `list` (add/delete/reorder), `page` (sub-page). `visible` / `disabled` predicates; `aliases` for search.
- `control` values bind to `this.plugin.settings[key]` and auto-save; override `getControlValue`/`setControlValue` for custom storage or side effects. `render` does **not** auto-save.
- **All-or-nothing**: when `getSettingDefinitions()` returns a non-empty array, `display()` is never called. Refresh with `this.update()` (structure) or `this.refreshDomState()` (visibility/disabled). Keep `getSettingDefinitions()` cheap (also run once for search indexing).
- minAppVersion < 1.13.0: implement `display()` (imperative `new Setting(containerEl)`) and optionally also `getSettingDefinitions()` (dual support).
- Not first-class yet: moment format, progress bar, custom suggesters, multi-button rows → `render`.
- Announced in 1.14 but **not in typings**: `SettingDefinitionItem#id`.

## Custom views
```ts
import { ItemView, WorkspaceLeaf } from 'obsidian';
export const VIEW_TYPE = 'example-view';
export class ExampleView extends ItemView {
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Example'; }
  getIcon() { return 'dice'; }
  async onOpen() { this.contentEl.empty(); this.contentEl.createDiv({ cls: 'example-root' }); }
  async onClose() { /* release resources not owned by registered children */ }
}
// in onload:
this.registerView(VIEW_TYPE, (leaf) => new ExampleView(leaf));   // never store the instance
// open/reveal:
const { workspace } = this.app;
let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getRightLeaf(false); // getRightLeaf may return null
if (leaf) { await leaf.setViewState({ type: VIEW_TYPE, active: true }); await workspace.revealLeaf(leaf); }
```
- Deferred views (1.7.2): leaves start as `DeferredView`; always `leaf.view instanceof ExampleView`; `await leaf.loadIfDeferred()` only when truly needed.
- Do not detach leaves in `onunload`. Use `View.scope` for view hotkeys, `addAction` for header buttons, `onPaneMenu` for the "more options" menu.
- Open files: `workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file)` or `workspace.openLinkText(link, sourcePath, Keymap.isModEvent(evt))`.
- Context menu: `new Menu()…showAtMouseEvent(evt)`; let other plugins add items with `workspace.trigger('file-menu', menu, file, 'my-source')`.
- Page preview on hover: `registerHoverLinkSource(id, { display, defaultMod })` and trigger `'hover-link'` (payload untyped — verify).

## Vault and metadata
| API | Notes |
|---|---|
| `vault.getMarkdownFiles()`, `getFiles()`, `getFileByPath`, `getFolderByPath` (1.5.7) | never scan all files to find one path |
| `vault.read` / `cachedRead`, `vault.process` (atomic edit), `fileManager.processFrontMatter` | prefer Editor API for the active note; `fileManager.trashFile` over `vault.delete` |
| `vault.on('create'/'modify'/'delete'/'rename')` | `create` fires for all files on load |
| `metadataCache.getFileCache(file)` | `links`, `embeds`, `tags`, `headings`, `frontmatter`, `frontmatterLinks` (1.4) |
| `metadataCache.resolvedLinks` / `unresolvedLinks` | `source → dest → count` |
| `metadataCache.on('changed'/'deleted'/'resolve'/'resolved')` | `changed` not fired on rename; `resolved` also fires after later edits |
| `getAllTags(cache)`, `parseFrontMatterTags`, `getFrontMatterInfo` (1.5.7) | |
| `normalizePath(p)` | for any user or constructed path; use `vault.configDir`, never `.obsidian` |
| `requestUrl` | instead of `fetch` (CORS-free, works on mobile) |
| `app.saveLocalStorage` / `loadLocalStorage` | vault-scoped local storage |

## Lifecycle helpers
`registerEvent(ref)`, `registerDomEvent(el, type, cb)`, `registerInterval(window.setInterval(...))`, `register(() => cleanup())`, `addChild(component)`; `MarkdownRenderer.render(app, md, el, sourcePath, component)` must get a component that is unloaded with the element (not the plugin, lint `no-plugin-as-component`).

## Deprecated or removed (recent)
| Version | API | Use instead |
|---|---|---|
| 1.14 | `Editor.getDoc()`, `Menu.close()` | editor directly; `menu.hide()` |
| 1.13 | `SettingTab.display()` | `getSettingDefinitions()` |
| 1.13 | `ButtonComponent.setWarning()` | `setDestructive()` / `ConfirmationModal` |
| 1.13 | `SliderComponent.setDynamicTooltip()`; `showTooltip` removed | value shown inline; `setDisplayFormat()` |
| 1.13 | `CloseableComponent` removed | — |
| 1.12 | Bases option types `BaseOption`, `SliderOption`… | `BasesOption`, `BasesSliderOption`… |
| older | `workspace.activeLeaf`, `splitActiveLeaf`, `getUnpinnedLeaf`, `MarkdownRenderer.renderMarkdown`, `Notice.noticeEl`, `prepareQuery`/`fuzzySearch` | `getActiveViewOfType`/`activeEditor`, `getLeaf(...)`, `MarkdownRenderer.render`, `messageEl`, `prepareFuzzySearch` |

## Things with no public API
Core plugin internals (graph view, search engine, file explorer), "Excluded files" setting, `app.internalPlugins`. Do not rely on untyped internals; they break without notice.
