import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, VAULT_ROOT, queryAssets, type AssetQuery } from '../../src/core/assetFilter';
import { makeRecord } from '../../src/core/assetIndex';
import { DEFAULT_FILTERS, activeTab, addView, deleteView, filtersFromFolder, filtersOf, renameView, suggestViewName, tabMatches, tabsFor } from '../../src/core/savedViews';
import type { SavedView } from '../../src/core/types';
import { rule } from '../fixtures/exampleVault';

const query = (patch: Partial<AssetQuery> = {}): AssetQuery => ({ ...DEFAULT_QUERY, ...patch });

describe('Used / Unused filter', () => {
  const records = [
    makeRecord('A/used.png', 'png', 'image', 1, 1),
    makeRecord('A/unused.png', 'png', 'image', 1, 2),
    makeRecord('A/also-used.png', 'png', 'image', 1, 3),
  ];
  const counts: Record<string, number> = { 'A/used.png': 2, 'A/also-used.png': 1 };
  const usage = (ready: boolean) => ({ ready, count: (path: string) => counts[path] ?? 0 });
  const names = (used: AssetQuery['used'], ready = true) => queryAssets(records, query({ used, sort: 'name', direction: 'asc' }), usage(ready)).map((r) => r.name);

  it('shows only used files', () => expect(names('used')).toEqual(['also-used.png', 'used.png']));
  it('shows only unused files', () => expect(names('unused')).toEqual(['unused.png']));
  it('shows everything for any', () => expect(names('')).toHaveLength(3));

  it('does not filter until the usage data is ready, rather than show a wrong answer', () => {
    expect(names('unused', false)).toHaveLength(3);
    expect(queryAssets(records, query({ used: 'unused' }))).toHaveLength(3);
  });

  it('combines with the other filters', () => {
    const mixed = [...records, makeRecord('B/doc.pdf', 'pdf', 'pdf', 1, 4)];
    expect(queryAssets(mixed, query({ used: 'unused', kind: 'pdf' }), usage(true)).map((r) => r.name)).toEqual(['doc.pdf']);
  });
});

describe('filtersFromFolder', () => {
  it('splits a folder into parent and subfolder', () => {
    expect(filtersFromFolder('Mathematics/Assets')).toEqual({ parent: 'Mathematics', subfolder: 'Assets' });
    expect(filtersFromFolder('Mathematics/Books/Files/')).toEqual({ parent: 'Mathematics', subfolder: 'Books/Files' });
    expect(filtersFromFolder('Inbox')).toEqual({ parent: 'Inbox', subfolder: '' });
  });

  it('uses the vault root marker for the root', () => {
    expect(filtersFromFolder('')).toEqual({ parent: VAULT_ROOT, subfolder: '' });
  });
});

describe('tabsFor', () => {
  const rules = [
    rule('m', 'Mathematics', 'Mathematics/Assets'),
    { ...rule('off', 'Engineering', 'Engineering/Assets'), enabled: false },
    rule('blank', 'Inbox', ''),
    rule('p', 'Physics', 'Physics/Assets'),
  ];
  const views: SavedView[] = [{ id: 'view-1', name: 'Unused maths', filters: { ...DEFAULT_FILTERS, parent: 'Mathematics', used: 'unused' } }];

  it('lists All, then enabled rules with a save-to folder in rule order, then pinned views', () => {
    const tabs = tabsFor({ rules, views });
    expect(tabs.map((t) => t.id)).toEqual(['all', 'rule:m', 'rule:p', 'view:view-1']);
    expect(tabs.map((t) => t.source)).toEqual(['all', 'rule', 'rule', 'view']);
    expect(tabs[1]).toMatchObject({ name: 'Mathematics', filters: { parent: 'Mathematics', subfolder: 'Assets' } });
  });

  it('is just All with no rules or views', () => {
    expect(tabsFor({ rules: [], views: [] })).toHaveLength(1);
  });
});

