const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, join, line, emit, success, nextEvent, until, randomUUID } = require('./helpers');

test('join and late join receive authoritative state; retries deduplicate and identities are server assigned', async (t) => {
  const f = await fixture(t);
  const a = await f.connect();
  const alice = await join(a, 'room_123', '  Alice  ', randomUUID().toUpperCase());
  assert.deepEqual(Object.keys(a.state).sort(), ['lines', 'messages', 'participants', 'redoStack']);
  assert.equal(a.state.participants[0].userId, a.id);
  assert.equal(a.state.participants[0].name, 'Alice');
  const stroke = line({ id: randomUUID().toUpperCase(), userId: randomUUID() });
  await success(a, 'drawing-data', { sessionId: 'room_123', line: stroke });
  await success(a, 'drawing-data', { sessionId: 'room_123', line: stroke });
  assert.equal(a.state.lines.length, 1);
  assert.equal(a.state.lines[0].id, stroke.id);
  assert.equal(a.state.lines[0].userId, alice);
  const b = await f.connect();
  await join(b, 'room_123', 'Bob');
  assert.deepEqual(b.state.lines, a.state.lines);
  assert.equal(b.state.participants.length, 2);
  assert.equal(b.state.redoStack.length, 0);
  assert.deepEqual(await b.timeout(2000).emitWithAck('request-state'), { ok: true });
  assert.equal((await emit(b, 'drawing-data', { sessionId: 'room_123', line: stroke })).ok, false);
  await success(a, 'undo-action', { sessionId: 'room_123' });
  await success(a, 'drawing-data', { sessionId: 'room_123', line: stroke });
  assert.equal(a.state.lines.length, 0, 'A delayed retry does not resurrect an undone stroke');
  assert.equal(a.state.redoStack.length, 1);
  const replacement = line();
  await success(a, 'drawing-data', { sessionId: 'room_123', line: replacement });
  await f.restart();
  const reconnect = await f.connect();
  await join(reconnect, 'room_123', 'Alice', alice);
  await success(reconnect, 'drawing-data', { sessionId: 'room_123', line: stroke });
  assert.deepEqual(reconnect.state.lines.map((item) => item.id), [replacement.id],
    'Retries remain deduplicated after redo is discarded and the server restarts');
});

test('concurrent per-guest undo/redo retains other guests and personalizes redo stacks', async (t) => {
  const f = await fixture(t);
  const a = await f.connect();
  const b = await f.connect();
  const alice = await join(a, 'room_123', 'Alice');
  const bob = await join(b, 'room_123', 'Bob');
  const a1 = line(); const a2 = line(); const b1 = line(); const b2 = line();
  await Promise.all([
    success(a, 'drawing-data', { sessionId: 'room_123', line: a1 }),
    success(b, 'drawing-data', { sessionId: 'room_123', line: b1 }),
  ]);
  await Promise.all([
    success(a, 'drawing-data', { sessionId: 'room_123', line: a2 }),
    success(b, 'drawing-data', { sessionId: 'room_123', line: b2 }),
  ]);
  await Promise.all([success(a, 'undo-action', { sessionId: 'room_123' }), success(b, 'undo-action', { sessionId: 'room_123' })]);
  await until(() => a.state.lines.length === 2 && b.state.lines.length === 2);
  assert.deepEqual(new Set(a.state.lines.map((item) => item.id)), new Set([a1.id, b1.id]));
  assert.deepEqual(a.state.redoStack.map((item) => item.id), [a2.id]);
  assert.deepEqual(b.state.redoStack.map((item) => item.id), [b2.id]);
  assert.equal(a.state.redoStack[0].userId, alice);
  assert.equal(b.state.redoStack[0].userId, bob);
  await success(a, 'redo-action', { sessionId: 'room_123' });
  await until(() => b.state.lines.length === 3);
  assert.deepEqual(b.state.redoStack.map((item) => item.id), [b2.id]);
  const a3 = line();
  await success(a, 'drawing-data', { sessionId: 'room_123', line: a3 });
  await success(b, 'redo-action', { sessionId: 'room_123' });
  await until(() => a.state.lines.length === 5);
  assert.equal(a.state.lines.filter((item) => item.userId === bob).length, 2);
  await success(a, 'undo-action', { sessionId: 'room_123' });
  await success(b, 'undo-action', { sessionId: 'room_123' });
  await success(a, 'drawing-data', { sessionId: 'room_123', line: line() });
  assert.equal(a.state.redoStack.length, 0, 'A new commit clears only the author redo history');
  await until(() => b.state.redoStack.length === 1);
});

