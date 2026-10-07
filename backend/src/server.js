const express = require('express');
const cors = require('cors');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');
const { loadConfig } = require('./config');
const { RoomStore } = require('./store');
const { Rooms } = require('./rooms');
const { RateLimiter } = require('./rate-limit');
const { createOriginPolicy } = require('./origins');
const { attachProtocol } = require('./protocol');

function createWhiteboardServer(options = {}) {
  const config = loadConfig(options.env || process.env, options.config);
  const logger = options.logger || console;
  const store = new RoomStore(config);
  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const allowedOrigin = createOriginPolicy(config);
  const handshakes = new RateLimiter();
  const corsOptions = (request, callback) => callback(null, {
    origin: allowedOrigin(request) ? request.headers.origin || false : false,
    methods: ['GET', 'POST'], credentials: true,
  });
  const io = new Server(server, {
    maxHttpBufferSize: config.maxPayloadBytes,
    perMessageDeflate: false,
    serveClient: false,
    cors: corsOptions,
    allowRequest: (request, callback) => {
      if (!allowedOrigin(request)) return callback('Forbidden origin', false);
      handshakes.prune();
      const key = request.socket.remoteAddress || 'unknown';
      if (!handshakes.buckets.has(key) && handshakes.buckets.size >= 10000) {
        return callback('Connection rate limit exceeded', false);
      }
      callback(null, handshakes.take(key, 120, 2));
    },
  });
  // allowRequest guards initial handshakes; middleware also guards upgrades and polling with an existing sid.
  io.engine.use((request, response, next) => {
    if (request._query?.sid && !allowedOrigin(request)) return next(new Error('Forbidden origin'));
    next();
  });
  let rooms;
  try { rooms = new Rooms(io, store, config); } catch (error) {
    io.close();
    store.close();
    throw error;
  }
  const pruneLimits = attachProtocol(io, rooms, config, logger);
  const maintenance = setInterval(() => {
    try { rooms.sweep(); } catch (error) { logger.error('Room maintenance failed:', error); }
    handshakes.prune();
    pruneLimits();
  }, config.maintenanceMs);
  maintenance.unref();

  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!allowedOrigin(request)) return response.status(403).json({ ok: false, error: 'Forbidden origin' });
    next();
  });
  app.use(cors(corsOptions));
  app.get('/api/health', (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ ok: true, status: 'ok', storage: 'sqlite', rooms: rooms.rooms.size });
  });
  app.use('/api', (request, response) => response.status(404).json({ ok: false, error: 'Not found' }));
  if (config.production) {
    app.use('/assets', express.static(path.join(config.distDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(config.distDir, { index: false, maxAge: 0, dotfiles: 'deny' }));
    app.get('/{*route}', (request, response, next) => {
      if (path.extname(request.path)) return next();
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(path.join(config.distDir, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }
  app.use((request, response) => response.status(404).json({ ok: false, error: 'Not found' }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    response.status(error.status === 404 ? 404 : 500).json({ ok: false, error: error.status === 404 ? 'Not found' : 'Server error' });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;

  let closing;
  return {
    app, server, io, config,
    listen: () => new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      server.once('error', onError);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', onError);
        resolve(server.address());
      });
    }),
    close: () => {
      if (closing) return closing;
      clearInterval(maintenance);
      closing = new Promise((resolve, reject) => {
        io.close(() => {
          try { store.close(); resolve(); } catch (error) { reject(error); }
        });
        server.closeIdleConnections();
      });
      return closing;
    },
  };
}

module.exports = { createWhiteboardServer };
