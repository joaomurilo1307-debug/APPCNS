export function computePercentComplete(tasks: { status: string }[]) {
  const total = tasks.length;
  if (total === 0) return 0;
  const done = tasks.filter((t) => t.status === "FEITO").length;
  return Math.round((done / total) * 100);
}
