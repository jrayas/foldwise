// Minimal Chrome DevTools Protocol client using Node 22's built-in fetch and WebSocket.
import { PORT } from './env.mjs';

export async function listTargets(port = PORT) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  return response.json();
}

export async function portIsOpen(port = PORT) {
  try {
    await listTargets(port);
    return true;
  } catch {
    return false;
  }
}

/** Connect to the main Obsidian window (the app:// page) unless `match` says otherwise. */
export async function connect({ port = PORT, match } = {}) {
  const targets = await listTargets(port);
  const isMain = (t) => t.type === 'page' && t.url.startsWith('app://');
  const target = targets.find(match ?? isMain);
  if (!target) {
    throw new Error(`No matching window. Open targets: ${targets.map((t) => `${t.type} ${t.url}`).join(' | ')}`);
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('WebSocket connection failed. If the browser rejects the origin, relaunch with --remote-allow-origins=*.')), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${JSON.stringify(message.error.data ?? '')})`));
      else entry.resolve(message.result);
    } else {
      for (const listener of listeners) listener(message.method, message.params);
    }
  });

  return {
    target,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    onEvent(listener) {
      listeners.push(listener);
    },
    close() {
      socket.close();
    },
  };
}

/** Evaluate JavaScript in the page and return its value. Throws if the page code throws. */
export async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails;
    throw new Error(detail.exception?.description ?? detail.text ?? 'Evaluation failed');
  }
  return result.result.value;
}

/** Turn console and exception events into readable lines. */
export function formatEvent(method, params) {
  if (method === 'Runtime.consoleAPICalled') {
    const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    return `[console.${params.type}] ${text}`;
  }
  if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails;
    return `[exception] ${d.exception?.description ?? d.text}`;
  }
  if (method === 'Log.entryAdded') {
    return `[log.${params.entry.level}] ${params.entry.text} ${params.entry.url ?? ''}`.trim();
  }
  return null;
}

/**
 * Click "Trust author and enable plugins" on the first-open prompt of the scratch vault.
 * Only ever used against the isolated scratch profile. Returns true if the prompt was found and clicked.
 */
export async function trustVault(client, { timeoutMs = 10000 } = {}) {
  const expression = `(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Trust author and enable plugins');
    if (!button) return false;
    button.click();
    return true;
  })()`;
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await evaluate(client, expression)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
