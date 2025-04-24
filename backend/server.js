const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins (adjust for production)
  },
});

// Store the state of each session
const sessions = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle joining a session
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined session ${sessionId}`);

    // Initialize session state if it doesn't exist
    if (!sessions[sessionId]) {
      sessions[sessionId] = { lines: [], redoStack: [] };
    }
  });

  // Handle request for the current state
  socket.on('request-state', (sessionId) => {
    const sessionState = sessions[sessionId];
    if (sessionState) {
      socket.emit('current-state', sessionState); // Send the current state to the requesting user
    }
  });

  socket.on('cursor-update', (data) => {
    const { sessionId, ...cursorData } = data;
    socket.to(sessionId).emit('cursor-update', cursorData); // Broadcast to all users in the session except the sender
  });
  // Handle drawing data
  socket.on('drawing-data', (data) => {
    const { sessionId, line } = data;
    if (sessions[sessionId]) {
      sessions[sessionId].lines.push(line); // Update the session state
      io.to(sessionId).emit('drawing-data', line); // Broadcast to all users in the session
    }
  });

  // Handle undo action
  socket.on('undo-action', (data) => {
    const { sessionId, lines, redoStack } = data;
    if (sessions[sessionId]) {
      sessions[sessionId].lines = lines; // Update the session state
      sessions[sessionId].redoStack = redoStack;
      io.to(sessionId).emit('undo-action', data); // Broadcast to all users in the session
    }
  });

  // Handle redo action
  socket.on('redo-action', (data) => {
    const { sessionId, lines, redoStack } = data;
    if (sessions[sessionId]) {
      sessions[sessionId].lines = lines; // Update the session state
      sessions[sessionId].redoStack = redoStack;
      io.to(sessionId).emit('redo-action', data); // Broadcast to all users in the session
    }
  });

  // Handle clear canvas action
  socket.on('clear-canvas', (sessionId) => {
    if (sessions[sessionId]) {
      sessions[sessionId].lines = []; // Clear the session state
      sessions[sessionId].redoStack = [];
      io.to(sessionId).emit('clear-canvas'); // Broadcast to all users in the session
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3500;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});