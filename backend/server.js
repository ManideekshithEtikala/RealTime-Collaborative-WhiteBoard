const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

const FRONTEND_ORIGIN = 'http://localhost:3000'; // Replace with your frontend URLs

app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  next();
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const sessions = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    if (!sessions[sessionId]) {
      sessions[sessionId] = { lines: [], redoStack: [] };
    }
  });

  socket.on('request-state', (sessionId) => {
    const sessionState = sessions[sessionId];
    if (sessionState) {
      socket.emit('current-state', sessionState);
    }
  });

  socket.on('cursor-update', (data) => {
    const { sessionId, ...cursorData } = data;
    socket.to(sessionId).emit('cursor-update', cursorData);
  });

  socket.on('drawing-data', (data) => {
    const { sessionId, line } = data;
    if (
      sessions[sessionId] &&
      line &&
      Array.isArray(line.points) &&
      typeof line.stroke === 'string' &&
      typeof line.tool === 'string' &&
      typeof line.strokeWidth === 'number'
    ) {
      sessions[sessionId].lines.push(line);
      io.to(sessionId).emit('drawing-data', { line });
    }
  });

  socket.on('undo-action', (data) => {
    const { sessionId, lines, redoStack } = data;
    if (sessions[sessionId]) {
      sessions[sessionId].lines = lines;
      sessions[sessionId].redoStack = redoStack;
      io.to(sessionId).emit('undo-action', data);
    }
  });

  socket.on('redo-action', (data) => {
    const { sessionId, lines, redoStack } = data;
    if (sessions[sessionId]) {
      sessions[sessionId].lines = lines;
      sessions[sessionId].redoStack = redoStack;
      io.to(sessionId).emit('redo-action', data);
    }
  });

  socket.on('clear-canvas', (sessionId) => {
    if (sessions[sessionId]) {
      sessions[sessionId].lines = [];
      sessions[sessionId].redoStack = [];
      io.to(sessionId).emit('clear-canvas');
    }
  });

  socket.on('chat-message', (data) => {
    const { sessionId, userId, message } = data;
    io.to(sessionId).emit('chat-message', { userId, message });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3500;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
