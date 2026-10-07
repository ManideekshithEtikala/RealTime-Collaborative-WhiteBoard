const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { createWhiteboardServer } = require('../server');

function line(overrides = {}) {
  return { id: randomUUID(), tool: 'pen', points: [10, 20, 30, 40], stroke: '#123abc', strokeWidth: 3, ...overrides };
}

function emit(socket, event, data) {
  return socket.timeout(2000).emitWithAck(event, data);
}

async function success(socket, event, data) {
  const result = await emit(socket, event, data);
  assert.deepEqual(result, { ok: true });
  return result;
}

function nextEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 2000);
    const handler = (value) => { clearTimeout(timer); resolve(value); };
    socket.once(event, handler);
  });
}

async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for state');
    await delay(10);
  }
}

async function fixture(t, overrides = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whiteboard-test-'));
  const sockets = [];
  const errors = [];
  let backend;
  let address;
  const start = async () => {
    backend = createWhiteboardServer({ env: {}, config: { dataDir, host: '127.0.0.1', port: 0, ...overrides },
      logger: { error: (...args) => errors.push(args) } });
    address = await backend.listen();
  };
  await start();
  const result = {
    dataDir,
    get backend() { return backend; },
    get url() { return `http://127.0.0.1:${address.port}`; },
    async connect(options = {}) {
      const socket = io(result.url, { transports: ['websocket'], reconnection: false, forceNew: true,
        extraHeaders: { Origin: 'http://localhost:5173' }, ...options });
      sockets.push(socket);
      socket.on('current-state', (state) => { socket.state = state; });
      socket.on('participants', (participants) => { socket.participants = participants; });
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    },
    async restart() {
      sockets.forEach((socket) => socket.disconnect());
      await backend.close();
      await start();
    },
  };
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await backend.close();
    await fs.rm(dataDir, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'No unexpected server errors');
  });
  return result;
}

async function join(socket, sessionId = 'room_123', name = 'Guest', clientId = randomUUID()) {
  await success(socket, 'join-session', { sessionId, name, clientId });
  return clientId;
}

module.exports = { fixture, join, line, emit, success, nextEvent, until, delay, randomUUID };
