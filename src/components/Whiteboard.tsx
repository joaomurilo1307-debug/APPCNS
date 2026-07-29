"use client";

import { useEffect, useRef, useState } from "react";

type MindNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  parentId: string | null;
};

type BoardData = { version: 2; nodes: MindNode[] };

const PALETTE = [
  { bg: "#eef2ff", border: "#6366f1" },
  { bg: "#fef3c7", border: "#d97706" },
  { bg: "#dcfce7", border: "#16a34a" },
  { bg: "#fee2e2", border: "#dc2626" },
  { bg: "#ede9fe", border: "#7c3aed" },
  { bg: "#e0f2fe", border: "#0284c7" },
  { bg: "#fce7f3", border: "#db2777" },
];

const CANVAS_W = 2400;
const CANVAS_H = 1400;
const NODE_W = 160;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function rootNode(): MindNode {
  return { id: "root", text: "Ideia central", x: CANVAS_W / 2, y: 140, color: PALETTE[0].bg, parentId: null };
}

export default function Whiteboard({ projectId }: { projectId: string }) {
  const [nodes, setNodes] = useState<MindNode[]>([rootNode()]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/board`)
      .then((r) => r.json())
      .then((data) => {
        try {
          const parsed = JSON.parse(data.content);
          if (parsed?.version === 2 && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            setNodes(parsed.nodes);
          } else {
            setNodes([rootNode()]);
          }
        } catch {
          setNodes([rootNode()]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [projectId]);

  useEffect(() => {
    if (!loaded) return;
    const timeout = setTimeout(() => {
      const data: BoardData = { version: 2, nodes };
      fetch(`/api/projects/${projectId}/board`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(data) }),
      });
    }, 800);
    return () => clearTimeout(timeout);
  }, [nodes, loaded, projectId]);

  function getCanvasPos(clientX: number, clientY: number) {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left + el.scrollLeft, y: clientY - rect.top + el.scrollTop };
  }

  function handleAddChild(parentId: string | null) {
    const parent = parentId ? nodes.find((n) => n.id === parentId) : null;
    const color = PALETTE[nodes.length % PALETTE.length].bg;
    const angle = Math.random() * Math.PI * 2;
    const dist = 160;
    const x = parent ? parent.x + Math.cos(angle) * dist : CANVAS_W / 2 + (Math.random() - 0.5) * 300;
    const y = parent ? parent.y + Math.sin(angle) * dist : 300 + Math.random() * 200;
    const node: MindNode = { id: newId(), text: "Nova ideia", x, y, color, parentId: parentId };
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
    setEditingId(node.id);
    setDraftText(node.text);
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
    setNodes((prev) => prev.filter((n) => !toDelete.has(n.id)));
    setSelectedId(null);
  }

  function handleCycleColor(id: string) {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const idx = PALETTE.findIndex((p) => p.bg === n.color);
        const next = PALETTE[(idx + 1) % PALETTE.length];
        return { ...n, color: next.bg };
      })
    );
  }

  function commitEdit() {
    if (!editingId) return;
    setNodes((prev) => prev.map((n) => (n.id === editingId ? { ...n, text: draftText.trim() || n.text } : n)));
    setEditingId(null);
  }

  function handleNodePointerDown(e: React.PointerEvent, node: MindNode) {
    if (editingId === node.id) return;
    e.stopPropagation();
    setSelectedId(node.id);
    const pos = getCanvasPos(e.clientX, e.clientY);
    dragRef.current = { id: node.id, offsetX: pos.x - node.x, offsetY: pos.y - node.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    const { id, offsetX, offsetY } = dragRef.current;
    const x = Math.max(NODE_W / 2, Math.min(CANVAS_W - NODE_W / 2, pos.x - offsetX));
    const y = Math.max(30, Math.min(CANVAS_H - 30, pos.y - offsetY));
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleClearAll() {
    if (!confirm("Apagar todo o mapa mental e recomeçar do zero?")) return;
    setNodes([rootNode()]);
    setSelectedId(null);
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleAddChild(selectedId ?? "root")}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + {selected ? `Ideia ligada a "${selected.text.slice(0, 20)}"` : "Nova ideia"}
        </button>
        {selected && (
          <>
            <button
              onClick={() => handleCycleColor(selected.id)}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
            >
              🎨 Cor
            </button>
            <button
              onClick={() => {
                setEditingId(selected.id);
                setDraftText(selected.text);
              }}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
            >
              ✏️ Editar texto
            </button>
            {selected.id !== "root" && (
              <button
                onClick={() => handleDeleteNode(selected.id)}
                className="rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100"
              >
                ✕ Excluir
              </button>
            )}
          </>
        )}
        <span className="text-xs text-gray-400">Clique num nó pra selecionar, arraste pra mover, duplo clique pra editar o texto.</span>
        <button onClick={handleClearAll} className="ml-auto rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">
          Limpar tudo
        </button>
      </div>

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={() => setSelectedId(null)}
        className="relative w-full overflow-auto rounded-xl border border-gray-200 bg-white"
        style={{ height: 600 }}
      >
        <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
          <svg width={CANVAS_W} height={CANVAS_H} className="absolute left-0 top-0" style={{ pointerEvents: "none" }}>
            {nodes
              .filter((n) => n.parentId)
              .map((n) => {
                const parent = byId.get(n.parentId!);
                if (!parent) return null;
                return (
                  <line
                    key={n.id}
                    x1={parent.x}
                    y1={parent.y}
                    x2={n.x}
                    y2={n.y}
                    stroke="#cbd5e1"
                    strokeWidth={2}
                  />
                );
              })}
          </svg>

          {nodes.map((n) => {
            const palette = PALETTE.find((p) => p.bg === n.color) ?? PALETTE[0];
            const isSelected = n.id === selectedId;
            const isEditing = n.id === editingId;
            return (
              <div
                key={n.id}
                onPointerDown={(e) => handleNodePointerDown(e, n)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(n.id);
                  setEditingId(n.id);
                  setDraftText(n.text);
                }}
                className="absolute flex min-h-[44px] cursor-grab items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-medium active:cursor-grabbing"
                style={{
                  left: n.x,
                  top: n.y,
                  width: NODE_W,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: n.color,
                  border: `1.5px solid ${palette.border}`,
                  color: "#1f2937",
                  boxShadow: isSelected ? `0 0 0 3px ${palette.border}66, 0 1px 2px rgba(0,0,0,0.05)` : "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={commitEdit}
                    className="w-full rounded-md border border-gray-300 bg-white px-1.5 py-1 text-center text-sm"
                  />
                ) : (
                  <span className="break-words">{n.text}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
