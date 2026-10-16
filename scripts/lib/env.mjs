// Shared locations and helpers for the dev/debug scripts. Cross-platform: no shell commands.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'foldwise';
export const PORT = Number(process.env.FOLDWISE_DEBUG_PORT ?? 9222);

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const templateVault = path.join(root, 'dev', 'testvault');
export const syntheticVault = path.join(root, 'dev', 'synthetic');
export const scratchRoot = path.join(root, 'dev', 'scratch');
export const scratchVault = path.join(scratchRoot, 'vault');
export const scratchProfile = path.join(scratchRoot, 'profile');
export const pidFile = path.join(scratchRoot, 'obsidian.pid');
export const logFile = path.join(scratchRoot, 'obsidian.log');
export const shotsDir = path.join(scratchRoot, 'shots');

export const pluginFiles = ['main.js', 'manifest.json', 'styles.css'];
/** Where `npm run dev` writes the three files. */
export const devPluginDir = path.join(templateVault, '.obsidian', 'plugins', PLUGIN_ID);
export const scratchPluginDir = path.join(scratchVault, '.obsidian', 'plugins', PLUGIN_ID);

export function obsidianBinary() {
  if (process.env.OBSIDIAN_BIN) return process.env.OBSIDIAN_BIN;
  if (process.platform === 'darwin') return '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? '', 'Obsidian', 'Obsidian.exe');
  }
  return 'obsidian';
}

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
