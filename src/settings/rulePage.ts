import type { SettingDefinitionItem } from 'obsidian';
import { readControl } from '../core/controls';
import { renderPattern } from '../core/naming';
import { duplicateRule } from '../core/ruleEdit';
import { summariseRule } from '../core/summary';
import type { Issue } from '../core/validate';
import type { Rule } from '../core/types';
import { ensureFolder } from '../obsidian/vaultIndex';
import { renderScopeEditor, ruleScopeTarget } from './scopeEditor';
import { renderTestPanel } from './testPanel';
import type { RuleFormContext } from './ruleForm';

/** Everything on one rule's page: Basics, Naming, Scope, Advanced and Test. */
export function ruleItems(
  ctx: RuleFormContext,
  rule: Rule,
  issues: Issue[],
  actions: { confirmDelete: () => void; saveAsPreset: () => void; applyPreset: () => void; exportRule: () => void },
): SettingDefinitionItem[] {
  const key = (field: string) => `rule:${rule.id}:${field}`;
  const value = (field: string) => readControl(ctx.store.settings, key(field));
  const disabled = ctx.readOnly;

  const issueRows: SettingDefinitionItem[] = issues.flatMap((issue): SettingDefinitionItem[] => {
    const warning: SettingDefinitionItem = { name: `Warning: ${issue.message}` };
    const fix = issue.fix;
    if (!fix) return [warning];
    return [
      warning,
      {
        name: 'Create the folder',
        desc: fix.path,
        action: () => {
          ensureFolder(ctx.app.vault, fix.path, true).then(ctx.update, () => ctx.update());
        },
      },
    ];
  });

  return [
    { name: summariseRule(rule) },
    ...issueRows,
    {
      type: 'group',
      heading: 'Basics',
      items: [
        { name: 'Enabled', control: { type: 'toggle', key: key('enabled'), disabled } },
        {
          name: 'Applies to',
          desc: 'Notes in this folder, and in its subfolders, use this rule.',
          control: { type: 'folder', key: key('appliesTo'), disabled },
        },
        {
          name: 'Save pasted files to',
          desc: 'The asset folder. It can be anywhere in the vault.',
          control: { type: 'folder', key: key('saveTo'), disabled },
        },
        { name: 'Create the folder if missing', control: { type: 'toggle', key: key('createIfMissing'), disabled } },
      ],
    },
    {
      type: 'group',
      heading: 'Naming',
      items: [
        {
          name: 'Use the General naming pattern',
          control: { type: 'toggle', key: key('useGeneralNaming'), disabled },
        },
        {
          name: 'Naming pattern',
          desc: 'Tokens: {note}, {date:YYYYMMDD} and {n}.',
          visible: () => value('useGeneralNaming') === false,
          control: {
            type: 'text',
            key: key('namingPattern'),
            disabled,
            validate: (text: string) => (text.trim() === '' ? 'The pattern cannot be empty.' : undefined),
          },
        },
        {
          name: 'Example name',
          render: (setting) => {
            const current = value('namingPattern');
            const pattern = typeof current === 'string' ? current : '';
            const rendered = renderPattern(pattern, { noteName: 'limits', now: new Date(), n: 1 });
            setting.setName('Example name');
            setting.setDesc([`${rendered.name}.png`, ...rendered.warnings].join(' · '));
          },
        },
      ],
    },
    {
      type: 'group',
      heading: 'Scope',
      items: [
        {
          name: 'Which notes',
          control: {
            type: 'dropdown',
            key: key('scopeMode'),
            disabled,
            options: {
              everything: 'All notes in the folder',
              exclude: 'All except listed subfolders',
              include: 'Only listed subfolders',
            },
          },
        },
        {
          name: 'Subfolders',
          visible: () => value('scopeMode') !== 'everything',
          render: (setting) => renderScopeEditor(ctx, setting, ruleScopeTarget(ctx, rule.id)),
        },
      ],
    },
    {
      type: 'group',
      heading: 'Advanced',
      items: [
        { name: 'Use the General conflict setting', control: { type: 'toggle', key: key('useGeneralConflict'), disabled } },
        {
          name: 'When a name is already taken',
          desc: 'Applies to patterns without {n}.',
          visible: () => value('useGeneralConflict') === false,
          control: {
            type: 'dropdown',
            key: key('conflict'),
            disabled,
            options: { 'auto-number': 'Add a number', ask: 'Ask me', cancel: 'Cancel the paste' },
          },
        },
        { name: 'Use the General file types', control: { type: 'toggle', key: key('useGeneralFileTypes'), disabled } },
        {
          name: 'Images',
          visible: () => value('useGeneralFileTypes') === false,
          control: { type: 'toggle', key: key('fileType.image'), disabled },
        },
        {
          name: 'PDFs',
          visible: () => value('useGeneralFileTypes') === false,
          control: { type: 'toggle', key: key('fileType.pdf'), disabled },
        },
        {
          name: 'Sort saved files into subfolders',
          desc: 'Not available yet.',
          control: {
            type: 'dropdown',
            key: key('subSort'),
            disabled: true,
            options: { none: 'No sorting', date: 'By date', type: 'By file type' },
          },
        },
      ],
    },
    {
      type: 'group',
      heading: 'Test',
      items: [{ name: 'Try a note path', render: (setting) => renderTestPanel(ctx, setting, rule.id) }],
    },
    {
      type: 'group',
      heading: 'This rule',
      items: [
        {
          name: 'Apply a preset…',
          desc: 'Copies a preset\'s naming, conflict, file type and scope settings into this rule.',
          action: actions.applyPreset,
        },
        {
          name: 'Save as a preset…',
          desc: 'Keeps this rule\'s naming, conflict, file type and scope settings so other folders can use them.',
          action: actions.saveAsPreset,
        },
        { name: 'Export this rule…', desc: 'As plain JSON, to copy or save.', action: actions.exportRule },
        {
          name: 'Duplicate this rule',
          desc: 'The copy starts off.',
          action: () => ctx.apply({ ...ctx.store.settings, rules: duplicateRule(ctx.store.settings.rules, rule.id) }),
        },
        { name: 'Delete this rule', desc: 'Files are never deleted.', action: actions.confirmDelete },
      ],
    },
  ];
}
