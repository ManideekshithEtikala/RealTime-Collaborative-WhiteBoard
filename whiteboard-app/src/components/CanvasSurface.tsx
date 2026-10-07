import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, RefObject } from 'react';
import { Stage, Layer, Line, Rect, Ellipse, Text, Group } from 'react-konva';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../lib/board';
import type { BoardObject, Cursor } from '../lib/board';
import { objectGeometry, textSize } from '../lib/canvasExport';
import CanvasIcon from './CanvasIcons';

function DrawingObject({ line }: { line: BoardObject }) {
  const common = { stroke: line.stroke, strokeWidth: line.strokeWidth, listening: false };
  const g = objectGeometry(line);
  if (line.tool === 'rectangle') return <Rect {...common} x={g.x} y={g.y} width={g.width} height={g.height} />;
  if (line.tool === 'ellipse') return <Ellipse {...common} x={g.cx} y={g.cy} radiusX={g.width / 2} radiusY={g.height / 2} />;
  if (line.tool === 'text') return <Text x={line.points[0]} y={line.points[1]} text={line.text}
    fill={line.stroke} fontFamily="Arial, sans-serif" fontSize={textSize(line.strokeWidth)}
    width={BOARD_WIDTH - line.points[0]} lineHeight={1.3} listening={false} />;
  return <Line {...common} points={line.points} lineCap="round" lineJoin="round"
    globalCompositeOperation={line.tool === 'eraser' ? 'destination-out' : 'source-over'} />;
}

type PointerHandlers = Pick<HTMLAttributes<HTMLDivElement>, 'onPointerDown' | 'onPointerMove' | 'onLostPointerCapture'>;
interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  lines: BoardObject[];
  pending: BoardObject[];
  previews: BoardObject[];
  draft: BoardObject | null;
  cursors: Cursor[];
  ready: boolean;
  tool: string;
  pointerHandlers: PointerHandlers;
}

export default function CanvasSurface(props: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const padding = size.width < 600 ? 24 : 56;
  const scale = Math.max(0.01, Math.min((size.width - padding) / BOARD_WIDTH, (size.height - padding - 26) / BOARD_HEIGHT));
  const ids = new Set([...props.lines, ...props.pending].map(line => line.id));
  const previews = props.previews.filter(line => !ids.has(line.id));
  const empty = !props.lines.length && !props.pending.length && !props.draft && !previews.length;
  return <div className="canvas-viewport" ref={viewport}>
    <div ref={props.containerRef} className={`canvas-sheet tool-${props.tool}${props.ready ? '' : ' is-locked'}`}
      style={{ width: BOARD_WIDTH * scale, height: BOARD_HEIGHT * scale }}
      {...props.pointerHandlers} tabIndex={0} role="img"
      aria-label="Shared drawing canvas. Select a tool and draw; press T and click to add text.">
      <Stage width={BOARD_WIDTH * scale} height={BOARD_HEIGHT * scale} scaleX={scale} scaleY={scale}>
        <Layer listening={false}>
          <Rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#ffffff" />
        </Layer>
        <Layer listening={false}>
          {props.lines.map(line => <DrawingObject key={line.id} line={line} />)}
          {props.pending.filter(line => !props.lines.some(item => item.id === line.id)).map(line => <DrawingObject key={line.id} line={line} />)}
          {previews.map(line => <DrawingObject key={line.id} line={line} />)}
          {props.draft && <DrawingObject line={props.draft} />}
        </Layer>
        <Layer listening={false}>
          {props.cursors.map(cursor => <Group key={cursor.userId} x={cursor.x} y={cursor.y} scaleX={1 / scale} scaleY={1 / scale}>
            <Line points={[0, 0, 0, 16, 4, 12, 8, 19, 11, 17, 7, 10, 13, 10, 0, 0]}
              fill={cursor.color} stroke="white" strokeWidth={1.5} closed />
            <Rect x={12} y={17} width={Math.min(180, cursor.name.length * 6.8 + 18)} height={25} fill={cursor.color} cornerRadius={6} />
            <Text x={20} y={24} text={cursor.name.slice(0, 24)} fill="white" fontSize={12} fontFamily="Arial, sans-serif" />
          </Group>)}
        </Layer>
      </Stage>
      {empty && <div className="canvas-empty" aria-hidden="true">
        <span className="empty-pencil"><CanvasIcon name="pen" width="28" height="28" /></span>
        <strong>A little space for your next big idea.</strong>
        <span>{props.ready ? 'Pick a tool, make a mark, invite your people.' : 'Your canvas will be ready once you’re connected.'}</span>
        <span className="empty-shortcut">P for pen · T for text</span>
      </div>}
    </div>
    <div className="canvas-meta"><span>1600 × 1000 <span className="meta-divider">/</span> Shared canvas</span>
      <span>{Math.round(scale * 100)}% · Fit to view</span></div>
  </div>;
}
