export type PessoaMeta = { id: string; name: string };
export type MedicaoMeta = { id: string; value: number; measuredAt: string; period: string | null; note: string | null; createdBy: PessoaMeta };
export type AcaoMeta = { id: string; title: string; description: string | null; ownerId: string | null; owner: PessoaMeta | null; dueDate: string | null; status: string; canUpdate: boolean };
export type MetaContrato = {
  id: string; title: string; description: string | null; category: string; kind: "INDICADOR" | "PLANO"; unit: string | null; baselineValue: number | null; targetValue: number | null; direction: string | null; source: string;
  sourceAccount: string | null; periodStart: string | null; periodEnd: string | null; dueDate: string | null; ownerId: string | null; status: string;
  owner: PessoaMeta | null; contrato: { id: string; codccu: string; nome: string }; currentValue: number | null; fraction: number | null;
  executionFraction: number | null;
  canManage: boolean; canRecord: boolean; sourceError: string | null; sourceUpdatedAt: string | null;
  measurements: MedicaoMeta[]; actions: AcaoMeta[]; projects: { id: string; name: string; goalId: string }[];
};
