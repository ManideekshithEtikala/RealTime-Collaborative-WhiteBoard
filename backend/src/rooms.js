const { createHash } = require('node:crypto');
const { requireValid } = require('./validation');

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
const roomKey = (id) => `session:${id}`;
const snapshot = (room) => ({ lines: room.lines, redo: room.redo, messages: room.messages, seen: room.seen });

class Rooms {
  constructor(io, store, config) {
    this.io = io;
    this.store = store;
    this.config = config;
    this.rooms = new Map();
    for (const room of store.load()) {
      this.checkSize(snapshot(room));
      this.rooms.set(room.sessionId, { ...room, members: new Map(), previews: new Map() });
    }
  }

  checkSize(state) {
    requireValid(state.lines.length + state.redo.length <= this.config.maxObjects, 'Room object limit reached');
    requireValid(state.seen.length <= this.config.maxObjects * 2, 'Room drawing ID limit reached; clear the canvas to continue');
    requireValid(state.messages.length <= this.config.maxMessages, 'Room message limit reached');
    requireValid(Buffer.byteLength(JSON.stringify(state)) <= this.config.maxRoomBytes, 'Room storage limit reached');
  }

  getOrCreate(sessionId) {
    let room = this.rooms.get(sessionId);
    if (room) return room;
    this.sweep();
    requireValid(this.rooms.size < this.config.maxRooms, 'Room limit reached; try an existing room');
    room = { sessionId, lines: [], redo: [], messages: [], seen: [], updatedAt: Date.now(),
      members: new Map(), previews: new Map() };
    this.store.save(sessionId, snapshot(room), room.updatedAt);
    this.rooms.set(sessionId, room);
    return room;
  }

  participants(room) {
    return [...room.members.values()].map(({ socket, name, color }) => ({ userId: socket.id, name, color }));
  }

  stateFor(room, clientId) {
    return { lines: room.lines, redoStack: room.redo.filter((line) => line.userId === clientId),
      messages: room.messages, participants: this.participants(room) };
  }

  publish(room) {
    const participants = this.participants(room);
    this.io.to(roomKey(room.sessionId)).emit('participants', participants);
    for (const member of room.members.values()) {
      member.socket.emit('current-state', this.stateFor(room, member.clientId));
    }
  }

  touch(room) {
    const now = Date.now();
    this.store.touch(room.sessionId, now);
    room.updatedAt = now;
  }

  join(socket, sessionId, clientId, name) {
    requireValid(!socket.data.clientId || socket.data.clientId === clientId, 'Guest ID cannot change on this connection');
    const room = this.getOrCreate(sessionId);
    requireValid(room.members.has(socket.id) || room.members.size < this.config.maxParticipants, 'Room is full');
    this.touch(room);
    if (socket.data.sessionId && socket.data.sessionId !== sessionId) this.leave(socket);
    const existingGuest = [...room.members.values()].find((member) => member.clientId === clientId);
    const color = COLORS[createHash('sha256').update(clientId).digest()[0] % COLORS.length];
    socket.data.clientId = clientId;
    socket.data.sessionId = sessionId;
    room.members.set(socket.id, { socket, clientId, name: existingGuest?.name || name, color });
    socket.join(roomKey(sessionId));
    this.publish(room);
  }

  memberRoom(socket, sessionId) {
    const room = this.rooms.get(sessionId);
    requireValid(socket.data.sessionId === sessionId && room?.members.has(socket.id) &&
      socket.rooms.has(roomKey(sessionId)), 'Join this room before sending events');
    return room;
  }

  leave(socket) {
    const room = this.rooms.get(socket.data.sessionId);
    if (!room || !room.members.has(socket.id)) return;
    this.endPreview(room, socket.id);
    room.members.delete(socket.id);
    socket.leave(roomKey(room.sessionId));
    delete socket.data.sessionId;
    try { this.touch(room); } finally { this.publish(room); }
  }

  saveChange(room, state) {
    this.checkSize(state);
    const now = Date.now();
    // A failed durable write leaves the in-memory state and broadcasts untouched.
    this.store.save(room.sessionId, state, now);
    Object.assign(room, state, { updatedAt: now });
    this.publish(room);
  }

  findDrawing(room, id) {
    return room.seen.find((line) => line.id === id);
  }

  commit(room, line) {
    const existing = this.findDrawing(room, line.id);
    requireValid(!existing || existing.userId === line.userId, 'Drawing ID belongs to another guest');
    for (const [socketId, preview] of room.previews) {
      requireValid(preview.id !== line.id || room.members.get(socketId)?.clientId === line.userId,
        'Drawing ID is being previewed by another guest');
    }
    if (!existing) {
      this.saveChange(room, { ...snapshot(room), lines: [...room.lines, line],
        redo: room.redo.filter((item) => item.userId !== line.userId),
        seen: [...room.seen, { id: line.id, userId: line.userId }] });
    } else {
      this.publish(room);
    }
    for (const [socketId, preview] of room.previews) {
      if (preview.id === line.id) room.previews.delete(socketId);
    }
    this.io.to(roomKey(room.sessionId)).emit('stroke-end', { id: line.id });
  }

  history(room, clientId, redo) {
    const source = redo ? room.redo : room.lines;
    const index = source.findLastIndex((line) => line.userId === clientId);
    if (index < 0) {
      this.publish(room);
      return;
    }
    const remaining = source.filter((_, position) => position !== index);
    this.saveChange(room, { ...snapshot(room),
      lines: redo ? [...room.lines, source[index]] : remaining,
      redo: redo ? remaining : [...room.redo, source[index]],
    });
  }

  clear(room) {
    this.saveChange(room, { lines: [], redo: [], messages: room.messages, seen: [] });
    for (const socketId of room.previews.keys()) this.endPreview(room, socketId);
  }

  chat(room, message) {
    this.saveChange(room, { ...snapshot(room), messages: [...room.messages, message].slice(-this.config.maxMessages) });
  }

  preview(room, socket, line) {
    const existing = this.findDrawing(room, line.id);
    requireValid(!existing || existing.userId === line.userId, 'Drawing ID belongs to another guest');
    if (existing) {
      socket.emit('stroke-end', { id: line.id });
      return;
    }
    const previous = room.previews.get(socket.id);
    if (previous && previous.id !== line.id) this.endPreview(room, socket.id);
    for (const [socketId, preview] of room.previews) {
      requireValid(socketId === socket.id || preview.id !== line.id, 'Drawing ID already being previewed');
    }
    room.previews.set(socket.id, { id: line.id, updatedAt: Date.now() });
    socket.to(roomKey(room.sessionId)).volatile.emit('stroke-preview', { line });
  }

  endPreview(room, socketId) {
    const preview = room.previews.get(socketId);
    if (!preview) return;
    room.previews.delete(socketId);
    this.io.to(roomKey(room.sessionId)).emit('stroke-end', { id: preview.id });
  }

  sweep() {
    const now = Date.now();
    for (const [sessionId, room] of this.rooms) {
      if (room.members.size === 0 && room.updatedAt < now - this.config.roomTtlMs) {
        this.store.delete(sessionId);
        this.rooms.delete(sessionId);
        continue;
      }
      if (room.members.size > 0) this.touch(room);
      for (const [socketId, preview] of room.previews) {
        if (preview.updatedAt < now - 10000) this.endPreview(room, socketId);
      }
    }
  }
}

module.exports = { Rooms, roomKey };
