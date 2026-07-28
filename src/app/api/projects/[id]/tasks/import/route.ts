import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

const statusMap: Record<string, string> = {
  "a fazer": "A_FAZER",
  afazer: "A_FAZER",
  todo: "A_FAZER",
  fazendo: "FAZENDO",
  "em andamento": "FAZENDO",
  "in progress": "FAZENDO",
  bloqueado: "BLOQUEADO",
  blocked: "BLOQUEADO",
  feito: "FEITO",
  concluido: "FEITO",
  concluído: "FEITO",
  done: "FEITO",
};

const priorityMap: Record<string, string> = {
  baixa: "BAIXA",
  low: "BAIXA",
  media: "MEDIA",
  média: "MEDIA",
  medium: "MEDIA",
  alta: "ALTA",
  high: "ALTA",
  urgente: "URGENTE",
  urgent: "URGENTE",
};

function parseStatus(raw?: string | null) {
  if (!raw) return undefined;
  return statusMap[raw.trim().toLowerCase()];
}

function parsePriority(raw?: string | null) {
  if (!raw) return undefined;
  return priorityMap[raw.trim().toLowerCase()];
}

const columnMappingSchema = z.object({
  column: z.string(),
  targetType: z.enum(["ignore", "builtin", "existingField", "newField"]),
  builtinKey: z.enum(["title", "description", "status", "priority", "assignee", "startDate", "dueDate"]).optional(),
  fieldId: z.string().optional(),
  newFieldName: z.string().optional(),
  newFieldType: z.enum(["TEXTO", "NUMERO", "MOEDA", "DATA", "LISTA", "CHECKBOX", "PESSOA"]).optional(),
});

const importSchema = z.object({
  columnMappings: z.array(columnMappingSchema),
  rows: z.array(z.record(z.any())),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(userId, role, project.teamId);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { columnMappings, rows } = parsed.data;

  const titleMapping = columnMappings.find((m) => m.targetType === "builtin" && m.builtinKey === "title");
  if (!titleMapping) {
    return NextResponse.json({ error: "É preciso mapear uma coluna para o Título" }, { status: 422 });
  }

  const teamMembers = await prisma.userTeam.findMany({
    where: { teamId: project.teamId },
    include: { user: { select: { id: true, name: true } } },
  });

  const newFieldIdByColumn = new Map<string, string>();
  const maxOrderResult = await prisma.customField.aggregate({
    where: { projectId: params.id },
    _max: { order: true },
  });
  let nextOrder = (maxOrderResult._max.order ?? -1) + 1;

  for (const m of columnMappings) {
    if (m.targetType === "newField" && m.newFieldName && m.newFieldType) {
      const field = await prisma.customField.create({
        data: { projectId: params.id, name: m.newFieldName, type: m.newFieldType, order: nextOrder++ },
      });
      newFieldIdByColumn.set(m.column, field.id);
    }
  }

  let created = 0;
  for (const row of rows) {
    const title = String(row[titleMapping.column] ?? "").trim();
    if (!title) continue;

    const data: any = { title, projectId: params.id };

    for (const m of columnMappings) {
      const raw = row[m.column];
      if (m.targetType === "builtin") {
        if (m.builtinKey === "title" || raw === undefined || raw === null || raw === "") continue;
        if (m.builtinKey === "description") data.description = String(raw);
        if (m.builtinKey === "status") data.status = parseStatus(String(raw)) ?? "A_FAZER";
        if (m.builtinKey === "priority") data.priority = parsePriority(String(raw)) ?? "MEDIA";
        if (m.builtinKey === "assignee") {
          const match = teamMembers.find((tm) => tm.user.name.toLowerCase() === String(raw).trim().toLowerCase());
          if (match) data.assigneeId = match.user.id;
        }
        if (m.builtinKey === "startDate") {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) data.startDate = d;
        }
        if (m.builtinKey === "dueDate") {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) data.dueDate = d;
        }
      }
    }

    const task = await prisma.task.create({ data });
    created++;

    for (const m of columnMappings) {
      const raw = row[m.column];
      if (raw === undefined || raw === null || raw === "") continue;

      let fieldId: string | undefined;
      if (m.targetType === "existingField") fieldId = m.fieldId;
      if (m.targetType === "newField") fieldId = newFieldIdByColumn.get(m.column);

      if (fieldId) {
        await prisma.taskCustomFieldValue.create({
          data: { taskId: task.id, customFieldId: fieldId, value: String(raw) },
        });
      }
    }
  }

  return NextResponse.json({ created });
}
