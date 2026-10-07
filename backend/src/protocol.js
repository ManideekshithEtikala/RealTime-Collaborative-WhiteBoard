const { randomUUID } = require('node:crypto');
const validation = require('./validation');
const { RateLimiter } = require('./rate-limit');
const { roomKey } = require('./rooms');

function attachProtocol(io, rooms, config, logger) {
  const roomLimits = new RateLimiter();
  io.use((socket, next) => {
    if (io.of('/').sockets.size >= config.maxConnections) return next(new Error('Server connection limit reached'));
    next();
  });
  io.on('connection', (socket) => {
    const limits = new RateLimiter();
    socket.use((packet, next) => {
      const ack = typeof packet.at(-1) === 'function' ? packet.at(-1) : () => {};
      const bytes = Buffer.byteLength(JSON.stringify(packet));
      if (!limits.take('events', 300, 150) || bytes > config.maxPayloadBytes ||
        !limits.take('bytes', 2 * 1024 * 1024, 1024 * 1024, bytes)) {
        ack({ ok: false, error: 'Payload or event rate limit exceeded' });
        return;
      }
      next();
    });

    function on(event, capacity, perSecond, handler) {
      socket.on(event, (data, ack) => {
        if (typeof data === 'function' && ack === undefined) {
          ack = data;
          data = undefined;
        }
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          validation.requireValid(limits.take(event, capacity, perSecond), 'Event rate limit exceeded');
          handler(data);
          reply({ ok: true });
        } catch (error) {
          if (!(error instanceof validation.InputError)) logger.error('Whiteboard event failed:', error);
          reply({ ok: false, error: error instanceof validation.InputError ? error.message : 'Unable to persist room state' });
        }
      });
    }

    function member(data, keys = ['sessionId'], optional = false) {
      if (optional && data === undefined) data = {};
      validation.object(data, keys);
      const id = optional && data.sessionId === undefined ? socket.data.sessionId : validation.sessionId(data.sessionId);
      return rooms.memberRoom(socket, id);
    }

    function mutation(room) {
      validation.requireValid(limits.take('mutations', 30, 15) &&
        roomLimits.take(room.sessionId, 60, 30), 'Room mutation rate limit exceeded');
    }

    on('join-session', 10, 1 / 6, (data) => {
      validation.object(data, ['sessionId', 'name', 'clientId']);
      rooms.join(socket, validation.sessionId(data.sessionId), validation.uuid(data.clientId), validation.guestName(data.name));
    });
    on('leave-session', 5, 1, (data) => {
      member(data, ['sessionId'], true);
      rooms.leave(socket);
    });
    on('request-state', 5, 2, (data) => {
      const room = member(data, ['sessionId'], true);
      socket.emit('current-state', rooms.stateFor(room, socket.data.clientId));
    });
    on('drawing-data', 30, 15, (data) => {
      const room = member(data, ['sessionId', 'line']);
      const line = validation.boardObject(data.line, socket.data.clientId);
      mutation(room);
      rooms.commit(room, line);
    });
    on('stroke-preview', 40, 30, (data) => {
      const room = member(data, ['sessionId', 'line']);
      rooms.preview(room, socket, validation.boardObject(data.line, socket.data.clientId));
    });
    on('stroke-end', 40, 30, (data) => {
      validation.object(data, ['id']);
      const room = rooms.memberRoom(socket, socket.data.sessionId);
      const id = validation.uuid(data.id);
      validation.requireValid(room.previews.get(socket.id)?.id === id, 'Preview does not belong to this socket');
      rooms.endPreview(room, socket.id);
    });
    on('cursor-update', 40, 30, (data) => {
      const room = member(data, ['sessionId', 'x', 'y']);
      const x = validation.coordinate(data.x, 1600);
      const y = validation.coordinate(data.y, 1000);
      const { name, color } = room.members.get(socket.id);
      socket.to(roomKey(room.sessionId)).volatile.emit('cursor-update', { userId: socket.id, name, color, x, y });
    });
    on('chat-message', 10, 2, (data) => {
      const room = member(data, ['sessionId', 'message']);
      const message = validation.chatText(data.message);
      const { clientId, name } = room.members.get(socket.id);
      mutation(room);
      rooms.chat(room, { id: randomUUID(), userId: clientId, name, message, createdAt: new Date().toISOString() });
    });
    for (const event of ['undo-action', 'redo-action']) {
      on(event, 30, 15, (data) => {
        const room = member(data);
        mutation(room);
        rooms.history(room, socket.data.clientId, event === 'redo-action');
      });
    }
    on('clear-canvas', 2, 0.2, (data) => {
      const room = member(data);
      mutation(room);
      rooms.clear(room);
    });
    socket.on('disconnect', () => {
      try { rooms.leave(socket); } catch (error) { logger.error('Room cleanup failed:', error); }
    });
  });
  return () => roomLimits.prune();
}

module.exports = { attachProtocol };
