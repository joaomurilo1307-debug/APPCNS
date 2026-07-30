"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type NodeShape = "rounded" | "rect" | "ellipse" | "diamond";

type MindNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  shape?: NodeShape;
  parentId: string | null;
};

type Stroke = {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
};

type BoardData = { version: 3; nodes: MindNode[]; strokes: Stroke[] };
type BoardSnapshot = { nodes: MindNode[]; strokes: Stroke[] };

const PALETTE = [
  { bg: "#eef2ff", border: "#6366f1" },
  { bg: "#fef3c7", border: "#d97706" },
  { bg: "#dcfce7", border: "#16a34a" },
  { bg: "#fee2e2", border: "#dc2626" },
  { bg: "#ede9fe", border: "#7c3aed" },
  { bg: "#e0f2fe", border: "#0284c7" },
  { bg: "#fce7f3", border: "#db2777" },
];

const DRAW_COLORS = ["#1f2937", "#dc2626", "#2563eb", "#16a34a", "#d97706"];

const SHAPES: { v: NodeShape; label: string; icon: string }[] = [
  { v: "rounded", label: "Arredondado", icon: "▢" },
  { v: "rect", label: "Retângulo", icon: "▭" },
  { v: "ellipse", label: "Elipse", icon: "⬭" },
  { v: "diamond", label: "Losango", icon: "◇" },
];

function shapeStyle(shape: NodeShape | undefined): CSSProperties {
  switch (shape) {
    case "rect":
      return { borderRadius: 4 };
    case "ellipse":
      return { borderRadius: 9999 };
    case "diamond":
      return { borderRadius: 6, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    default:
      return { borderRadius: 14 };
  }
}

const CANVAS_W = 2400;
const CANVAS_H = 1400;
const ROW_HEIGHT = 90;
const COL_WIDTH = 240;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function rootNode(): MindNode {
  return { id: "root", text: "Ideia central", x: CANVAS_W / 2, y: CANVAS_H / 2, color: PALETTE[0].bg, parentId: null };
}

function nodeWidth(text: string) {
  return Math.max(110, Math.min(240, text.length * 7.2 + 44));
}

function nodeRows(text: string) {
  return Math.min(6, Math.max(1, text.split("\n").length));
}

function connectorPath(parent: MindNode, child: MindNode) {
  const dx = child.x - parent.x;
  const c1x = parent.x + dx * 0.5;
  const c2x = parent.x + dx * 0.5;
  return `M ${parent.x} ${parent.y} C ${c1x} ${parent.y} ${c2x} ${child.y} ${child.x} ${child.y}`;
}

function pointsToPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function autoLayout(nodes: MindNode[]): MindNode[] {
  const root = nodes.find((n) => n.id === "root");
  if (!root) return nodes;
  const byParent = new Map<string, MindNode[]>();
  for (const n of nodes) {
    const key = n.parentId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const leafCounters: Record<string, number> = { "1": 0, "-1": 0 };

  function layoutSubtree(nodeId: string, depth: number, side: 1 | -1): number {
    const children = byParent.get(nodeId) ?? [];
    if (children.length === 0) {
      const y = CANVAS_H / 2 - 300 + leafCounters[String(side)] * ROW_HEIGHT;
      leafCounters[String(side)] += 1;
      positions.set(nodeId, { x: CANVAS_W / 2 + side * depth * COL_WIDTH, y });
      return y;
    }
    const childYs = children.map((c) => layoutSubtree(c.id, depth + 1, side));
    const y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    positions.set(nodeId, { x: CANVAS_W / 2 + side * depth * COL_WIDTH, y });
    return y;
  }

  const rootChildren = byParent.get("root") ?? [];
  rootChildren.forEach((c, i) => {
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    layoutSubtree(c.id, 1, side);
  });
  positions.set("root", { x: CANVAS_W / 2, y: CANVAS_H / 2 });

  return nodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });
}

