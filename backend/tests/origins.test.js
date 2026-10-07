const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const WebSocket = require('ws');
const { fixture, join } = require('./helpers');

test('health works, development origin is allowed, and foreign HTTP/polling/websocket origins are denied', async (t) => {
  const f = await fixture(t);
  const response = await fetch(`${f.url}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await response.json()).storage, 'sqlite');
  const forbidden = await fetch(`${f.url}/api/health`, { headers: { Origin: 'https://foreign.example' } });
  assert.equal(forbidden.status, 403);
  const handshake = await fetch(`${f.url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'https://foreign.example' } });
  assert.equal(handshake.status, 403);
  for (const transport of ['polling', 'websocket']) {
    await assert.rejects(f.connect({ transports: [transport], extraHeaders: { Origin: 'https://foreign.example' } }));
  }
  await assert.rejects(f.connect({ extraHeaders: { Origin: 'null' } }));
  const sameOrigin = await f.connect({ extraHeaders: { Origin: f.url } });
  await join(sameOrigin);
  const noOrigin = await f.connect({ extraHeaders: {} });
  await join(noOrigin);
  const polling = await f.connect({ transports: ['polling'] });
  await join(polling);
});

test('an established polling session cannot bypass origin checks on subsequent requests or websocket upgrades', async (t) => {
  const f = await fixture(t);
  const response = await fetch(`${f.url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'http://localhost:5173' } });
  const { sid } = JSON.parse((await response.text()).slice(1));
  const forbidden = await fetch(`${f.url}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    method: 'POST', body: '40', headers: { Origin: 'https://foreign.example', 'Content-Type': 'text/plain' },
  });
  assert(forbidden.status >= 400);
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${f.url.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket&sid=${sid}`, {
      origin: 'https://foreign.example',
    });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Upgrade was not rejected')); }, 2000);
    ws.on('open', () => { clearTimeout(timer); ws.close(); reject(new Error('Foreign origin upgrade succeeded')); });
    ws.on('error', () => { clearTimeout(timer); resolve(); });
  });
});

test('production serves SPA and assets from dist on the same server and honors exact configured origins', async (t) => {
  const f = await fixture(t, { production: true, frontendOrigins: 'https://boards.example' });
  const dist = path.join(f.dataDir, 'dist');
  await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dist, 'index.html'), '<!doctype html><h1>Whiteboard</h1>');
  await fs.writeFile(path.join(dist, 'assets', 'board-ab123.js'), 'console.log("board");');
  await f.backend.close();
  // Test fixture files stay in temporary DATA_DIR; the project frontend is never modified.
  const { createWhiteboardServer } = require('../server');
  const backend = createWhiteboardServer({ env: {}, config: { dataDir: path.join(f.dataDir, 'production'),
    production: true, frontendOrigins: 'https://boards.example', distDir: dist, port: 0, host: '127.0.0.1' } });
  const address = await backend.listen();
  t.after(() => backend.close());
  const url = `http://127.0.0.1:${address.port}`;
  for (const route of ['/', '/room/room_123']) {
    const response = await fetch(`${url}${route}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Whiteboard/);
  }
  const asset = await fetch(`${url}/assets/board-ab123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(`${url}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${url}/api/missing`)).status, 404);
  assert.equal((await fetch(`${url}/api/health`, { headers: { Origin: 'http://localhost:5173' } })).status, 403);
  const configured = await fetch(`${url}/api/health`, { headers: { Origin: 'https://boards.example' } });
  assert.equal(configured.status, 200);
  assert.equal(configured.headers.get('access-control-allow-origin'), 'https://boards.example');
  assert.equal((await fetch(`${url}/api/health`, { headers: { Origin: 'https://boards.example.evil.test' } })).status, 403);
  const socket = require('socket.io-client').io(url, { transports: ['websocket'], reconnection: false,
    extraHeaders: { Origin: url } });
  t.after(() => socket.disconnect());
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await join(socket);
});
