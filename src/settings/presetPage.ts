import type { SettingDefinitionItem } from 'obsidian';
import { readControl } from '../core/controls';
import { presetSummary } from '../core/presets';
import type { Preset } from '../core/types';
import { presetScopeTarget, renderScopeEditor } from './scopeEditor';
import type { RuleFormContext } from './ruleForm';

/** Everything on one preset's page. Uses the same controls as a folder rule. */
export function presetItems(
  ctx: RuleFormContext,
  preset: Preset,
  actions: { applyToFolders: () => void; confirmDelete: () => void },
): SettingDefinitionItem[] {
  const key = (field: string) => `preset:${preset.id}:${field}`;
  const value = (field: string) => readControl(ctx.store.settings, key(field));
  const disabled = ctx.readOnly;

  return [
    { name: presetSummary(preset) },
    {
      name: 'Name',
      control: {
        type: 'text',
        key: key('name'),
        disabled,
        validate: (text: string) => {
          if (text.trim() === '') return 'The name cannot be empty.';
          const taken = ctx.store.settings.presets.some((other) => other.id !== preset.id && other.name.toLowerCase() === text.trim().toLowerCase());
          return taken ? 'Another preset already has this name.' : undefined;
        },
      },
    },
    {
      type: 'group',
      heading: 'Naming',
      items: [
        { name: 'Use the General naming pattern', control: { type: 'toggle', key: key('useGeneralNaming'), disabled } },
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
          render: (setting) => renderScopeEditor(ctx, setting, presetScopeTarget(ctx, preset.id)),
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
      ],
    },
    {
      type: 'group',
      heading: 'This preset',
      items: [
        {
          name: 'Apply to folders…',
          desc: 'Copies these values into the folders you choose. Later edits to this preset do not change folders that already have it.',
          action: actions.applyToFolders,
        },
        { name: 'Delete this preset', desc: 'Folders that already received it keep their settings.', action: actions.confirmDelete },
      ],
    },
  ];
}
