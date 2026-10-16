// Starts a SECOND, isolated Obsidian on a scratch copy of the template vault, with remote debugging on.
// Usage: node scripts/obsidian-launch.mjs [--release] [--synthetic]
//   --synthetic  open a copy of the 10,000-image vault from "npm run vault:synthetic" instead of the template
//   --release  use only main.js, manifest.json and styles.css from the project root (tests the shipped files)
import { spawn } from 'node:child_process';
import { cp, mkdir, rm, writeFile, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  PORT, root, templateVault, syntheticVault, scratchRoot, scratchVault, scratchProfile, pidFile, logFile,
  devPluginDir, scratchPluginDir, pluginFiles, obsidianBinary, isInside,
} from './lib/env.mjs';
import { portIsOpen, connect, trustVault } from './lib/cdp.mjs';

const release = process.argv.includes('--release');
const synthetic = process.argv.includes('--synthetic');
const sourceVault = synthetic ? syntheticVault : templateVault;

if (await portIsOpen()) {
  console.error(`Port ${PORT} is already in use. Run "npm run debug -- stop" first, or set FOLDWISE_DEBUG_PORT.`);
  process.exit(1);
}
if (!existsSync(sourceVault)) {
  console.error(synthetic ? 'Synthetic vault missing. Run "npm run vault:synthetic" first.' : 'Template vault missing. Run "npm run vault:create" first.');
  process.exit(1);
}
const binary = obsidianBinary();
if (!existsSync(binary) && binary !== 'obsidian') {
  console.error(`Obsidian not found at ${binary}. Set OBSIDIAN_BIN.`);
  process.exit(1);
}
const sourceDir = release ? root : devPluginDir;
for (const file of pluginFiles) {
  if (!existsSync(path.join(sourceDir, file))) {
    console.error(`Missing ${path.join(sourceDir, file)}. Run "${release ? 'npm run build' : 'npm run dev'}" first.`);
    process.exit(1);
  }
}

// Fresh scratch copy every launch. Only ever delete inside dev/scratch.
if (!isInside(scratchRoot, root)) throw new Error('Refusing to clean outside the project.');
await rm(scratchRoot, { recursive: true, force: true });
await mkdir(scratchProfile, { recursive: true });
await cp(sourceVault, scratchVault, {
  recursive: true,
  filter: (source) => !isInside(source, path.join(sourceVault, '.obsidian', 'plugins')) && source !== path.join(sourceVault, '.obsidian', 'plugins'),
});
await mkdir(scratchPluginDir, { recursive: true });
for (const file of pluginFiles) await cp(path.join(sourceDir, file), path.join(scratchPluginDir, file));

// Register the scratch vault in the scratch profile only, never the user's real obsidian.json.
await writeFile(
  path.join(scratchProfile, 'obsidian.json'),
  JSON.stringify({ vaults: { foldwisescratch0001: { path: scratchVault, ts: Date.now(), open: true } } }),
);

const log = await open(logFile, 'w');
const child = spawn(
  binary,
  [
    `--user-data-dir=${scratchProfile}`,
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
  { detached: true, stdio: ['ignore', log.fd, log.fd] },
);
child.unref();
await writeFile(pidFile, String(child.pid));

for (let i = 0; i < 60; i++) {
  if (await portIsOpen()) {
    // The scratch vault is ours, so accept the first-open trust prompt to let the plugin load.
    const client = await connect();
    const trusted = await trustVault(client);
    client.close();
    console.log(trusted ? 'Accepted the trust prompt in the scratch vault.' : 'No trust prompt appeared.');
    console.log(`Obsidian (scratch) running: pid ${child.pid}, port ${PORT}, vault ${scratchVault}`);
    console.log(release ? 'Mode: release files only.' : 'Mode: dev build.');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.error(`Obsidian did not open the debugging port in 30 s. See ${logFile}`);
process.exit(1);
