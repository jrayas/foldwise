import type { Setting } from 'obsidian';
import { describeRoute } from '../core/describeRoute';
import { route } from '../core/route';
import type { FileKind } from '../core/types';
import { buildIndex } from '../obsidian/vaultIndex';
import type { RuleFormContext, TestInput } from './ruleForm';

/** Type a note path and see where a pasted file would go, what it would be called, and why. Saves nothing. */
export function renderTestPanel(ctx: RuleFormContext, setting: Setting, ruleId: string): void {
  const input: TestInput = ctx.testInputs.get(ruleId) ?? { path: '', kind: 'image' };
  ctx.testInputs.set(ruleId, input);

  setting.setName('Try a note path');
  const show = () => {
    setting.descEl.empty();
    if (input.path.trim() === '') {
      setting.descEl.setText('Type the path of a note to see where a pasted file would be saved.');
      return;
    }
    const taken = new Set(buildIndex(ctx.app.vault).keys());
    const file = input.kind === 'pdf' ? { ext: 'pdf', kind: 'pdf' as const } : { ext: 'png', kind: 'image' as const };
    const result = route(ctx.store.settings, input.path, file, { now: new Date(), exists: (path) => taken.has(path.toLowerCase()) });
    const description = describeRoute(result);
    setting.descEl.createDiv({ text: description.headline, cls: 'foldwise-test-headline' });
    setting.descEl.createDiv({ text: description.detail });
  };

  setting.addText((text) =>
    text
      .setPlaceholder('Mathematics/Concepts/limits.md')
      .setValue(input.path)
      .onChange((value) => {
        input.path = value;
        show();
      }),
  );
  setting.addDropdown((dropdown) =>
    dropdown
      .addOptions({ image: 'Image', pdf: 'PDF' })
      .setValue(input.kind)
      .onChange((value) => {
        input.kind = value as FileKind;
        show();
      }),
  );
  show();
}
