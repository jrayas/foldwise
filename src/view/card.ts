import { Menu, TFile, setIcon, type App } from 'obsidian';
import type { AssetRecord } from '../core/assetIndex';
import { breadcrumbFor } from '../core/breadcrumb';
import { baseFromTyped, splitName } from '../core/renamePlan';
import { usageText, type UsageMap } from '../core/usage';
import { formatBytes, formatDate, formatDimensions } from '../core/format';
import type { FrameDimensions } from '../core/cardMetrics';
import type { Limiter } from '../core/limiter';
import type { ViewMode } from '../core/types';
import type { ThumbnailProvider, ThumbSource } from '../obsidian/thumbnailService';
import type { ActionResult } from './assetActions';
import { PreviewModal } from './previewModal';

export interface Dimensions {
  width: number;
  height: number;
}

/** What a card needs from the page that shows it. */
export interface CardHost {
  app: App;
  /** Limits how many images are being loaded into cards at once. */
  limiter: Limiter;
  thumbnails: ThumbnailProvider;
  /** Real pixel sizes learnt so far, shared so a card that scrolls away and back does not forget them. */
  dimensions: Map<string, Dimensions>;
  filterTo(parent: string, subfolder: string): void;
  usage: UsageMap;
  isSelected(path: string): boolean;
  /** Tick or untick a card. With Shift, everything between the last click and this one. */
  toggleSelected(path: string, range: boolean): void;
  renameAsset(record: AssetRecord, typed: string): Promise<ActionResult>;
  moveAsset(record: AssetRecord): void;
  openNote(record: AssetRecord, event: MouseEvent): void;
}


/**
 * One asset. Every card is the same height, so the list can work out exactly which ones are on screen.
 * It shows a cached preview where one is worth having, and the original otherwise.
 */
export class AssetCard {
  readonly el: HTMLElement;
  private dimsEl: HTMLElement | null = null;
  private usedEl: HTMLElement | null = null;
  private nameEl: HTMLElement | null = null;
  private checkbox: HTMLInputElement | null = null;
  private openNoteButtons: HTMLButtonElement[] = [];
  private stopEditing: (() => void) | null = null;
  private frameEl: HTMLElement | null = null;
  private cancelLoad: (() => boolean) | null = null;
  private cancelPreview: (() => void) | null = null;
  private releaseSlot: (() => void) | null = null;
  private image: HTMLImageElement | null = null;
  private destroyed = false;

  constructor(
    private readonly host: CardHost,
    readonly record: AssetRecord,
    mode: ViewMode,
    private readonly frameSize: FrameDimensions,
  ) {
    this.el = createDiv({ cls: ['foldwise-card', mode === 'list' ? 'is-list' : 'is-grid'] });
    this.el.dataset.path = record.path;
    this.build(mode);
  }

  /** Same file, same state? Then the card on screen can stay as it is. */
  static signature(record: AssetRecord, mode: ViewMode, frame: string): string {
    return `${record.path}|${record.size}|${record.mtime}|${mode}|${frame}`;
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelPreview?.();
    this.cancelLoad?.();
    this.stopEditing = null;
    if (this.releaseSlot) {
      // Still loading when scrolled away: stop the download and free the slot for a visible card.
      this.image?.removeAttribute('src');
      this.releaseSlot();
      this.releaseSlot = null;
    }
    this.el.remove();
  }

  private build(mode: ViewMode): void {
    const { record } = this;
    const body = this.el.createDiv({ cls: 'foldwise-card-body' });
    const info = body.createDiv({ cls: 'foldwise-card-info' });
    const strip = this.buildStrip();
    if (mode === 'grid') this.el.prepend(strip);

    this.checkbox = body.createEl('input', {
      cls: 'foldwise-card-select',
      attr: { type: 'checkbox', 'aria-label': `Select ${record.name}` },
    });
    this.checkbox.checked = this.host.isSelected(record.path);
    this.el.toggleClass('is-selected', this.checkbox.checked);
    this.checkbox.addEventListener('click', (event) => this.host.toggleSelected(record.path, event.shiftKey));

    this.nameEl = info.createDiv({ cls: 'foldwise-card-name', text: record.name, attr: { title: record.path } });
    const details = info.createEl('dl', { cls: 'foldwise-card-details' });
    this.detail(details, 'Size', formatBytes(record.size));
    this.detail(details, 'Type', record.ext.toUpperCase());
    this.dimsEl = this.detail(details, 'Dims', this.knownDimensions());
    this.detail(details, 'Date', formatDate(record.mtime));
    this.usedEl = this.detail(details, 'Used', usageText(this.host.usage, record.path));
    if (mode === 'list') info.appendChild(strip);

    this.frameEl = body.createEl('button', {
      cls: 'foldwise-frame',
      attr: { type: 'button', 'aria-label': `Open ${record.name}` },
    });
    this.frameEl.addEventListener('click', () => this.openPreview());
    this.fillFrame();

    this.buildActions(body);
  }

