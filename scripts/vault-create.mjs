// Builds (or refreshes) the template test vault from CLAUDE.md's example vault.
// Never touches .obsidian/plugins, which `npm run dev` owns.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { templateVault } from './lib/env.mjs';

// A valid 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const folders = [
  'Mathematics/Assets/Diagrams',
  'Mathematics/Assets/Screenshots',
  'Mathematics/Concepts',
  'Mathematics/Questions',
  'Mathematics/Knowledge',
  'Mathematics/Books/Files',
  'Mathematics/Books/Deep',
  'Physics/Assets',
  'Physics/Concepts',
  'Physics/Questions',
  'Physics/Knowledge',
  'Physics/Books/Files',
  'Engineering/Assets',
  'Engineering/Books/Files',
  'Inbox',
];

const notes = {
  'readme.md': '# Foldwise test vault\n',
  'Mathematics/Concepts/limits.md': '# Limits\n',
  'Mathematics/Books/calc.md': '# Calculus book\n',
  'Mathematics/Books/Deep/x.md': '# Deep note\n',
  'Physics/Concepts/motion.md': '# Motion\n',
  'Physics/Books/optics.md': '# Optics book\n',
  'Engineering/Books/beams.md': '# Beams book\n',
  'Inbox/idea.md': '# Idea\n',
};

const images = ['Mathematics/Assets/Diagrams/limits-graph.png', 'Physics/Assets/ramp.png', 'Inbox/loose.png'];

for (const folder of folders) await mkdir(path.join(templateVault, folder), { recursive: true });
for (const [file, text] of Object.entries(notes)) await writeFile(path.join(templateVault, file), text);
for (const file of images) await writeFile(path.join(templateVault, file), PNG);

await mkdir(path.join(templateVault, '.obsidian'), { recursive: true });
await writeFile(
  path.join(templateVault, '.obsidian', 'community-plugins.json'),
  JSON.stringify(['foldwise'], null, 2) + '\n',
);

console.log(`Template vault ready: ${templateVault}`);
