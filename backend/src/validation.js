const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^[a-zA-Z0-9_-]{6,80}$/;
const TOOLS = new Set(['pen', 'eraser', 'rectangle', 'ellipse', 'text']);

class InputError extends Error {}

function requireValid(condition, message) {
  if (!condition) throw new InputError(message);
}

function object(value, keys) {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid payload');
  requireValid(Object.keys(value).every((key) => keys.includes(key)), 'Unexpected payload fields');
  return value;
}

function sessionId(value) {
  requireValid(typeof value === 'string' && SESSION.test(value), 'Invalid session ID');
  return value;
}

function uuid(value) {
  requireValid(typeof value === 'string' && UUID.test(value), 'Invalid UUID');
  return value;
}

function guestName(value) {
  requireValid(typeof value === 'string' && value.length <= 40, 'Name must be 1–40 characters');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  requireValid(name.length > 0 && name.length <= 40 && /^[\p{L}\p{N} ._'’-]+$/u.test(name), 'Invalid guest name');
  return name;
}

function coordinate(value, maximum) {
  requireValid(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum,
    'Coordinates must be within the 1600×1000 board');
  return value;
}

function boardObject(value, clientId) {
  object(value, ['id', 'tool', 'points', 'stroke', 'strokeWidth', 'text', 'userId']);
  const id = uuid(value.id);
  requireValid(TOOLS.has(value.tool), 'Invalid drawing tool');
  requireValid(Array.isArray(value.points) && value.points.length >= 2 && value.points.length <= 8000 &&
    value.points.length % 2 === 0, 'Points must contain 2–8000 paired numbers');
  requireValid(typeof value.stroke === 'string' && /^#[0-9a-f]{6}$/i.test(value.stroke), 'Invalid stroke color');
  requireValid(typeof value.strokeWidth === 'number' && Number.isFinite(value.strokeWidth) &&
    value.strokeWidth >= 1 && value.strokeWidth <= 40, 'Stroke width must be 1–40');
  const points = value.points.map((point, index) => coordinate(point, index % 2 === 0 ? 1600 : 1000));
  if (value.tool === 'rectangle' || value.tool === 'ellipse') {
    requireValid(points.length === 4, 'Shapes require two coordinate pairs');
  }
  if (value.text !== undefined) {
    requireValid(typeof value.text === 'string' && value.text.length <= 500 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.text), 'Text must be at most 500 characters');
  }
  if (value.tool === 'text') {
    requireValid(points.length === 2 && typeof value.text === 'string' && value.text.trim().length > 0,
      'Text requires one coordinate pair and nonempty text');
  }
  return {
    id, tool: value.tool, points, stroke: value.stroke.toLowerCase(), strokeWidth: value.strokeWidth,
    ...(value.text !== undefined ? { text: value.text } : {}), userId: clientId,
  };
}

function chatText(value) {
  requireValid(typeof value === 'string' && value.length <= 1000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Chat must be 1–1000 characters');
  const message = value.trim();
  requireValid(message.length > 0, 'Chat cannot be empty');
  return message;
}

module.exports = { InputError, requireValid, object, sessionId, uuid, guestName, coordinate, boardObject, chatText };