  private buildStrip(): HTMLElement {
    const strip = createDiv({ cls: 'foldwise-card-strip' });
    setIcon(strip.createSpan({ cls: 'foldwise-card-strip-icon' }), 'folder');
    breadcrumbFor(this.record.folder).forEach((crumb, index) => {
      if (index > 0) strip.createSpan({ cls: 'foldwise-crumb-separator', text: '/' });
      const button = strip.createEl('button', { cls: 'foldwise-crumb', text: crumb.label, attr: { type: 'button' } });
      button.addEventListener('click', () => this.host.filterTo(crumb.parent, crumb.subfolder));
    });
    return strip;
  }

  private detail(list: HTMLElement, label: string, value: string): HTMLElement {
    list.createEl('dt', { text: label });
    return list.createEl('dd', { text: value });
  }

  private knownDimensions(): string {
    const known = this.host.dimensions.get(this.record.path);
    return known ? formatDimensions(known.width, known.height) : '–';
  }

  private fillFrame(): void {
    const frame = this.frameEl;
    if (!frame) return;
    if (this.record.kind === 'pdf') {
      frame.addClass('is-pdf');
      setIcon(frame.createSpan({ cls: 'foldwise-frame-icon' }), 'file-text');
      return;
    }
    frame.addClass('is-loading');
    const image = frame.createEl('img', { attr: { alt: '', decoding: 'async' } });
    this.image = image;

    // Ask for a cached preview (made on first sight); small files and any failure use the original.
    const request = this.host.thumbnails.request(this.record, this.frameSize);
    this.cancelPreview = request.cancel;
    request.result.then(
      (source) => {
        if (!this.destroyed) this.show(source);
      },
      () => {
        if (!this.destroyed) this.failed();
      },
    );
  }

  /** Load one picture into the frame, waiting for a free loading slot so only a few load at once. */
  private show(source: ThumbSource): void {
    const image = this.image;
    const frame = this.frameEl;
    if (!image || !frame) return;

    const request = this.host.limiter.acquire();
    this.cancelLoad = request.cancel;
    void request.slot.then((release) => {
      if (this.destroyed) {
        release();
        return;
      }
      this.releaseSlot = release;
      const finish = (): void => {
        this.releaseSlot?.();
        this.releaseSlot = null;
        frame.removeClass('is-loading');
      };
      image.onload = () => {
        // A preview is smaller than the original, so the real size comes from the cache entry.
        const width = source.width ?? image.naturalWidth;
        const height = source.height ?? image.naturalHeight;
        if (width > 0) {
          this.host.dimensions.set(this.record.path, { width, height });
          this.dimsEl?.setText(formatDimensions(width, height));
        }
        finish();
      };
      image.onerror = () => {
        finish();
        if (source.thumb) {
          // The cached preview is unreadable: forget it and fall back to the original.
          if (source.key) this.host.thumbnails.discard(source.key);
          this.showOriginal();
        } else {
          this.failed();
        }
      };
      image.src = source.url;
    });
  }

  private showOriginal(): void {
    const file = this.host.app.vault.getAbstractFileByPath(this.record.path);
    if (!(file instanceof TFile)) {
      this.failed();
      return;
    }
    this.frameEl?.addClass('is-loading');
    this.show({ url: this.host.app.vault.getResourcePath(file), thumb: false });
  }

  private failed(): void {
    this.frameEl?.removeClass('is-loading');
    this.frameEl?.addClass('is-broken');
    this.image?.remove();
  }

