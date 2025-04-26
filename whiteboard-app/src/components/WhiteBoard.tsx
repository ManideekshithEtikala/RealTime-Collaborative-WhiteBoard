import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Line, Circle } from "react-konva";
import { io } from "socket.io-client";
import jsPDF from "jspdf";
import { useParams, useNavigate } from "react-router-dom";
import InviteModal from "./Invitationsystem";
import "bootstrap/dist/css/bootstrap.min.css";

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

interface ChatMessage {
  userId: string;
  message: string;
}

const socket = io("http://localhost:3500", {
  withCredentials: true,
});

export default function Whiteboard() {

  const [lines, setLines] = useState<LineData[]>([]);
  const [redoStack, setRedoStack] = useState<LineData[]>([]);
  const [tool, setTool] = useState("pen");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [cursors, setCursors] = useState<CursorData[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [stageWidth, setStageWidth] = useState(window.innerWidth * 0.75);
  const [stageHeight, setStageHeight] = useState(window.innerHeight - 200);
  const isDrawing = useRef(false);
  const stageRef = useRef<any>(null);
  const { id: sessionId } = useParams();
  const navigate = useNavigate();


  useEffect(() => {
    const handleResize = () => {
      setStageWidth(window.innerWidth * 0.75);
      setStageHeight(window.innerHeight - 200);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    socket.emit("join-session", sessionId);
    socket.emit("request-state", sessionId);

    socket.on(
      "current-state",
      (data: { lines: LineData[]; redoStack: LineData[] }) => {
        if (data) {
          setLines(data.lines);
          setRedoStack(data.redoStack);
        }
      }
    );

    socket.on("cursor-update", (cursor: CursorData) => {
      const stageNode = stageRef.current;
      const stageBounds = stageNode.getClientRect();
      const cursorX = cursor.x;
      const cursorY = cursor.y;

      if (
        cursorX >= stageBounds.x && cursorX <= stageBounds.x + stageBounds.width &&
        cursorY >= stageBounds.y && cursorY <= stageBounds.y + stageBounds.height
      ) {
        setCursors((prev) => {
          const filteredCursors = prev.filter((c) => c.userId !== cursor.userId);
          return [...filteredCursors, cursor];
        });
      }
    });

    socket.on("drawing-data", ({ line }: { line: LineData }) => {
      setLines((prev) => [...prev, line]);
    });

    socket.on(
      "undo-action",
      (data: { lines: LineData[]; redoStack: LineData[] }) => {
        setLines(data.lines);
        setRedoStack(data.redoStack);
      }
    );

    socket.on(
      "redo-action",
      (data: { lines: LineData[]; redoStack: LineData[] }) => {
        setLines(data.lines);
        setRedoStack(data.redoStack);
      }
    );

    socket.on("clear-canvas", () => {
      setLines([]);
      setRedoStack([]);
    });

    socket.on("chat-message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off("current-state");
      socket.off("drawing-data");
      socket.off("undo-action");
      socket.off("redo-action");
      socket.off("cursor-update");
      socket.off("clear-canvas");
      socket.off("chat-message");
    };
  }, [sessionId]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const point = e.target.getStage().getPointerPosition();
    if (!point) return;
    const newLine: LineData = {
      tool,
      points: [point.x, point.y],
      stroke: strokeColor,
      strokeWidth,
    };
    setRedoStack([]);
    setLines((prev) => [...prev, newLine]);
    socket.emit("drawing-data", { sessionId, line: newLine });
  };

  const handleMouseMove = (e: any) => {
    const point = e.target.getStage().getPointerPosition();
    if (!point) return;

    socket.emit("cursor-update", {
      sessionId,
      x: point.x,
      y: point.y,
      userId: socket.id,
      color: strokeColor,
    });

    if (!isDrawing.current || lines.length === 0) return;

    const lastLine = { ...lines[lines.length - 1] };
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    const updatedLines = [...lines.slice(0, -1), lastLine];
    setLines(updatedLines);

    socket.emit("drawing-data", { sessionId, line: lastLine });
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    socket.emit("drawing-complete", { sessionId });
  };

  const undo = (emit = true) => {
    if (!lines.length) return;
    const newLines = [...lines];
    const lastLine = newLines.pop();
    if (!lastLine) return;
    const newRedoStack = [...redoStack, lastLine];
    setRedoStack(newRedoStack);
    setLines(newLines);
    if (emit)
      socket.emit("undo-action", {
        sessionId,
        lines: newLines,
        redoStack: newRedoStack,
      });
  };

  const redo = (emit = true) => {
    if (!redoStack.length) return;
    const newRedoStack = [...redoStack];
    const lastRedo = newRedoStack.pop();
    if (!lastRedo) return;
    const newLines = [...lines, lastRedo];
    setLines(newLines);
    setRedoStack(newRedoStack);
    if (emit)
      socket.emit("redo-action", {
        sessionId,
        lines: newLines,
        redoStack: newRedoStack,
      });
  };

  const clearCanvas = () => {
    setLines([]);
    setRedoStack([]);
    socket.emit("clear-canvas", sessionId);
  };

  const changeTool = (newTool: string) => {
    setTool(newTool);
    socket.emit("tool-change", {
      tool: newTool,
      color: strokeColor,
      size: strokeWidth,
    });
  };

  const changeColor = (newColor: string) => {
    setStrokeColor(newColor);
    socket.emit("tool-change", { tool, color: newColor, size: strokeWidth });
  };

  const changeSize = (newSize: number) => {
    setStrokeWidth(newSize);
    socket.emit("tool-change", { tool, color: strokeColor, size: newSize });
  };

  const saveAsImage = async () => {
    const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = dataURL;
    link.click();
  };

  const saveAsPDF = async () => {
    const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
    const pdf = new jsPDF();
    pdf.addImage(dataURL, "PNG", 10, 10, 190, 0);
    pdf.save("whiteboard.pdf");
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const msg = { userId: socket.id, message: chatInput };
    socket.emit("chat-message", { sessionId, ...msg });
    setChatInput("");
  };

  return (
    <div className="container-fluid p-3">
      <div className="row mb-3">
        <div className="col-12">
          <div className="d-flex flex-wrap justify-content-between align-items-center bg-light p-3 rounded shadow-sm">
            <div className="d-flex flex-wrap align-items-center">
              <button
                className="btn btn-danger me-2 mb-2"
                onClick={() => undo()}
                disabled={!lines.length}
              >
                Undo
              </button>
              <button
                className="btn btn-warning me-2 mb-2"
                onClick={() => redo()}
                disabled={!redoStack.length}
              >
                Redo
              </button>
              <button
                className={`btn me-2 mb-2 ${
                  tool === "pen" ? "btn-primary" : "btn-outline-primary"
                }`}
                onClick={() => changeTool("pen")}
              >
                Pen
              </button>
              <button
                className={`btn mb-2 ${
                  tool === "eraser" ? "btn-secondary" : "btn-outline-secondary"
                }`}
                onClick={() => changeTool("eraser")}
              >
                Eraser
              </button>
              <button
                className="btn btn-danger ms-2 mb-2"
                onClick={clearCanvas}
              >
                Clear Canvas
              </button>
            </div>
            

            <div className="d-flex flex-wrap align-items-center">
              <div className="me-4 mb-2">
                <label className="form-label me-2">Color</label>
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => changeColor(e.target.value)}
                  className="form-control form-control-color"
                />
              </div>
              <div className="mb-2">
                <label className="form-label me-2" style={{fontStyle:"serif"}}>Select Brush Size</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={strokeWidth}
                  onChange={(e) => changeSize(Number(e.target.value))}
                  className="form-range"
                />
              </div>
            </div>

            <div className="d-flex flex-wrap align-items-center">
              <button
                className="btn btn-success me-2 mb-2"
                onClick={saveAsImage}
              >
                Save as Image
              </button>
              <button className="btn btn-success me-2 mb-2" onClick={saveAsPDF}>
                Save as PDF
              </button>
              <button
                className="btn btn-dark mb-2"
                onClick={() => navigate("/image-classifier")}
              >
                Go to Image Classifier
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-9 mb-3">
          <div className="border rounded shadow-sm bg-white">
            <Stage
              ref={stageRef}
              width={stageWidth}
              height={stageHeight}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="w-100"
            >
              <Layer>
                {lines
                  .filter((line) => Array.isArray(line?.points))
                  .map((line, i) => (
                    <Line
                      key={i}
                      points={line.points}
                      stroke={line.stroke}
                      strokeWidth={line.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={
                        line.tool === "eraser"
                          ? "destination-out"
                          : "source-over"
                      }
                    />
                  ))}

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

        <div className="col-md-3">
  <div className="border rounded shadow-sm bg-light h-100 d-flex flex-column">
    <div className="p-2 bg-primary text-white text-center fw-bold rounded-top">
      Live Chat
    </div>
    <div
      className="p-3 overflow-auto flex-grow-1"
      style={{ height: "calc(100% - 80px)", maxHeight: "calc(100vh - 250px)" }}
    >
      {chatMessages.map((msg, index) => (
        <div
          key={index}
          className={`mb-2 d-flex justify-content-${msg.userId === socket.id ? "end" : "start"}`}
        >
          <span
            className={`badge ${
              msg.userId === socket.id ? "bg-primary" : "bg-secondary"
            }`}
            style={{
              wordWrap: "break-word",
              maxWidth: "80%",
              display: "inline-block",
              padding: "5px 10px",
              whiteSpace: "pre-wrap",
              borderRadius: "10px",
              backgroundColor: msg.userId === socket.id ? "#007bff" : "#6c757d",
              marginBottom: "5px",
            }}
          >
            {msg.message}
          </span>
        </div>
      ))}
    </div>
    <div className="p-3 d-flex flex-column">
      <input
        type="text"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && chatInput.trim()) {
            sendMessage();
          }
        }}
        className="form-control"
        placeholder="Type a message"
      />
      <button
        className="btn btn-primary w-100 mt-2"
        onClick={sendMessage}
        disabled={!chatInput.trim()}
      >
        Send
      </button>
    </div>
  </div>
</div>
        <div className="col-md-3">
        {sessionId && <InviteModal sessionId={sessionId} />}
        </div>


      </div>
    </div>
  );
}