export default function Whiteboard({ projectId }: { projectId: string }) {
  const [nodes, setNodes] = useState<MindNode[]>([rootNode()]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<"select" | "draw">("select");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(2.5);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [shapePickerFor, setShapePickerFor] = useState<string | null>(null);
  const [history, setHistory] = useState<BoardSnapshot[]>([]);
  const [future, setFuture] = useState<BoardSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const drawingRef = useRef(false);
  const drawSnapshotRef = useRef<BoardSnapshot | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/board`)
      .then((r) => r.json())
      .then((data) => {
        try {
          const parsed = JSON.parse(data.content);
          if (parsed?.version === 3 && Array.isArray(parsed.nodes)) {
            setNodes(parsed.nodes.length ? parsed.nodes : [rootNode()]);
            setStrokes(Array.isArray(parsed.strokes) ? parsed.strokes : []);
          } else if (parsed?.version === 2 && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            setNodes(parsed.nodes);
            setStrokes([]);
          } else {
            setNodes([rootNode()]);
            setStrokes([]);
          }
        } catch {
          setNodes([rootNode()]);
          setStrokes([]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [projectId]);

  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    const timeout = setTimeout(() => {
      const data: BoardData = { version: 3, nodes, strokes };
      fetch(`/api/projects/${projectId}/board`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(data) }),
      }).finally(() => setSaving(false));
    }, 800);
    return () => clearTimeout(timeout);
  }, [nodes, strokes, loaded, projectId]);

  function pushHistory() {
    setHistory((h) => [...h.slice(-49), { nodes, strokes }]);
    setFuture([]);
  }

  function handleUndo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [{ nodes, strokes }, ...f].slice(0, 50));
    setHistory((h) => h.slice(0, -1));
    setNodes(prev.nodes);
    setStrokes(prev.strokes);
    setSelectedId(null);
    setEditingId(null);
  }

  function handleRedo() {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h.slice(-49), { nodes, strokes }]);
    setFuture((f) => f.slice(1));
    setNodes(next.nodes);
    setStrokes(next.strokes);
    setSelectedId(null);
    setEditingId(null);
  }

  function getCanvasPos(clientX: number, clientY: number) {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left + el.scrollLeft) / zoom,
      y: (clientY - rect.top + el.scrollTop) / zoom,
    };
  }

  function handleAddChild(parentId: string | null) {
    pushHistory();
    const parent = parentId ? nodes.find((n) => n.id === parentId) : null;
    const color = PALETTE[nodes.length % PALETTE.length].bg;
    const angle = Math.random() * Math.PI * 2;
    const dist = 160;
    const x = parent ? parent.x + Math.cos(angle) * dist : CANVAS_W / 2 + (Math.random() - 0.5) * 300;
    const y = parent ? parent.y + Math.sin(angle) * dist : CANVAS_H / 2 - 100 + Math.random() * 200;
    const node: MindNode = { id: newId(), text: "Nova ideia", x, y, color, parentId };
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
    setEditingId(node.id);
    setDraftText(node.text);
  }

  function handleAddSibling(id: string) {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.id === "root") {
      handleAddChild(id);
      return;
    }
    handleAddChild(node.parentId);
  }

  function handleDeleteNode(id: string) {
    if (id === "root") return;
    const descendants = new Set<string>();
    function collect(pid: string) {
      for (const n of nodes) {
        if (n.parentId === pid) {
          descendants.add(n.id);
          collect(n.id);
        }
      }
    }
    collect(id);
    const toDelete = new Set([id, ...descendants]);
    if (toDelete.size > 1 && !confirm(`Excluir esse nó e seus ${toDelete.size - 1} nó(s) filho(s)?`)) return;
    pushHistory();
    setNodes((prev) => prev.filter((n) => !toDelete.has(n.id)));
    setSelectedId(null);
  }

  function handleSetColor(id: string, bg: string) {
    pushHistory();
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, color: bg } : n)));
    setColorPickerFor(null);
  }

  function handleSetShape(id: string, shape: NodeShape) {
    pushHistory();
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, shape } : n)));
    setShapePickerFor(null);
  }

  function startEdit(id: string) {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    setSelectedId(id);
    setEditingId(id);
    setDraftText(n.text);
  }

  function commitEdit() {
    if (!editingId) return;
    pushHistory();
    setNodes((prev) => prev.map((n) => (n.id === editingId ? { ...n, text: draftText.trim() || n.text } : n)));
    setEditingId(null);
  }

  function handleNodePointerDown(e: React.PointerEvent, node: MindNode) {
    if (tool === "draw" || editingId === node.id) return;
    e.stopPropagation();
    setSelectedId(node.id);
    const pos = getCanvasPos(e.clientX, e.clientY);
    pushHistory();
    dragRef.current = {
      id: node.id,
      offsetX: pos.x - node.x,
      offsetY: pos.y - node.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function startStroke(e: React.PointerEvent) {
    const pos = getCanvasPos(e.clientX, e.clientY);
    drawingRef.current = true;
    drawSnapshotRef.current = { nodes, strokes };
    const stroke: Stroke = { id: newId(), points: [pos], color: drawColor, width: drawWidth };
    currentStrokeRef.current = stroke;
    setCurrentStroke(stroke);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function continueStroke(e: React.PointerEvent) {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    const last = currentStrokeRef.current.points[currentStrokeRef.current.points.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 3) return;
    const updated: Stroke = { ...currentStrokeRef.current, points: [...currentStrokeRef.current.points, pos] };
    currentStrokeRef.current = updated;
    setCurrentStroke(updated);
  }

  function endStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setCurrentStroke(null);
    if (finished && finished.points.length > 1) {
      if (drawSnapshotRef.current) {
        setHistory((h) => [...h.slice(-49), drawSnapshotRef.current!]);
        setFuture([]);
      }
      setStrokes((s) => [...s, finished]);
    }
    drawSnapshotRef.current = null;
  }

  function handleContainerPointerDown(e: React.PointerEvent) {
    if (tool === "draw") {
      startStroke(e);
      return;
    }
    const el = containerRef.current!;
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleContainerPointerMove(e: React.PointerEvent) {
    if (tool === "draw") {
      continueStroke(e);
      return;
    }
    if (dragRef.current) {
      const pos = getCanvasPos(e.clientX, e.clientY);
      const { id, offsetX, offsetY } = dragRef.current;
      const x = Math.max(60, Math.min(CANVAS_W - 60, pos.x - offsetX));
      const y = Math.max(30, Math.min(CANVAS_H - 30, pos.y - offsetY));
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
      return;
    }
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panRef.current.moved = true;
      containerRef.current!.scrollLeft = panRef.current.scrollLeft - dx;
      containerRef.current!.scrollTop = panRef.current.scrollTop - dy;
    }
  }

  function handleContainerPointerUp() {
    if (tool === "draw") {
      endStroke();
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }
    if (panRef.current) {
      if (!panRef.current.moved) setSelectedId(null);
      panRef.current = null;
    }
  }

  function handleClearAll() {
    if (!confirm("Apagar todo o mapa mental e os desenhos, e recomeçar do zero?")) return;
    pushHistory();
    setNodes([rootNode()]);
    setStrokes([]);
    setSelectedId(null);
  }

  function handleAutoLayout() {
    pushHistory();
    setNodes((prev) => autoLayout(prev));
  }

  function handleZoom(delta: number) {
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((z + delta) * 10) / 10)));
  }

  function fitToScreen(currentNodes: MindNode[]) {
    const el = containerRef.current;
    if (!el || currentNodes.length === 0) return;
    const xs = currentNodes.map((n) => n.x);
    const ys = currentNodes.map((n) => n.y);
    const minX = Math.min(...xs) - 120;
    const maxX = Math.max(...xs) + 120;
    const minY = Math.min(...ys) - 80;
    const maxY = Math.max(...ys) + 80;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const newZoom = Math.max(MIN_ZOOM, Math.min(1.3, Math.min(el.clientWidth / w, el.clientHeight / h)));
    setZoom(Math.round(newZoom * 10) / 10);
    // setTimeout em vez de requestAnimationFrame: rAF só dispara com a aba ativa/composta na
    // tela, e uma aba recém-aberta ou em segundo plano pode nunca chamar o callback, deixando
    // o scroll parado em (0,0). setTimeout roda de qualquer forma (é uma macrotask comum).
    setTimeout(() => {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      el.scrollLeft = cx * newZoom - el.clientWidth / 2;
      el.scrollTop = cy * newZoom - el.clientHeight / 2;
    }, 0);
  }

  function handleFitToScreen() {
    fitToScreen(nodes);
  }

  // Centraliza a visão no conteúdo assim que o board carrega — sem isso, o container
  // abre sempre no canto superior-esquerdo do canvas de 2400x1400, e como os nós ficam
  // perto do centro, a tela aparece em branco (só o fundo pontilhado) até o usuário
  // descobrir que precisa arrastar/clicar em "ajustar à tela" manualmente.
  useEffect(() => {
    if (!loaded) return;
    setTimeout(() => fitToScreen(nodes), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (!selectedId) return;
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddChild(selectedId);
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleAddSibling(selectedId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId !== "root") {
        e.preventDefault();
        handleDeleteNode(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-gray-200 shadow-soft">
          <button
            onClick={() => setTool("select")}
            className={`px-3 py-1.5 text-sm font-medium ${tool === "select" ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            🖱️ Selecionar
          </button>
          <button
            onClick={() => setTool("draw")}
            className={`px-3 py-1.5 text-sm font-medium ${tool === "draw" ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            ✏️ Desenhar
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1 py-1 shadow-soft">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30"
            title="Desfazer a última ação (Ctrl+Z)"
          >
            ↩️ Desfazer
          </button>
          <button
            onClick={handleRedo}
            disabled={future.length === 0}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30"
            title="Refazer (Ctrl+Shift+Z)"
          >
            ↪️ Refazer
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1 py-1 shadow-soft">
          <button onClick={() => handleZoom(-0.1)} className="rounded-full px-2 py-1 text-sm hover:bg-gray-100">−</button>
          <span className="w-10 text-center text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
          <button onClick={() => handleZoom(0.1)} className="rounded-full px-2 py-1 text-sm hover:bg-gray-100">+</button>
          <button onClick={handleFitToScreen} className="rounded-full px-2 py-1 text-xs text-gray-500 hover:bg-gray-100" title="Ajustar à tela">
            ⛶
          </button>
        </div>

        <button onClick={handleAutoLayout} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-soft hover:border-brand/30">
          🧭 Organizar automaticamente
        </button>

        {saving && <span className="text-xs text-gray-400">salvando...</span>}

        <button onClick={handleClearAll} className="ml-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 shadow-soft hover:border-red-200 hover:text-red-600">
          Limpar tudo
        </button>
      </div>

      {tool === "select" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleAddChild(selectedId ?? "root")}
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-soft hover:bg-brand-dark"
          >
            + {selected ? `Ideia ligada a "${selected.text.slice(0, 20)}"` : "Nova ideia"}
          </button>
          {selected && (
            <>
              <div className="relative">
                <button
                  onClick={() => setColorPickerFor(colorPickerFor === selected.id ? null : selected.id)}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
                >
                  🎨 Cor
                </button>
                {colorPickerFor === selected.id && (
                  <div className="shadow-elevated absolute left-0 top-9 z-10 flex gap-1 rounded-full border border-gray-100 bg-white p-1.5">
                    {PALETTE.map((p) => (
                      <button
                        key={p.bg}
                        onClick={() => handleSetColor(selected.id, p.bg)}
                        className="h-6 w-6 rounded-full border-2"
                        style={{ backgroundColor: p.bg, borderColor: p.border }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setShapePickerFor(shapePickerFor === selected.id ? null : selected.id)}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
                >
                  🔷 Forma
                </button>
                {shapePickerFor === selected.id && (
                  <div className="shadow-elevated absolute left-0 top-9 z-10 flex gap-1 rounded-xl border border-gray-100 bg-white p-1.5">
                    {SHAPES.map((s) => (
                      <button
                        key={s.v}
                        onClick={() => handleSetShape(selected.id, s.v)}
                        title={s.label}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-gray-100 ${
                          (selected.shape ?? "rounded") === s.v ? "bg-gray-200" : ""
                        }`}
                      >
                        {s.icon}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => startEdit(selected.id)} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">
                ✏️ Editar texto
              </button>
              {selected.id !== "root" && (
                <button onClick={() => handleDeleteNode(selected.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100">
                  ✕ Excluir
                </button>
              )}
            </>
          )}
          <span className="text-xs text-gray-400">
            Clique pra selecionar · arraste pra mover · Enter = novo filho · Tab = novo irmão · Delete = excluir · arraste o fundo pra navegar
          </span>
        </div>
      )}

      {tool === "draw" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-soft">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setDrawColor(c)}
                className={`h-6 w-6 rounded-full ${drawColor === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-soft">
            <button
              onClick={() => setDrawWidth(2.5)}
              className={`rounded-full px-2 py-1 text-xs ${drawWidth === 2.5 ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              Fino
            </button>
            <button
              onClick={() => setDrawWidth(5)}
              className={`rounded-full px-2 py-1 text-xs ${drawWidth === 5 ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              Grosso
            </button>
          </div>
          <span className="text-xs text-gray-400">Clique e arraste pra desenhar à mão livre por cima do mapa.</span>
        </div>
      )}

      <div
        ref={containerRef}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerLeave={handleContainerPointerUp}
        className="relative w-full overflow-auto rounded-2xl border border-gray-100 bg-white shadow-elevated"
        style={{ height: 620, cursor: tool === "draw" ? "crosshair" : "grab" }}
      >
        <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
          <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative", transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <svg width={CANVAS_W} height={CANVAS_H} className="absolute left-0 top-0" style={{ pointerEvents: "none" }}>
              <defs>
                <pattern id="wb-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="1.5" fill="#eef0f3" />
                </pattern>
              </defs>
              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#wb-grid)" />

              {nodes
                .filter((n) => n.parentId)
                .map((n) => {
                  const parent = byId.get(n.parentId!);
                  if (!parent) return null;
                  const palette = PALETTE.find((p) => p.bg === n.color) ?? PALETTE[0];
                  return (
                    <path key={n.id} d={connectorPath(parent, n)} stroke={palette.border} strokeWidth={2} fill="none" opacity={0.55} />
                  );
                })}

              {strokes.map((s) => (
                <path key={s.id} d={pointsToPath(s.points)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {currentStroke && (
                <path d={pointsToPath(currentStroke.points)} stroke={currentStroke.color} strokeWidth={currentStroke.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>

            {nodes.map((n) => {
              const palette = PALETTE.find((p) => p.bg === n.color) ?? PALETTE[0];
              const isSelected = n.id === selectedId;
              const isEditing = n.id === editingId;
              const shape = n.shape ?? "rounded";
              const width = nodeWidth(isEditing ? draftText : n.text) + (shape === "diamond" ? 60 : 0);
              const padClass = shape === "diamond" ? "px-8 py-8" : "px-3 py-2";
              const minHClass = shape === "diamond" ? "min-h-[100px]" : "min-h-[44px]";
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => handleNodePointerDown(e, n)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (tool === "select") startEdit(n.id);
                  }}
                  className={`absolute flex ${minHClass} items-center justify-center ${padClass} text-center text-sm font-medium ${
                    tool === "select" ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                  style={{
                    left: n.x,
                    top: n.y,
                    width,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: n.color,
                    border: `1.5px solid ${palette.border}`,
                    color: "#1f2937",
                    boxShadow: isSelected ? `0 0 0 3px ${palette.border}66, 0 1px 2px rgba(0,0,0,0.05)` : "0 1px 2px rgba(0,0,0,0.05)",
                    pointerEvents: tool === "draw" ? "none" : "auto",
                    ...shapeStyle(shape),
                  }}
                >
                  {isEditing ? (
                    <textarea
                      autoFocus
                      rows={nodeRows(draftText)}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={commitEdit}
                      className="w-full resize-none rounded-md border border-gray-300 bg-white px-1.5 py-1 text-center text-sm"
                    />
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{n.text}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