test('chat is persisted and trusted; clear removes every redo history but retains chat', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(); const b = await f.connect();
  const clientId = await join(a, 'room_123', 'Alice');
  await join(b, 'room_123', 'Bob');
  await success(a, 'chat-message', { sessionId: 'room_123', message: '  Hello team!  ' });
  await until(() => b.state.messages.length === 1);
  const message = b.state.messages[0];
  assert.equal(message.message, 'Hello team!');
  assert.equal(message.name, 'Alice');
  assert.equal(message.userId, clientId);
  assert.match(message.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(message.createdAt).toISOString(), message.createdAt);
  await success(a, 'drawing-data', { sessionId: 'room_123', line: line() });
  await success(b, 'drawing-data', { sessionId: 'room_123', line: line() });
  await success(a, 'undo-action', { sessionId: 'room_123' });
  await success(b, 'undo-action', { sessionId: 'room_123' });
  await success(a, 'clear-canvas', { sessionId: 'room_123' });
  await until(() => b.state.redoStack.length === 0);
  assert.deepEqual(a.state.lines, []);
  assert.deepEqual(a.state.redoStack, []);
  assert.deepEqual(a.state.messages, [message]);
  await success(b, 'redo-action', { sessionId: 'room_123' });
  assert.deepEqual(b.state.lines, []);
  const late = await f.connect();
  await join(late);
  assert.deepEqual(late.state.messages, [message]);
});

test('preview and cursor broadcasts use bound identities; commit, leave, and disconnect clean up', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(); const b = await f.connect();
  const clientId = await join(a, 'room_123', 'Alice');
  await join(b, 'room_123', 'Bob');
  const stroke = line();
  const preview = nextEvent(b, 'stroke-preview');
  await success(a, 'stroke-preview', { sessionId: 'room_123', line: stroke });
  assert.equal((await preview).line.userId, clientId);
  const cursor = nextEvent(b, 'cursor-update');
  await success(a, 'cursor-update', { sessionId: 'room_123', x: 1600, y: 1000 });
  assert.deepEqual(await cursor, { userId: a.id, name: 'Alice', color: a.state.participants[0].color, x: 1600, y: 1000 });
  const endA = nextEvent(a, 'stroke-end'); const endB = nextEvent(b, 'stroke-end');
  await success(a, 'drawing-data', { sessionId: 'room_123', line: stroke });
  assert.deepEqual(await endA, { id: stroke.id });
  assert.deepEqual(await endB, { id: stroke.id });
  const nextStroke = line();
  await success(a, 'stroke-preview', { sessionId: 'room_123', line: nextStroke });
  assert.equal((await emit(b, 'stroke-end', { id: nextStroke.id })).ok, false);
  const ended = nextEvent(b, 'stroke-end');
  a.disconnect();
  assert.deepEqual(await ended, { id: nextStroke.id });
  await until(() => b.participants.length === 1);
  assert.equal(b.participants[0].userId, b.id);
  const reconnect = await f.connect();
  await join(reconnect, 'room_123', 'Alice', clientId);
  await success(reconnect, 'undo-action', { sessionId: 'room_123' });
  assert.deepEqual(reconnect.state.lines, []);
  await success(reconnect, 'leave-session', { sessionId: 'room_123' });
  assert.equal((await emit(reconnect, 'request-state', { sessionId: 'room_123' })).ok, false);
});

test('all room events enforce membership, switching rooms removes old membership, and rooms stay isolated', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(); const b = await f.connect(); const outsider = await f.connect();
  const alice = await join(a, 'room_123', 'Alice');
  await join(b, 'other_123', 'Bob');
  const commands = [
    ['drawing-data', { line: line() }], ['stroke-preview', { line: line() }], ['cursor-update', { x: 10, y: 20 }],
    ['chat-message', { message: 'Intruder' }], ['undo-action', {}], ['redo-action', {}], ['clear-canvas', {}], ['request-state', {}],
  ];
  for (const [event, extra] of commands) {
    assert.equal((await emit(outsider, event, { sessionId: 'room_123', ...extra })).ok, false, event);
    assert.equal((await emit(b, event, { sessionId: 'room_123', ...extra })).ok, false, event);
  }
  assert.equal((await emit(outsider, 'stroke-end', { id: randomUUID() })).ok, false);
  await success(a, 'drawing-data', { sessionId: 'room_123', line: line() });
  await success(a, 'chat-message', { sessionId: 'room_123', message: 'Private room message' });
  assert.deepEqual(b.state.lines, []);
  assert.deepEqual(b.state.messages, []);
  await join(a, 'other_123', 'Alice', alice);
  assert.equal(a.state.participants.length, 2);
  assert.equal((await emit(a, 'drawing-data', { sessionId: 'room_123', line: line() })).ok, false);
  assert.equal((await emit(a, 'join-session', { sessionId: 'room_123', name: 'Alice', clientId: randomUUID() })).ok, false);
  const late = await f.connect();
  await join(late, 'room_123');
  assert.equal(late.state.participants.length, 1);
  assert.equal(late.state.lines.length, 1);
  assert.equal(late.state.messages.length, 1);
});
