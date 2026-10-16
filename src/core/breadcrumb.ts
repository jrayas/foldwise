// Splits a folder path into clickable parts. Pure.
import { VAULT_ROOT } from './assetFilter';

export interface Crumb {
  label: string;
  /** Filter that clicking this part applies. */
  parent: string;
  subfolder: string;
}

/** "Maths/Assets/Diagrams" gives Maths, Assets and Diagrams, each carrying the filter that selects it. */
export function breadcrumbFor(folder: string): Crumb[] {
  const parts = folder.split('/').filter((part) => part !== '');
  if (parts.length === 0) return [{ label: 'Vault root', parent: VAULT_ROOT, subfolder: '' }];
  return parts.map((label, index) => ({
    label,
    parent: parts[0] ?? '',
    subfolder: parts.slice(1, index + 1).join('/'),
  }));
}
