import Konva from 'konva';
import { BOARD_HEIGHT, BOARD_WIDTH } from './board';
import type { BoardObject } from './board';

export function objectGeometry(line: BoardObject) {
  const [x1, y1, x2 = x1, y2 = y1] = line.points;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

export const textSize = (width: number) => 20 + width * 3;

function createNode(line: BoardObject): Konva.Shape {
  const common = { stroke: line.stroke, strokeWidth: line.strokeWidth, listening: false };
  const g = objectGeometry(line);
  if (line.tool === 'rectangle') return new Konva.Rect({ ...common, x: g.x, y: g.y, width: g.width, height: g.height });
  if (line.tool === 'ellipse') return new Konva.Ellipse({ ...common, x: g.cx, y: g.cy, radiusX: g.width / 2, radiusY: g.height / 2 });
  if (line.tool === 'text') return new Konva.Text({ x: line.points[0], y: line.points[1], text: line.text,
    fill: line.stroke, fontFamily: 'Arial, sans-serif', fontSize: textSize(line.strokeWidth), width: BOARD_WIDTH - line.points[0], lineHeight: 1.3 });
  return new Konva.Line({ ...common, points: line.points, lineCap: 'round', lineJoin: 'round',
    globalCompositeOperation: line.tool === 'eraser' ? 'destination-out' : 'source-over' });
}

export async function exportBoard(lines: BoardObject[], sessionId: string, format: 'png' | 'pdf') {
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width: BOARD_WIDTH, height: BOARD_HEIGHT });
  try {
    const background = new Konva.Layer();
    background.add(new Konva.Rect({ width: BOARD_WIDTH, height: BOARD_HEIGHT, fill: '#ffffff' }));
    stage.add(background);
    const content = new Konva.Layer();
    lines.forEach(line => content.add(createNode(line)));
    stage.add(content);
    stage.draw();
    const dataURL = stage.toDataURL({ pixelRatio: 1 });
    if (format === 'png') {
      const link = document.createElement('a');
      link.download = `canvas-together-${sessionId}.png`;
      link.href = dataURL;
      link.click();
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [BOARD_WIDTH, BOARD_HEIGHT], hotfixes: ['px_scaling'] });
      pdf.addImage(dataURL, 'PNG', 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      pdf.save(`canvas-together-${sessionId}.pdf`);
    }
  } finally { stage.destroy(); }
}
