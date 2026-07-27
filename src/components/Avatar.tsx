function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  color,
  size = 24,
}: {
  name: string;
  color?: string | null;
  size?: number;
}) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        backgroundColor: color || "#0f766e",
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </span>
  );
}

export const AVATAR_PALETTE = [
  "#0f766e", "#b91c1c", "#1d4ed8", "#a16207",
  "#7e22ce", "#be185d", "#0369a1", "#15803d",
  "#c2410c", "#4338ca",
];
