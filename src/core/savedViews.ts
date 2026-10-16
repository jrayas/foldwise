// The tabs across the top of the asset manager page: All, one per folder rule, and views the person pinned.
// Pure. A tab counts as active only while the filters match it exactly, so there is no state to keep in step.
import { VAULT_ROOT, type AssetQuery } from './assetFilter';
import { normalisePath } from './paths';
import { ruleLabel } from './summary';
import type { FoldwiseSettings, SavedView, ViewFilters } from './types';

export const DEFAULT_FILTERS: ViewFilters = { parent: '', subfolder: '', kind: '', used: '', sort: 'modified', direction: 'desc' };

export interface Tab {
  /** "all", "rule:<rule id>" or "view:<view id>". */
  id: string;
  name: string;
  filters: ViewFilters;
  /** Only pinned views can be renamed or removed; rule tabs follow the rules. */
  source: 'all' | 'rule' | 'view';
}

/** The Parent and Subfolder filters that show a folder and everything under it. "" is the vault root. */
export function filtersFromFolder(folder: string): Pick<ViewFilters, 'parent' | 'subfolder'> {
  const parts = normalisePath(folder).split('/').filter((part) => part !== '');
  const [parent, ...rest] = parts;
  if (parent === undefined) return { parent: VAULT_ROOT, subfolder: '' };
  return { parent, subfolder: rest.join('/') };
}

/** All, then a tab for each enabled rule that has a save-to folder (in rule order), then pinned views. */
export function tabsFor(settings: Pick<FoldwiseSettings, 'rules' | 'views'>): Tab[] {
  const tabs: Tab[] = [{ id: 'all', name: 'All', filters: { ...DEFAULT_FILTERS }, source: 'all' }];
  for (const rule of settings.rules) {
    if (!rule.enabled || normalisePath(rule.saveTo) === '') continue;
    tabs.push({
      id: `rule:${rule.id}`,
      name: ruleLabel(rule),
      filters: { ...DEFAULT_FILTERS, ...filtersFromFolder(rule.saveTo) },
      source: 'rule',
    });
  }
  for (const view of settings.views) tabs.push({ id: `view:${view.id}`, name: view.name, filters: { ...view.filters }, source: 'view' });
  return tabs;
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The filters that make up a tab, taken from the page's current query (sort is part of a pinned view). */
export function filtersOf(query: AssetQuery): ViewFilters {
  return { parent: query.parent, subfolder: query.subfolder, kind: query.kind, used: query.used, sort: query.sort, direction: query.direction };
}

/** Does the page's query show exactly this tab? Sort is ignored, and any search text means it no longer does. */
export function tabMatches(query: AssetQuery, tab: Tab): boolean {
  return (
    query.search.trim() === '' &&
    same(query.parent, tab.filters.parent) &&
    same(query.subfolder, tab.filters.subfolder) &&
    query.kind === tab.filters.kind &&
    query.used === tab.filters.used
  );
}

/** The tab to show as active, or undefined when the filters match none (a custom filter). */
export function activeTab(query: AssetQuery, tabs: readonly Tab[]): Tab | undefined {
  return tabs.find((tab) => tabMatches(query, tab));
}

/** "Mathematics / Assets", "Unused", "PDFs": a starting name for a view being pinned. */
export function suggestViewName(filters: ViewFilters): string {
  const where = filters.parent === '' ? '' : filters.parent === VAULT_ROOT ? 'Vault root' : [filters.parent, ...filters.subfolder.split('/').filter(Boolean)].join(' / ');
  const used = filters.used === 'used' ? 'Used' : filters.used === 'unused' ? 'Unused' : '';
  const kind = filters.kind === 'image' ? 'Images' : filters.kind === 'pdf' ? 'PDFs' : '';
  return [where, [used, kind].filter(Boolean).join(' ')].filter(Boolean).join(': ') || 'My view';
}

export function addView(views: readonly SavedView[], name: string, filters: ViewFilters): SavedView[] {
  const used = new Set(views.map((view) => view.id));
  let n = 1;
  while (used.has(`view-${n}`)) n++;
  return [...views, { id: `view-${n}`, name: name.trim() === '' ? suggestViewName(filters) : name.trim(), filters: { ...filters } }];
}

export function renameView(views: readonly SavedView[], id: string, name: string): SavedView[] {
  const trimmed = name.trim();
  if (trimmed === '') return [...views];
  return views.map((view) => (view.id === id ? { ...view, name: trimmed } : view));
}

export function deleteView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}
