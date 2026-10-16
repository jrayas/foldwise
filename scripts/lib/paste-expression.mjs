// Builds the page-side code that simulates pasting a file into a note's editor.
// A real clipboard cannot be driven, so this dispatches a genuine ClipboardEvent carrying a File.

// A valid 1x1 PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * @param {string} notePath vault-relative path of the note to paste into
 * @param {{ names?: string[], type?: string, html?: boolean, waitMs?: number }} options
 *   names: file names to paste together (default ["image.png"]); type: MIME type for all of them;
 *   html: also put text/html on the clipboard, like a copy from a web page
 */
export function pasteExpression(notePath, options = {}) {
  const config = JSON.stringify({ notePath, names: options.names ?? ['image.png'], type: options.type ?? 'image/png', html: !!options.html, waitMs: options.waitMs ?? 1200, png: PNG_BASE64 });
  return `(async () => {
    const c = ${config};
    const note = app.vault.getFileByPath(c.notePath);
    if (!note) throw new Error('No such note: ' + c.notePath);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(note);
    const editor = leaf.view.editor;
    editor.focus();
    editor.setCursor(editor.lastLine(), editor.getLine(editor.lastLine()).length);
    const before = new Set(app.vault.getAllLoadedFiles().map((f) => f.path));
    const bytes = Uint8Array.from(atob(c.png), (ch) => ch.charCodeAt(0));
    const data = new DataTransfer();
    for (const name of c.names) data.items.add(new File([bytes], name, { type: c.type }));
    if (c.html) data.setData('text/html', '<p>copied</p>');
    const target = leaf.view.contentEl.querySelector('.cm-content');
    if (!target) throw new Error('The note is not in editing mode.');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, c.waitMs));
    return {
      defaultPrevented: event.defaultPrevented,
      added: app.vault.getAllLoadedFiles().map((f) => f.path).filter((p) => !before.has(p)),
      noteText: editor.getValue(),
      modals: document.querySelectorAll('.modal-container').length,
      notices: [...document.querySelectorAll('.notice')].map((n) => n.textContent),
    };
  })()`;
}