describe('active tab', () => {
  const tabs = tabsFor({ rules: [rule('m', 'Mathematics', 'Mathematics/Assets')], views: [{ id: 'v', name: 'Unused', filters: { ...DEFAULT_FILTERS, used: 'unused' } }] });

  it('is All when nothing is filtered', () => {
    expect(activeTab(query(), tabs)?.id).toBe('all');
  });

  it('matches a rule tab exactly, ignoring case', () => {
    expect(activeTab(query({ parent: 'mathematics', subfolder: 'assets' }), tabs)?.id).toBe('rule:m');
  });

  it('does not match when the folder is narrower or different', () => {
    expect(activeTab(query({ parent: 'Mathematics', subfolder: 'Assets/Diagrams' }), tabs)).toBeUndefined();
    expect(activeTab(query({ parent: 'Mathematics' }), tabs)).toBeUndefined();
  });

  it('stops matching as soon as text is typed in the search box', () => {
    expect(activeTab(query({ search: 'graph' }), tabs)).toBeUndefined();
    expect(tabMatches(query({ search: '   ' }), tabs[0] ?? (undefined as never))).toBe(true);
  });

  it('ignores sort but not the type or the Used filter', () => {
    expect(activeTab(query({ sort: 'name', direction: 'asc' }), tabs)?.id).toBe('all');
    expect(activeTab(query({ used: 'unused' }), tabs)?.id).toBe('view:v');
    expect(activeTab(query({ kind: 'pdf' }), tabs)).toBeUndefined();
  });
});

describe('pinned views', () => {
  const filters = { ...DEFAULT_FILTERS, parent: 'Physics', used: 'unused' as const };

  it('adds a view with a fresh id, copying the filters', () => {
    const views = addView([], 'Spare physics', filters);
    expect(views).toEqual([{ id: 'view-1', name: 'Spare physics', filters }]);
    expect(views[0]?.filters).not.toBe(filters);
    expect(addView(views, 'Another', filters)[1]?.id).toBe('view-2');
  });

  it('reuses a freed id only when it is free', () => {
    const views = addView(addView([], 'a', filters), 'b', filters);
    const after = deleteView(views, 'view-1');
    expect(addView(after, 'c', filters).map((v) => v.id)).toEqual(['view-2', 'view-1']);
  });

  it('names a view from its filters when no name is given', () => {
    expect(addView([], '  ', filters)[0]?.name).toBe('Physics: Unused');
  });

  it('renames and deletes, ignoring blank names and unknown ids', () => {
    const views = addView([], 'Old', filters);
    expect(renameView(views, 'view-1', ' New ')[0]?.name).toBe('New');
    expect(renameView(views, 'view-1', '  ')[0]?.name).toBe('Old');
    expect(deleteView(views, 'nope')).toHaveLength(1);
    expect(deleteView(views, 'view-1')).toEqual([]);
  });

  it('suggests readable names', () => {
    expect(suggestViewName({ ...DEFAULT_FILTERS, parent: 'Maths', subfolder: 'Assets/Diagrams' })).toBe('Maths / Assets / Diagrams');
    expect(suggestViewName({ ...DEFAULT_FILTERS, kind: 'pdf' })).toBe('PDFs');
    expect(suggestViewName({ ...DEFAULT_FILTERS, parent: VAULT_ROOT, used: 'used', kind: 'image' })).toBe('Vault root: Used Images');
    expect(suggestViewName(DEFAULT_FILTERS)).toBe('My view');
  });

  it('takes its filters from the page query', () => {
    expect(filtersOf(query({ parent: 'A', subfolder: 'B', kind: 'pdf', used: 'used', sort: 'size', direction: 'asc', search: 'ignored' }))).toEqual({
      parent: 'A', subfolder: 'B', kind: 'pdf', used: 'used', sort: 'size', direction: 'asc',
    });
  });
});
