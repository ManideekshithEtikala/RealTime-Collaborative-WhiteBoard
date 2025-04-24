import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line, Circle } from 'react-konva';
import { io } from 'socket.io-client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useParams } from 'react-router-dom';

import 'bootstrap/dist/css/bootstrap.min.css';

interface LineData {
  tool: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
}

interface CursorData {
  x: number;
  y: number;
  userId: string;
  color: string;
}

const socket = io('http://localhost:3500'); // Replace with your WebSocket server URL

export default function Whiteboard() {
  const [lines, setLines] = useState<LineData[]>([]);
  const [redoStack, setRedoStack] = useState<LineData[]>([]);
  const [tool, setTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [cursors, setCursors] = useState<CursorData[]>([]); // Real-time cursor data
  const isDrawing = useRef(false);
  const stageRef = useRef<any>(null);
  const { id: sessionId } = useParams();

  useEffect(() => {
    // Join the session
    socket.emit('join-session', sessionId);

    // Request the current state of the whiteboard
    socket.emit('request-state', sessionId);

    // Listen for the current state from the server
    socket.on('current-state', (data: { lines: LineData[]; redoStack: LineData[] }) => {
      if (data && data.lines && data.redoStack) {
        setLines(data.lines); // Update the lines state with the current state
        setRedoStack(data.redoStack); // Update the redoStack state with the current state
      }
    });

    // Listen for cursor updates from other users
    socket.on('cursor-update', (cursor: CursorData) => {
      setCursors((prevCursors) => {
        const updatedCursors = prevCursors.filter((c) => c.userId !== cursor.userId);
        return [...updatedCursors, cursor];
      });
    });

    // Listen for drawing updates from other users
    socket.on('drawing-data', (newLine: LineData) => {
      setLines((prevLines) => [...prevLines, newLine]);
    });

    // Listen for undo actions
    socket.on('undo-action', (data: { lines: LineData[]; redoStack: LineData[] }) => {
      setLines(data.lines);
      setRedoStack(data.redoStack);
    });

    // Listen for redo actions
    socket.on('redo-action', (data: { lines: LineData[]; redoStack: LineData[] }) => {
      setLines(data.lines);
      setRedoStack(data.redoStack);
    });

    // Listen for clear canvas action
    socket.on('clear-canvas', () => {
      setLines([]);
      setRedoStack([]);
    });

    return () => {
      socket.off('current-state');
      socket.off('drawing-data');
      socket.off('undo-action');
      socket.off('redo-action');
      socket.off('cursor-update');
      socket.off('clear-canvas');
    };
  }, [sessionId]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const newLine = { tool, points: [point.x, point.y], stroke: strokeColor, strokeWidth };
    setRedoStack([]); // Clear redo stack on new action
    setLines([...lines, newLine]);

    // Emit the new line to the server
    socket.emit('drawing-data', { sessionId, line: newLine });
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    // Broadcast cursor position to other users
    socket.emit('cursor-update', {
      sessionId,
      x: point.x,
      y: point.y,
      userId: socket.id,
      color: strokeColor,
    });

    if (!isDrawing.current) return;

    // Update the last line with the new point
    const lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());

    // Emit the updated line to the server
    socket.emit('drawing-data', { sessionId, line: lastLine });
  };

  const handleMouseUp = () => {
    isDrawing.current = false;

    // Optionally, emit an event to indicate the drawing action is complete
    socket.emit('drawing-complete', { sessionId });
  };

  const undo = (emit = true) => {
    if (lines.length === 0) return;
    const newLines = [...lines];
    const lastLine = newLines.pop();
    setRedoStack([...redoStack, lastLine!]);
    setLines(newLines);

    if (emit) {
      socket.emit('undo-action', { sessionId, lines: newLines, redoStack: [...redoStack, lastLine!] });
    }
  };

  const redo = (emit = true) => {
    if (redoStack.length === 0) return;
    const newRedoStack = [...redoStack];
    const lastRedo = newRedoStack.pop();
    setLines([...lines, lastRedo!]);
    setRedoStack(newRedoStack);

    if (emit) {
      socket.emit('redo-action', { sessionId, lines: [...lines, lastRedo!], redoStack: newRedoStack });
    }
  };

  const clearCanvas = () => {
    setLines([]);
    setRedoStack([]);
    socket.emit('clear-canvas', sessionId); // Emit the clear-canvas event with sessionId
  };

  const changeTool = (newTool: string) => {
    setTool(newTool);
    socket.emit('tool-change', { tool: newTool, color: strokeColor, size: strokeWidth });
  };

  const changeColor = (newColor: string) => {
    setStrokeColor(newColor);
    socket.emit('tool-change', { tool, color: newColor, size: strokeWidth });
  };

  const changeSize = (newSize: number) => {
    setStrokeWidth(newSize);
    socket.emit('tool-change', { tool, color: strokeColor, size: newSize });
  };

  const saveAsImage = async () => {
    const stage = stageRef.current;
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = dataURL;
    link.click();
  };

  const saveAsPDF = async () => {
    const stage = stageRef.current;
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const pdf = new jsPDF();
    pdf.addImage(dataURL, 'PNG', 10, 10, 190, 0); // Adjust dimensions as needed
    pdf.save('whiteboard.pdf');
  };

  return (
    <div className="container-fluid p-3">
      <div className="row mb-3">
        <div className="col-12">
          <div className="d-flex flex-wrap justify-content-between align-items-center bg-light p-3 rounded shadow-sm">
            <div className="d-flex flex-wrap align-items-center">
              <button className="btn btn-danger me-2 mb-2" onClick={() => undo()} disabled={lines.length === 0}>
                Undo
              </button>
              <button className="btn btn-warning me-2 mb-2" onClick={() => redo()} disabled={redoStack.length === 0}>
                Redo
              </button>
              <button
                className={`btn me-2 mb-2 ${tool === 'pen' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => changeTool('pen')}
              >
                Pen
              </button>
              <button
                className={`btn mb-2 ${tool === 'eraser' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => changeTool('eraser')}
              >
                Eraser
              </button>
              <button className="btn btn-danger ms-2 mb-2" onClick={clearCanvas}>
                Clear Canvas
              </button>
            </div>
            <div className="d-flex flex-wrap align-items-center">
              <label className="me-2 mb-2">Color:</label>
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => changeColor(e.target.value)}
                className="form-control form-control-color me-3 mb-2"
              />
              <label className="me-2 mb-2">Size:</label>
              <input
                type="range"
                min="1"
                max="10"
                value={strokeWidth}
                onChange={(e) => changeSize(Number(e.target.value))}
                className="form-range mb-2"
              />
            </div>
            <div className="d-flex flex-wrap align-items-center">
              <button className="btn btn-success me-2 mb-2" onClick={saveAsImage}>
                Save as Image
              </button>
              <button className="btn btn-success mb-2" onClick={saveAsPDF}>
                Save as PDF
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="row">
        <div className="col-12">
          <div className="border rounded shadow-sm bg-white">
            <Stage
              ref={stageRef}
              width={window.innerWidth}
              height={window.innerHeight - 200}
              onMouseDown={handleMouseDown}
              onMousemove={handleMouseMove}
              onMouseup={handleMouseUp}
              className="w-100"
            >
              <Layer>
                {/* Render all lines */}
                {lines.map((line, i) => (
                  <Line
                    key={i}
                    points={line.points}
                    stroke={line.stroke}
                    strokeWidth={line.strokeWidth}
                    tension={0.5}
                    lineCap="round"
                    lineJoin="round"
                    globalCompositeOperation={line.tool === 'eraser' ? 'destination-out' : 'source-over'}
                  />
                ))}

                {/* Render all cursors */}
                {cursors.map((cursor, i) => (
                  <Circle
                    key={i}
                    x={cursor.x}
                    y={cursor.y}
                    radius={5}
                    fill={cursor.color}
                    opacity={0.8}
                  />
                ))}
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </div>
  );
}