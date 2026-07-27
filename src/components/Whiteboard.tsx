"use client";

import { useEffect, useRef, useState } from "react";

type Point = [number, number];
type PathEl = { type: "path"; points: Point[]; color: string; width: number };
type TextEl = { type: "text"; x: number; y: number; text: string; color: string; fontSize: number };
type Element = PathEl | TextEl;

const COLORS = ["#1a1a2e", "#E63329", "#00A99D", "#a16207", "#1d4ed8"];

export default function Whiteboard({ projectId }: { projectId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [tool, setTool] = useState<"pen" | "text" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const drawing = useRef(false);
  const currentPath = useRef<Point[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/board`)
      .then((r) => r.json())
      .then((data) => {
        try {
          setElements(JSON.parse(data.content));
        } catch {
          setElements([]);
        }
        setLoaded(true);
      });
  }, [projectId]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  useEffect(() => {
    if (!loaded) return;
    const timeout = setTimeout(() => {
      fetch(`/api/projects/${projectId}/board`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(elements) }),
      });
    }, 800);
    return () => clearTimeout(timeout);
  }, [elements, loaded, projectId]);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const el of elements) {
      if (el.type === "path") {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        el.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      } else {
        ctx.fillStyle = el.color;
        ctx.font = `${el.fontSize}px sans-serif`;
        ctx.fillText(el.text, el.x, el.y);
      }
    }
  }

  function getPos(e: React.MouseEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (tool === "text") {
      const [x, y] = getPos(e);
      const text = prompt("Texto:");
      if (text) {
        setElements((prev) => [...prev, { type: "text", x, y, text, color, fontSize: 16 }]);
      }
      return;
    }
    drawing.current = true;
    currentPath.current = [getPos(e)];
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!drawing.current || tool !== "pen") return;
    currentPath.current.push(getPos(e));
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    redraw();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    currentPath.current.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  function handleMouseUp() {
    if (drawing.current && currentPath.current.length > 1) {
      setElements((prev) => [...prev, { type: "path", points: currentPath.current, color, width: 2.5 }]);
    }
    drawing.current = false;
    currentPath.current = [];
  }

  function handleClear() {
    if (!confirm("Limpar todo o quadro?")) return;
    setElements([]);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setTool("pen")}
          className={`rounded-md px-3 py-1.5 text-sm ${tool === "pen" ? "bg-brand text-white" : "bg-gray-100"}`}
        >
          ✏️ Desenhar
        </button>
        <button
          onClick={() => setTool("text")}
          className={`rounded-md px-3 py-1.5 text-sm ${tool === "text" ? "bg-brand text-white" : "bg-gray-100"}`}
        >
          🔤 Texto
        </button>
        <div className="mx-2 flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button onClick={handleClear} className="ml-auto rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={1000}
        height={600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full cursor-crosshair rounded-xl border border-gray-200 bg-white"
      />
    </div>
  );
}
