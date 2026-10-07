const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, join, line, emit, success, nextEvent, until, randomUUID } = require('./helpers');

test('invalid joins and malformed event payloads reject without throwing or corrupting state', async (t) => {
  const f = await fixture(t);
  const a = await f.connect();
  for (const payload of [null, 'room_123', {}, { sessionId: '../bad', name: 'Alice', clientId: randomUUID() },
    { sessionId: 'room_123', name: 'Alice', clientId: 'not-a-uuid' },
    { sessionId: 'room_123', name: '<script>', clientId: randomUUID() },
    { sessionId: 'room_123', name: 'a'.repeat(41), clientId: randomUUID() }]) {
    const result = await emit(a, 'join-session', payload);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  }
  await join(a);
  for (const event of ['drawing-data', 'stroke-preview', 'cursor-update', 'chat-message', 'undo-action', 'redo-action', 'clear-canvas']) {
    assert.equal((await emit(a, event, null)).ok, false, event);
  }
  assert.equal((await emit(a, 'undo-action', { sessionId: 'room_123', lines: [], redoStack: [] })).ok, false);
  assert.equal((await emit(a, 'chat-message', { sessionId: 'room_123', message: 'Fake', name: 'Admin', userId: randomUUID() })).ok, false);
  assert.equal((await emit(a, 'cursor-update', { sessionId: 'room_123', x: -1, y: 0 })).ok, false);
  assert.equal((await emit(a, 'cursor-update', { sessionId: 'room_123', x: 1601, y: 0 })).ok, false);
  for (const message of ['', ' ', 'a'.repeat(1001), '\u0000bad', {}]) {
    assert.equal((await emit(a, 'chat-message', { sessionId: 'room_123', message })).ok, false);
  }
  await success(a, 'request-state', {});
  assert.deepEqual(a.state.lines, []);
  assert.deepEqual(a.state.messages, []);
  await success(a, 'drawing-data', { sessionId: 'room_123', line: line() });
  assert.equal(a.state.lines.length, 1, 'Server remains usable after malformed input');
});

test('drawing validation rejects bounds, point counts, tools, colors, widths, IDs, and oversized text', async (t) => {
  const f = await fixture(t);
  const a = await f.connect();
  await join(a);
  const invalid = [
    { id: 'fake' }, { tool: 'image' }, { stroke: 'red' }, { stroke: '#123' }, { strokeWidth: 0 }, { strokeWidth: 41 },
    { strokeWidth: '3' }, { points: [] }, { points: [1, 2, 3] }, { points: [-1, 0] }, { points: [1601, 0] },
    { points: [0, 1001] }, { points: [null, 2] }, { points: ['1', 2] }, { points: Array(8002).fill(1) },
    { tool: 'rectangle', points: [1, 2] }, { tool: 'text', points: [1, 2], text: '' },
    { tool: 'text', text: 'hello' }, { tool: 'text', points: [1, 2], text: 'a'.repeat(501) },
    { text: 123 }, { text: '\u0000' }, { unknown: true },
  ];
  for (const overrides of invalid) {
    assert.equal((await emit(a, 'drawing-data', { sessionId: 'room_123', line: line(overrides) })).ok, false,
      JSON.stringify(overrides).slice(0, 100));
  }
  assert.deepEqual(a.state.lines, []);
  for (const valid of [line({ points: Array(8000).fill(0) }), line({ tool: 'rectangle', points: [0, 0, 1600, 1000] }),
    line({ tool: 'ellipse', points: [0, 0, 1600, 1000] }), line({ tool: 'text', points: [1, 2], text: 'a'.repeat(500) }),
    line({ tool: 'eraser', strokeWidth: 40, points: [0, 0] })]) {
    await success(a, 'drawing-data', { sessionId: 'room_123', line: valid });
  }
  assert.equal(a.state.lines.length, 5);
});

test('room and object limits include redo histories and cannot erase existing state', async (t) => {
  const f = await fixture(t, { maxRooms: 1, maxObjects: 2, maxParticipants: 2 });
  const a = await f.connect(); const b = await f.connect(); const c = await f.connect();
  await join(a); await join(b);
  assert.equal((await emit(c, 'join-session', { sessionId: 'room_123', name: 'Guest', clientId: randomUUID() })).ok, false);
  assert.equal((await emit(c, 'join-session', { sessionId: 'other_123', name: 'Guest', clientId: randomUUID() })).ok, false);
  await success(a, 'drawing-data', { sessionId: 'room_123', line: line() });
  await success(b, 'drawing-data', { sessionId: 'room_123', line: line() });
  await success(a, 'undo-action', { sessionId: 'room_123' });
  await until(() => b.state.lines.length === 1);
  assert.equal((await emit(b, 'drawing-data', { sessionId: 'room_123', line: line() })).ok, false);
  assert.equal(b.state.lines.length, 1);
  await success(a, 'redo-action', { sessionId: 'room_123' });
  assert.equal(a.state.lines.length, 2);
  await success(a, 'undo-action', { sessionId: 'room_123' });
  await success(a, 'drawing-data', { sessionId: 'room_123', line: line() });
  assert.equal(a.state.lines.length, 2, 'Author may replace their discarded redo object at capacity');
});

test('per-event rate limits reject flooding with a bounded acknowledgement', async (t) => {
  const f = await fixture(t);
  const a = await f.connect();
  await join(a);
  const results = await Promise.all(Array.from({ length: 50 }, () => emit(a, 'chat-message', { sessionId: 'room_123', message: 'hello' })));
  assert(results.some((result) => result.ok));
  assert(results.some((result) => result.ok === false && /rate limit/i.test(result.error)));
  assert(a.state.messages.length <= 11);
  await success(a, 'request-state', { sessionId: 'room_123' });
});

test('room byte limit bounds large drawings without losing a previous commit', async (t) => {
  const f = await fixture(t, { maxRoomBytes: 1024 });
  const a = await f.connect();
  await join(a);
  const first = line();
  await success(a, 'drawing-data', { sessionId: 'room_123', line: first });
  const result = await emit(a, 'drawing-data', { sessionId: 'room_123', line: line({ points: Array(8000).fill(1) }) });
  assert.equal(result.ok, false);
  assert.match(result.error, /storage limit/);
  assert.equal(a.state.lines.length, 1);
  assert.equal(a.state.lines[0].id, first.id);
});

test('guests cannot commit a different guest preview ID', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(); const b = await f.connect();
  await join(a); await join(b);
  const stroke = line();
  await success(a, 'stroke-preview', { sessionId: 'room_123', line: stroke });
  const result = await emit(b, 'drawing-data', { sessionId: 'room_123', line: stroke });
  assert.equal(result.ok, false);
  assert.match(result.error, /another guest/);
  await success(a, 'drawing-data', { sessionId: 'room_123', line: stroke });
  assert.equal(a.state.lines.length, 1);
});

test('transport payload ceiling disconnects oversized input and preserves the room', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(); const b = await f.connect();
  await join(a); await join(b);
  const first = line();
  await success(a, 'drawing-data', { sessionId: 'room_123', line: first });
  const disconnected = nextEvent(a, 'disconnect');
  a.emit('drawing-data', { sessionId: 'room_123', line: line({ text: 'a'.repeat(150000) }) });
  await disconnected;
  await until(() => b.state.participants.length === 1);
  await success(b, 'request-state', { sessionId: 'room_123' });
  assert.equal(b.state.lines.length, 1);
  assert.equal(b.state.lines[0].id, first.id);
});
