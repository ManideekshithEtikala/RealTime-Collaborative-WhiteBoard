const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { fixture, join, line, emit, success, until, delay, randomUUID } = require('./helpers');

test('restart restores drawings, chat, and each guest redo history in an external DATA_DIR', async (t) => {
  const f = await fixture(t);
  let a = await f.connect(); let b = await f.connect();
  const alice = await join(a, 'room_123', 'Alice');
  const bob = await join(b, 'room_123', 'Bob');
  const a1 = line(); const b1 = line();
  await success(a, 'drawing-data', { sessionId: 'room_123', line: a1 });
  await success(b, 'drawing-data', { sessionId: 'room_123', line: b1 });
  await success(a, 'chat-message', { sessionId: 'room_123', message: 'Remember this' });
  await success(a, 'undo-action', { sessionId: 'room_123' });
  await f.restart();
  a = await f.connect(); b = await f.connect();
  await join(a, 'room_123', 'Alice', alice);
  await join(b, 'room_123', 'Bob', bob);
  assert.deepEqual(a.state.lines.map((item) => item.id), [b1.id]);
  assert.deepEqual(a.state.redoStack.map((item) => item.id), [a1.id]);
  assert.deepEqual(b.state.redoStack, []);
  assert.equal(a.state.messages[0].message, 'Remember this');
  assert.equal(a.state.participants.length, 2, 'Participant sockets are not persisted');
  await success(a, 'redo-action', { sessionId: 'room_123' });
  assert.deepEqual(new Set(a.state.lines.map((item) => item.id)), new Set([a1.id, b1.id]));
  assert((await fs.readdir(f.dataDir)).includes('whiteboard.sqlite'));
  await success(a, 'clear-canvas', { sessionId: 'room_123' });
  await f.restart();
  const late = await f.connect();
  await join(late, 'room_123', 'Alice', alice);
  assert.deepEqual(late.state.lines, []);
  assert.deepEqual(late.state.redoStack, []);
  assert.equal(late.state.messages.length, 1);
});

test('inactive rooms expire durably while connected rooms are retained', async (t) => {
  const f = await fixture(t, { roomTtlMs: 150, maintenanceMs: 25, maxRooms: 2 });
  const active = await f.connect(); const old = await f.connect();
  const activeId = await join(active, 'active_123');
  await join(old, 'expired_123');
  await success(old, 'drawing-data', { sessionId: 'expired_123', line: line() });
  old.disconnect();
  await delay(300);
  const health = await (await fetch(`${f.url}/api/health`)).json();
  assert.equal(health.rooms, 1);
  await success(active, 'request-state', { sessionId: 'active_123' });
  await f.restart();
  const rejoin = await f.connect();
  await join(rejoin, 'active_123', 'Guest', activeId);
  const empty = await f.connect();
  await join(empty, 'expired_123');
  assert.deepEqual(empty.state.lines, []);
  assert.equal(rejoin.state.participants.length, 1);
});

test('chat retains only the latest 100 messages across restart', async (t) => {
  const f = await fixture(t, { maxParticipants: 30 });
  const sockets = [];
  for (let i = 0; i < 25; i++) {
    const socket = await f.connect();
    await join(socket);
    sockets.push(socket);
  }
  // Spread messages over time to exercise retention within the room mutation budget.
  for (let i = 0; i < 105; i++) {
    await success(sockets[i % sockets.length], 'chat-message', { sessionId: 'room_123', message: `Message ${i}` });
    await delay(40);
  }
  const last = sockets.at(-1);
  await until(() => last.state.messages.length === 100 && last.state.messages.at(-1).message === 'Message 104');
  assert.equal(last.state.messages[0].message, 'Message 5');
  await f.restart();
  const late = await f.connect();
  await join(late);
  assert.equal(late.state.messages.length, 100);
  assert.equal(late.state.messages[0].message, 'Message 5');
  assert.equal(late.state.messages.at(-1).message, 'Message 104');
});

test('CLI graceful shutdown and abrupt process restart preserve acknowledged commits', async (t) => {
  const f = await fixture(t);
  const dataDir = path.join(f.dataDir, 'cli');
  let child;
  let socket;
  const start = async () => {
    child = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
      env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '0', DATA_DIR: dataDir,
        FRONTEND_ORIGINS: 'http://localhost:5173' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    await until(() => /port \d+/.test(stdout) || child.exitCode !== null);
    assert.equal(child.exitCode, null, stderr);
    const port = /port (\d+)/.exec(stdout)[1];
    socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false,
      extraHeaders: { Origin: 'http://localhost:5173' } });
    socket.on('current-state', (state) => { socket.state = state; });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  };
  const stop = async (signal) => {
    const exited = new Promise((resolve) => child.once('exit', (code, received) => resolve({ code, signal: received })));
    child.kill(signal);
    const result = await exited;
    socket.disconnect();
    return result;
  };
  t.after(async () => {
    socket?.disconnect();
    if (child && child.exitCode === null && child.signalCode === null) await stop('SIGKILL');
  });
  const clientId = randomUUID(); const first = line(); const second = line();
  await start();
  await join(socket, 'room_123', 'Alice', clientId);
  await success(socket, 'drawing-data', { sessionId: 'room_123', line: first });
  assert.deepEqual(await stop('SIGTERM'), { code: 0, signal: null });
  await start();
  await join(socket, 'room_123', 'Alice', clientId);
  assert.equal(socket.state.lines[0].id, first.id);
  await success(socket, 'drawing-data', { sessionId: 'room_123', line: second });
  await stop('SIGKILL');
  await start();
  await join(socket, 'room_123', 'Alice', clientId);
  assert.deepEqual(socket.state.lines.map((item) => item.id), [first.id, second.id]);
  assert.equal((await emit(socket, 'request-state', { sessionId: 'room_123' })).ok, true);
  await stop('SIGTERM');
});