  private buildActions(body: HTMLElement): void {
    const actions = body.createDiv({ cls: 'foldwise-card-actions' });
    const rename = actions.createEl('button', { text: 'Rename', attr: { type: 'button' } });
    rename.addEventListener('click', () => this.startRename());
    const move = actions.createEl('button', { text: 'Move', attr: { type: 'button' } });
    move.addEventListener('click', () => this.host.moveAsset(this.record));
    const note = actions.createEl('button', { text: 'Open note', attr: { type: 'button' } });
    note.addEventListener('click', (event) => this.host.openNote(this.record, event));
    this.openNoteButtons = [note];

    const more = body.createEl('button', {
      cls: 'foldwise-card-more clickable-icon',
      attr: { type: 'button', 'aria-label': 'More actions' },
    });
    setIcon(more, 'more-horizontal');
    more.addEventListener('click', (event) => {
      const menu = new Menu();
      menu.addItem((item) => item.setTitle('Rename').onClick(() => this.startRename()));
      menu.addItem((item) => item.setTitle('Move').onClick(() => this.host.moveAsset(this.record)));
      const notes = this.host.usage.count(this.record.path);
      menu.addItem((item) => item.setTitle(notes === 0 ? 'Open note (no note uses this)' : 'Open note').setDisabled(notes === 0).onClick(() => this.host.openNote(this.record, event)));
      menu.showAtMouseEvent(event);
    });
    this.refreshUsage();
  }

  /** The note-usage data changed: update the "Used" line and whether Open note can be pressed. */
  refreshUsage(): void {
    this.usedEl?.setText(usageText(this.host.usage, this.record.path));
    const ready = this.host.usage.ready;
    const count = this.host.usage.count(this.record.path);
    for (const button of this.openNoteButtons) {
      button.disabled = !ready || count === 0;
      button.title = !ready ? 'Checking which notes use this…' : count === 0 ? 'No note uses this' : count === 1 ? 'Open the note that uses this' : `Choose from ${count} notes`;
    }
  }

  setSelected(selected: boolean): void {
    if (this.checkbox) this.checkbox.checked = selected;
    this.el.toggleClass('is-selected', selected);
  }

  /** Replace the name with a text box, Save and Cancel. The extension is shown and cannot be changed. */
  private startRename(): void {
    const nameEl = this.nameEl;
    if (!nameEl || this.stopEditing) return;
    const { base, ext } = splitName(this.record.name);
    const wrap = createDiv({ cls: 'foldwise-rename' });
    const row = wrap.createDiv({ cls: 'foldwise-rename-row' });
    const input = row.createEl('input', { attr: { type: 'text', 'aria-label': 'New file name', spellcheck: 'false' } });
    input.value = base;
    if (ext !== '') row.createSpan({ cls: 'foldwise-rename-ext', text: `.${ext}` });
    const buttons = wrap.createDiv({ cls: 'foldwise-rename-buttons' });
    const save = buttons.createEl('button', { text: 'Save', cls: 'mod-cta', attr: { type: 'button' } });
    const cancel = buttons.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    const message = wrap.createDiv({ cls: 'foldwise-rename-message' });

    this.el.addClass('is-editing');
    nameEl.replaceWith(wrap);
    let saving = false;

    const finish = (): void => {
      this.stopEditing = null;
      this.el.removeClass('is-editing');
      wrap.replaceWith(nameEl);
    };
    this.stopEditing = finish;

    const check = (): boolean => {
      const checked = baseFromTyped(input.value, ext);
      message.setText(checked.ok ? '' : checked.message);
      input.toggleClass('is-invalid', !checked.ok);
      save.disabled = !checked.ok || saving;
      return checked.ok;
    };
    const submit = async (): Promise<void> => {
      if (saving || !check()) return;
      saving = true;
      save.disabled = true;
      cancel.disabled = true;
      const result = await this.host.renameAsset(this.record, input.value);
      if (this.destroyed) return;
      saving = false;
      cancel.disabled = false;
      if (result.ok) finish();
      else {
        message.setText(result.message);
        save.disabled = false;
      }
    };

    input.addEventListener('input', check);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!saving) finish();
      }
    });
    save.addEventListener('click', () => void submit());
    cancel.addEventListener('click', () => finish());
    input.focus();
    input.select();
  }

  private openPreview(): void {
    const file = this.host.app.vault.getAbstractFileByPath(this.record.path);
    if (!(file instanceof TFile)) return;
    if (this.record.kind === 'pdf') void this.host.app.workspace.getLeaf('tab').openFile(file);
    else new PreviewModal(this.host.app, file).open();
  }
}
