import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { BOARD_HEIGHT, BOARD_WIDTH, MAX_POINT_VALUES } from '../lib/board';
import type { BoardObject, Tool } from '../lib/board';

interface Options {
  container: RefObject<HTMLDivElement | null>;
  ready: boolean;
  tool: Tool;
  color: string;
  width: number;
  commit: (line: BoardObject) => Promise<boolean>;
  sendPreview: (line: BoardObject) => void;
  sendCursor: (x: number, y: number) => void;
}

export default function useCanvasDrawing(options: Options) {
  const [draft, setDraft] = useState<BoardObject | null>(null);
  const [textPoint, setTextPoint] = useState<number[] | null>(null);
  const draftRef = useRef<BoardObject | null>(null);
  const pointerRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const pointFor = useCallback((clientX: number, clientY: number) => {
    const rect = optionsRef.current.container.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return [
      Math.round(Math.max(0, Math.min(BOARD_WIDTH, ((clientX - rect.left) / rect.width) * BOARD_WIDTH)) * 10) / 10,
      Math.round(Math.max(0, Math.min(BOARD_HEIGHT, ((clientY - rect.top) / rect.height) * BOARD_HEIGHT)) * 10) / 10,
    ];
  }, []);

  const cancel = useCallback(() => {
    const container = optionsRef.current.container.current;
    const pointer = pointerRef.current;
    pointerRef.current = null;
    draftRef.current = null;
    setDraft(null);
    if (pointer !== null && container?.hasPointerCapture?.(pointer)) container.releasePointerCapture(pointer);
  }, []);

  const update = useCallback((point: number[]) => {
    const line = draftRef.current;
    if (!line) return;
    let points: number[];
    if (line.tool === 'pen' || line.tool === 'eraser') {
      const last = line.points.slice(-2);
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.5) return;
      if (line.points.length >= MAX_POINT_VALUES - 2) {
        // Preserve a long gesture within the server limit by simplifying older samples.
        points = [];
        for (let index = 0; index < line.points.length; index += 4) points.push(line.points[index], line.points[index + 1]);
        points.push(...point);
      } else points = [...line.points, ...point];
    } else points = [...line.points.slice(0, 2), ...point];
    const next = { ...line, points };
    draftRef.current = next;
    setDraft(next);
    optionsRef.current.sendPreview(next);
  }, []);

  const finish = useCallback((event: PointerEvent) => {
    if (event.pointerId !== pointerRef.current) return;
    const point = pointFor(event.clientX, event.clientY);
    if (point) update(point);
    const line = draftRef.current;
    cancel();
    if (!line || !optionsRef.current.ready) return;
    if ((line.tool === 'rectangle' || line.tool === 'ellipse') &&
      Math.hypot(line.points[2] - line.points[0], line.points[3] - line.points[1]) < 2) return;
    void optionsRef.current.commit(line);
  }, [cancel, pointFor, update]);

  useEffect(() => {
    const onCancel = (event: PointerEvent) => { if (event.pointerId === pointerRef.current) cancel(); };
    const onBlur = () => cancel();
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    };
  }, [finish, cancel]);

  useEffect(() => {
    if (!options.ready) { cancel(); setTextPoint(null); }
  }, [options.ready, cancel]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!options.ready || event.button !== 0 || pointerRef.current !== null || textPoint) return;
    event.preventDefault();
    const point = pointFor(event.clientX, event.clientY);
    if (!point) return;
    options.sendCursor(point[0], point[1]);
    if (options.tool === 'text') { setTextPoint(point); return; }
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const line: BoardObject = {
      id: crypto.randomUUID(), tool: options.tool, points: [...point, Math.min(BOARD_WIDTH, point[0] + 0.01), Math.min(BOARD_HEIGHT, point[1] + 0.01)],
      stroke: options.color, strokeWidth: options.width,
    };
    draftRef.current = line;
    setDraft(line);
    options.sendPreview(line);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!options.ready) return;
    event.preventDefault();
    const point = pointFor(event.clientX, event.clientY);
    if (!point) return;
    options.sendCursor(point[0], point[1]);
    if (event.pointerId === pointerRef.current) update(point);
  };

  const addText = async (text: string): Promise<boolean> => {
    if (!textPoint || !options.ready || !text.trim()) return false;
    const ok = await options.commit({
      id: crypto.randomUUID(), tool: 'text', points: textPoint,
      stroke: options.color, strokeWidth: options.width, text: text.trim().slice(0, 500),
    });
    if (ok) setTextPoint(null);
    return ok;
  };

  return { draft, textPoint, addText, closeText: () => setTextPoint(null), cancel,
    pointerHandlers: { onPointerDown, onPointerMove, onLostPointerCapture: cancel } };
}
