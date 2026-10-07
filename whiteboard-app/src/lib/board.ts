export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1000;
export const MAX_POINT_VALUES = 8000;
export const SESSION_PATTERN = /^[a-zA-Z0-9_-]{6,80}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COLORS = ['#273653', '#6366f1', '#e76f87', '#f1ac45', '#2caa91', '#609bea'];
export type Tool = 'pen' | 'eraser' | 'rectangle' | 'ellipse' | 'text';
export interface BoardObject {
  id: string;
  tool: Tool;
  points: number[];
  stroke: string;
  strokeWidth: number;
  text?: string;
  userId?: string;
}
export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  message: string;
  createdAt: string;
}
export interface Participant { userId: string; name: string; color: string }
export interface Cursor extends Participant { x: number; y: number }
export interface BoardState {
  lines: BoardObject[];
  redoStack: BoardObject[];
  messages: ChatMessage[];
  participants: Participant[];
}
export interface GuestProfile { clientId: string; name: string }
export interface RecentBoard { id: string; visitedAt: string }
let cachedProfile: GuestProfile | undefined;

export function normalizeGuestName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 30);
}

export function isGuestName(name: string): boolean {
  const normalized = normalizeGuestName(name);
  return !!normalized && new RegExp("^[\\p{L}\\p{N} ._'’-]+$", 'u').test(normalized);
}

export function getGuestProfile(): GuestProfile {
  if (cachedProfile) return cachedProfile;
  let clientId = '';
  let name = '';
  try {
    clientId = sessionStorage.getItem('canvas-together.client-id') || '';
    name = sessionStorage.getItem('canvas-together.name') || '';
  } catch { /* A guest can still collaborate when browser storage is unavailable. */ }
  if (!UUID_PATTERN.test(clientId)) clientId = crypto.randomUUID();
  cachedProfile = { clientId, name: isGuestName(name) ? normalizeGuestName(name) : `Guest ${clientId.slice(0, 4)}` };
  saveGuestName(cachedProfile.name);
  return cachedProfile;
}

export function saveGuestName(name: string): GuestProfile {
  const profile = cachedProfile || getGuestProfile();
  profile.name = isGuestName(name) ? normalizeGuestName(name) : profile.name;
  try {
    sessionStorage.setItem('canvas-together.client-id', profile.clientId);
    sessionStorage.setItem('canvas-together.name', profile.name);
  } catch { /* Keep the same identity in memory for this visit. */ }
  return { ...profile };
}

export function parseSessionInput(value: string): string | null {
  const trimmed = value.trim();
  if (SESSION_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    const match = url.pathname.match(/^\/session\/([^/]+)\/?$/);
    const id = match ? decodeURIComponent(match[1]) : '';
    return SESSION_PATTERN.test(id) ? id : null;
  } catch { return null; }
}

export function getRecentBoards(): RecentBoard[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('canvas-together.recent') || '[]');
    return Array.isArray(value) ? value.filter((item): item is RecentBoard =>
      !!item && typeof item.id === 'string' && SESSION_PATTERN.test(item.id) && typeof item.visitedAt === 'string' &&
      Number.isFinite(Date.parse(item.visitedAt))).slice(0, 4) : [];
  } catch { return []; }
}

export function rememberBoard(id: string): void {
  if (!SESSION_PATTERN.test(id)) return;
  try {
    const boards = [{ id, visitedAt: new Date().toISOString() }, ...getRecentBoards().filter(b => b.id !== id)];
    localStorage.setItem('canvas-together.recent', JSON.stringify(boards.slice(0, 4)));
  } catch { /* Recent boards are optional. */ }
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'G';
}

export function isBoardObject(value: unknown): value is BoardObject {
  if (!value || typeof value !== 'object') return false;
  const line = value as BoardObject;
  if (!UUID_PATTERN.test(line.id) || !['pen', 'eraser', 'rectangle', 'ellipse', 'text'].includes(line.tool) ||
    !/^#[0-9a-f]{6}$/i.test(line.stroke) || !Number.isFinite(line.strokeWidth) ||
    line.strokeWidth < 1 || line.strokeWidth > 40 || !Array.isArray(line.points) ||
    line.points.length > MAX_POINT_VALUES || !line.points.every((p, index) => typeof p === 'number' && Number.isFinite(p) &&
      p >= 0 && p <= (index % 2 === 0 ? BOARD_WIDTH : BOARD_HEIGHT))) return false;
  if (line.tool === 'text') return line.points.length === 2 && typeof line.text === 'string' && line.text.length <= 500 && !!line.text.trim();
  if (line.tool === 'rectangle' || line.tool === 'ellipse') return line.points.length === 4;
  return line.points.length >= 2 && line.points.length % 2 === 0;
}

export function isParticipant(value: unknown): value is Participant {
  const p = value as Participant | null;
  return !!p && typeof p.userId === 'string' && typeof p.name === 'string' && /^#[0-9a-f]{6}$/i.test(p.color);
}

export function isChatMessage(value: unknown): value is ChatMessage {
  const m = value as ChatMessage | null;
  return !!m && typeof m.id === 'string' && typeof m.userId === 'string' && typeof m.name === 'string' &&
    typeof m.message === 'string' && typeof m.createdAt === 'string' && Number.isFinite(Date.parse(m.createdAt));
}
