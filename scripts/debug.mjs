// Drive the scratch Obsidian over the DevTools protocol.
// Usage: node scripts/debug.mjs <command> [args]
//   (add --window settings to any command to drive the separate Settings window)
//   status                 list windows and whether the plugin is loaded
//   eval "<js>"            evaluate JavaScript in the app and print the result
//   reload                 re-copy the built files, reload the plugin, print console output
//   console [ms]           print console and errors for a short window (default 1500)
//   screenshot [file] [--size 420x800]
//                          save a PNG of the window and print its full path (--size emulates a phone-sized window)
//   paste <note> [--name a.png,b.png] [--type image/png] [--html] [--wait ms]
//                          simulate pasting file(s) into a note and report what happened
//   trust                  accept the first-open "trust author" prompt in the scratch vault
//   stop                   stop the scratch Obsidian started by the launch script
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PLUGIN_ID, devPluginDir, scratchPluginDir, pluginFiles, pidFile, shotsDir, scratchRoot, root, isInside,
} from './lib/env.mjs';
import { connect, evaluate, formatEvent, listTargets, portIsOpen, trustVault } from './lib/cdp.mjs';
import { pasteExpression } from './lib/paste-expression.mjs';

const [command, ...rawArgs] = process.argv.slice(2);
// --window settings: drive the separate Settings window instead of the main one.
const windowFlag = rawArgs.indexOf('--window');
const windowName = windowFlag >= 0 ? rawArgs[windowFlag + 1] : 'main';
const args = windowFlag >= 0 ? rawArgs.filter((_, i) => i !== windowFlag && i !== windowFlag + 1) : rawArgs;
const windowMatch = windowName === 'settings' ? (t) => t.type === 'page' && /^Settings/.test(t.title) : undefined;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withClient(fn) {
  const client = await connect({ match: windowMatch });
  const lines = [];
  client.onEvent((method, params) => {
    const line = formatEvent(method, params);
    if (line) lines.push(line);
  });
  await client.send('Runtime.enable'); // replays buffered console messages
  await client.send('Log.enable');
  try {
    return await fn(client, lines);
  } finally {
    client.close();
  }
}

const pluginState = `(() => { const p = app.plugins.plugins['${PLUGIN_ID}']; return { loaded: !!p, enabledInSettings: app.plugins.enabledPlugins.has('${PLUGIN_ID}'), restrictedMode: !app.plugins.isEnabled?.() }; })()`;

switch (command) {
  case 'status': {
    const targets = await listTargets();
    for (const t of targets) console.log(`${t.type}\t${t.url}`);
    await withClient(async (client) => console.log(JSON.stringify(await evaluate(client, pluginState))));
    break;
  }
  case 'eval': {
    await withClient(async (client, lines) => {
      console.log(JSON.stringify(await evaluate(client, args.join(' ')), null, 2));
      await sleep(200);
      lines.forEach((l) => console.log(l));
    });
    break;
  }
  case 'reload': {
    // Which build to load: the dev build unless root release files are newer is overkill; dev build is the default.
    const sourceDir = args.includes('--release') ? root : devPluginDir;
    for (const file of pluginFiles) await cp(path.join(sourceDir, file), path.join(scratchPluginDir, file));
    await withClient(async (client, lines) => {
      lines.length = 0; // drop replayed history, keep only what the reload prints
      const result = await evaluate(client, `(async () => {
        const plugins = app.plugins;
        await plugins.loadManifests?.();
        if (plugins.enabledPlugins.has('${PLUGIN_ID}')) await plugins.disablePlugin('${PLUGIN_ID}');
        await plugins.enablePlugin('${PLUGIN_ID}');
        return { loaded: !!plugins.plugins['${PLUGIN_ID}'] };
      })()`);
      await sleep(1000);
      console.log(JSON.stringify(result));
      lines.forEach((l) => console.log(l));
    });
    break;
  }
  case 'console': {
    await withClient(async (client, lines) => {
      await sleep(Number(args[0] ?? 1500));
      lines.forEach((l) => console.log(l));
      if (lines.length === 0) console.log('(no console output)');
    });
    break;
  }
  case 'screenshot': {
    await withClient(async (client) => {
      const sizeFlag = args.indexOf('--size');
      const sizeArg = sizeFlag >= 0 ? args[sizeFlag + 1] : undefined;
      if (sizeArg) {
        const [width, height] = sizeArg.split('x').map(Number);
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await sleep(500);
      }
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      if (sizeArg) await client.send('Emulation.clearDeviceMetricsOverride');
      const file = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--size') ?? path.join(shotsDir, `shot-${Date.now()}.png`));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(data, 'base64'));
      console.log(file);
    });
    break;
  }
  case 'paste': {
    const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
    const notePath = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
    if (!notePath) { console.error('Usage: paste <note path> [--name a.png,b.png] [--type image/png] [--html] [--wait ms]'); process.exit(1); }
    await withClient(async (client) => {
      const result = await evaluate(client, pasteExpression(notePath, {
        names: flag('--name')?.split(','), type: flag('--type'), html: args.includes('--html'), waitMs: flag('--wait') ? Number(flag('--wait')) : undefined,
      }));
      console.log(JSON.stringify(result, null, 2));
    });
    break;
  }
  case 'trust': {
    await withClient(async (client) => {
      console.log((await trustVault(client, { timeoutMs: 3000 })) ? 'Trusted the scratch vault.' : 'No trust prompt found (already trusted?).');
    });
    break;
  }
  case 'stop': {
    let pid;
    try {
      pid = Number(await readFile(pidFile, 'utf8'));
    } catch {
      console.log('No scratch Obsidian recorded (no pid file). Nothing stopped.');
      break;
    }
    try {
      process.kill(pid);
      for (let i = 0; i < 40 && (await portIsOpen()); i++) await sleep(250); // wait until the port is free again
      console.log(`Stopped scratch Obsidian (pid ${pid}).`);
    } catch {
      console.log(`Process ${pid} was not running.`);
    }
    if (isInside(pidFile, root)) await rm(pidFile, { force: true });
    break;
  }
  default:
    console.error('Commands: status | eval "<js>" | reload [--release] | console [ms] | screenshot [file] | paste <note> [...] | trust | stop');
    process.exit(command ? 1 : 0);
}
