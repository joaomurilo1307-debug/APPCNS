function colorFor(pct: number) {
  if (pct >= 70) return { bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50" };
  if (pct >= 35) return { bar: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-50" };
  return { bar: "bg-rose-500", text: "text-rose-700", chip: "bg-rose-50" };
}

export default function ProgressBar({ percent, size = "md" }: { percent: number; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const c = colorFor(pct);
  const height = size === "sm" ? "h-2" : "h-2.5";
  return (
    <div className="flex items-center gap-2">
      <div className={`${height} flex-1 overflow-hidden rounded-full bg-gray-100`}>
        <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`shrink-0 rounded-full ${c.chip} px-2 py-0.5 text-xs font-semibold ${c.text}`}>{pct}%</span>
    </div>
  );
}
