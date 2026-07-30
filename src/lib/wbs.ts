export type WithParent = { id: string; parentTaskId?: string | null };

export type WbsRow<T> = { task: T; depth: number; wbs: string };

// Numeração hierárquica estilo WBS (1, 1.1, 1.2, 2, 2.1...) — mesma ordem de inserção dos irmãos.
export function buildWbsHierarchy<T extends WithParent>(tasks: T[]): WbsRow<T>[] {
  const idSet = new Set(tasks.map((t) => t.id));
  const byParent = new Map<string | null, T[]>();
  for (const t of tasks) {
    const key = t.parentTaskId && idSet.has(t.parentTaskId) ? t.parentTaskId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  const result: WbsRow<T>[] = [];
  function walk(parentId: string | null, prefix: string) {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((t, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const depth = wbs.split(".").length - 1;
      result.push({ task: t, depth, wbs });
      walk(t.id, wbs);
    });
  }
  walk(null, "");
  return result;
}
