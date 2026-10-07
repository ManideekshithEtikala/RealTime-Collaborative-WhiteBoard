const path = require('node:path');

function integer(value, fallback, min, max, label) {
  if (value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return number;
}

function parseOrigins(value) {
  return value.split(',').map((entry) => {
    const origin = entry.trim();
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid FRONTEND_ORIGINS'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('FRONTEND_ORIGINS must contain exact HTTP(S) origins');
    }
    return origin;
  });
}

function loadConfig(env = process.env, overrides = {}) {
  const production = overrides.production ?? env.NODE_ENV === 'production';
  const source = (key, variable) => overrides[key] ?? env[variable];
  const number = (key, variable, fallback, min, max) =>
    integer(source(key, variable), fallback, min, max, variable);
  const origins = overrides.frontendOrigins ?? env.FRONTEND_ORIGINS;
  return {
    production,
    port: number('port', 'PORT', 3500, 0, 65535),
    host: source('host', 'HOST') || '0.0.0.0',
    dataDir: path.resolve(source('dataDir', 'DATA_DIR') || path.join(__dirname, '../data')),
    distDir: path.resolve(overrides.distDir || path.join(__dirname, '../../whiteboard-app/dist')),
    frontendOrigins: new Set(origins ? parseOrigins(origins) : production ? [] : ['http://localhost:5173']),
    trustProxy: overrides.trustProxy ?? env.TRUST_PROXY === 'true',
    maxRooms: number('maxRooms', 'MAX_ROOMS', 100, 1, 1000),
    maxObjects: number('maxObjects', 'MAX_OBJECTS', 2000, 1, 10000),
    maxRoomBytes: number('maxRoomBytes', 'MAX_ROOM_BYTES', 4 * 1024 * 1024, 1024, 16 * 1024 * 1024),
    maxParticipants: number('maxParticipants', 'MAX_PARTICIPANTS', 50, 1, 200),
    maxConnections: number('maxConnections', 'MAX_CONNECTIONS', 500, 1, 2000),
    roomTtlMs: number('roomTtlMs', 'ROOM_TTL_MS', 7 * 86400000, 100, 365 * 86400000),
    maintenanceMs: number('maintenanceMs', 'MAINTENANCE_MS', 60000, 25, 3600000),
    maxPayloadBytes: 128 * 1024,
    maxMessages: 100,
  };
}

module.exports = { loadConfig };
