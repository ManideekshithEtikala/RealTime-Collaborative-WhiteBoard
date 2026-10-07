import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  BOARD_HEIGHT, BOARD_WIDTH, isBoardObject, isChatMessage, isParticipant, rememberBoard, SESSION_PATTERN,
} from '../lib/board';
import type { BoardObject, BoardState, Cursor, GuestProfile, Participant } from '../lib/board';

type Status = 'connecting' | 'joining' | 'connected' | 'offline' | 'error';
interface Ack { ok: boolean; error?: string }
interface Preview { line: BoardObject; updatedAt: number }
const EMPTY: BoardState = { lines: [], redoStack: [], messages: [], participants: [] };

export default function useBoardSocket(sessionId: string, profile: GuestProfile) {
  const [state, setState] = useState<BoardState>(EMPTY);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState('');
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [pending, setPending] = useState<BoardObject[]>([]);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const joined = useRef(false);
  const requests = useRef(0);
  const lastCursor = useRef(0);
  const lastPreview = useRef(0);

  useEffect(() => {
    joined.current = false;
    requests.current = 0;
    setBusy(false);
    setPending([]);
    setPreviews({});
    setCursors([]);
    setState(EMPTY);
    if (!SESSION_PATTERN.test(sessionId)) {
      setStatus('error');
      setError('This board ID is invalid. Use an invitation link or a board ID with 6–80 letters, numbers, dashes, or underscores.');
      return;
    }
    const env = (import.meta as ImportMeta & { env?: { VITE_BACKEND_URL?: string } }).env;
    const socket = io(env?.VITE_BACKEND_URL || window.location.origin, { autoConnect: false });
    socketRef.current = socket;
    let active = true;
    let gotSnapshot = false;
    let gotAck = false;
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    const markOffline = () => {
      if (!active) return;
      joined.current = false;
      setStatus('offline');
      setError('You are offline. Editing is paused until your connection returns.');
      if (socket.connected) socket.disconnect();
    };
    const markOnline = () => {
      if (!active || socket.connected) return;
      setStatus('connecting');
      socket.connect();
    };
    setStatus('connecting');
    setError('');
    const finishJoin = () => {
      if (!active || joined.current || !socket.connected || !gotSnapshot || !gotAck) return;
      clearTimeout(joinTimer);
      joined.current = true;
      setStatus('connected');
      setError('');
      rememberBoard(sessionId);
    };
    const resetConnection = () => {
      clearTimeout(joinTimer);
      joined.current = false;
      gotSnapshot = false;
      gotAck = false;
      setPending([]);
      setPreviews({});
      setCursors([]);
    };
    socket.on('connect', () => {
      resetConnection();
      // There must never be a queued offline edit replayed into a fresh authoritative state.
      socket.sendBuffer = [];
      setStatus('joining');
      joinTimer = setTimeout(() => {
        if (!active || joined.current) return;
        setStatus('error');
        setError('The board did not finish loading. Please reconnect to try again.');
      }, 10000);
      socket.timeout(8000).emit('join-session', { sessionId, ...profile }, (err: Error | null, ack?: Ack) => {
        if (!active || !socket.connected) return;
        if (err || !ack?.ok) {
          clearTimeout(joinTimer);
          setStatus('error');
          setError(ack?.error || 'We could not join this board. Please reconnect and try again.');
          return;
        }
        gotAck = true;
        finishJoin();
      });
    });
    socket.on('current-state', (data: unknown) => {
      if (!active || !data || typeof data !== 'object') return;
      const snapshot = data as BoardState;
      if (!Array.isArray(snapshot.lines) || !Array.isArray(snapshot.redoStack) ||
          !Array.isArray(snapshot.messages) || !Array.isArray(snapshot.participants)) {
        setError('The board received an unreadable update. Reconnect to reload it.');
        return;
      }
      const next = {
        lines: snapshot.lines.filter(isBoardObject), redoStack: snapshot.redoStack.filter(isBoardObject),
        messages: snapshot.messages.filter(isChatMessage), participants: snapshot.participants.filter(isParticipant),
      };
      setState(next);
      const ids = new Set(next.lines.map(line => line.id));
      setPending(previous => previous.filter(line => !ids.has(line.id)));
      setPreviews(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.has(id))));
      gotSnapshot = true;
      finishJoin();
    });
    socket.on('participants', (data: unknown) => {
      if (!Array.isArray(data)) return;
      const people: Participant[] = data.filter(isParticipant);
      setState(previous => ({ ...previous, participants: people }));
      setCursors(previous => previous.filter(cursor => people.some(person => person.userId === cursor.userId)));
    });
    socket.on('cursor-update', (data: unknown) => {
      const cursor = data as Cursor;
      if (!isParticipant(cursor) || cursor.userId === socket.id || !Number.isFinite(cursor.x) ||
          !Number.isFinite(cursor.y) || cursor.x < 0 || cursor.x > BOARD_WIDTH || cursor.y < 0 || cursor.y > BOARD_HEIGHT) return;
      setCursors(previous => [...previous.filter(c => c.userId !== cursor.userId), cursor]);
    });
    socket.on('stroke-preview', (data: { line?: unknown }) => {
      if (!data || !isBoardObject(data.line) || data.line.userId === profile.clientId) return;
      const line = data.line;
      setPreviews(previous => ({ ...previous, [line.id]: { line, updatedAt: Date.now() } }));
    });
    socket.on('stroke-end', (data: { id?: string }) => {
      if (!data?.id) return;
      setPreviews(previous => {
        const next = { ...previous };
        delete next[data.id!];
        return next;
      });
    });
    socket.on('chat-message', (message: unknown) => {
      if (!isChatMessage(message)) return;
      setState(previous => previous.messages.some(m => m.id === message.id) ? previous :
        { ...previous, messages: [...previous.messages, message].slice(-200) });
    });
    socket.on('disconnect', () => {
      if (!active) return;
      resetConnection();
      setStatus('offline');
      setError('Connection lost. Editing is paused while we reconnect and reload the board.');
    });
    socket.on('connect_error', () => {
      if (!active) return;
      joined.current = false;
      setStatus('offline');
      setError('We cannot reach the collaboration server. Check your connection; we will keep trying.');
    });
    window.addEventListener('offline', markOffline);
    window.addEventListener('online', markOnline);
    const expiry = setInterval(() => {
      setPreviews(previous => {
        const live = Object.entries(previous).filter(([, preview]) => Date.now() - preview.updatedAt < 4000);
        return live.length === Object.keys(previous).length ? previous : Object.fromEntries(live);
      });
    }, 1000);
    socket.connect();
    return () => {
      active = false;
      joined.current = false;
      clearTimeout(joinTimer);
      clearInterval(expiry);
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', markOnline);
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [sessionId, profile.clientId, profile.name]);

  const request = useCallback((event: string, payload: Record<string, unknown> = {}): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected || !joined.current) {
      setError('Wait until the board is connected before making changes.');
      return Promise.resolve(false);
    }
    requests.current += 1;
    setBusy(true);
    return new Promise(resolve => {
      socket.timeout(8000).emit(event, { sessionId, ...payload }, (err: Error | null, ack?: Ack) => {
        if (socketRef.current !== socket) { resolve(false); return; }
        requests.current = Math.max(0, requests.current - 1);
        setBusy(requests.current > 0);
        const ok = !err && !!ack?.ok;
        if (!ok) setError(ack?.error || 'We could not confirm that change. Check the board before trying again.');
        resolve(ok);
      });
    });
  }, [sessionId]);

  const commit = useCallback(async (line: BoardObject) => {
    if (!joined.current || !socketRef.current?.connected) return false;
    setPending(previous => [...previous, { ...line, userId: profile.clientId }]);
    const ok = await request('drawing-data', { line });
    if (!ok) setPending(previous => previous.filter(item => item.id !== line.id));
    return ok;
  }, [request, profile.clientId]);

  const sendCursor = useCallback((x: number, y: number) => {
    if (!joined.current || !socketRef.current?.connected || performance.now() - lastCursor.current < 70) return;
    lastCursor.current = performance.now();
    socketRef.current.volatile.emit('cursor-update', { sessionId, x, y });
  }, [sessionId]);

  const sendPreview = useCallback((line: BoardObject) => {
    if (!joined.current || !socketRef.current?.connected || performance.now() - lastPreview.current < 70) return;
    lastPreview.current = performance.now();
    socketRef.current.volatile.emit('stroke-preview', { sessionId, line });
  }, [sessionId]);

  const reconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current?.connect();
  }, []);

  return { ...state, status, ready: status === 'connected', error, setError, cursors,
    previews: Object.values(previews).map(p => p.line), pending, busy, request, commit,
    sendCursor, sendPreview, reconnect, socketId: socketRef.current?.id };
}
