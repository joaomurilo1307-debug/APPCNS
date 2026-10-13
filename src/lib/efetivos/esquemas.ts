// Validacoes (zod) compartilhadas pelas rotas /api/efetivos. Fica fora dos arquivos route.ts
// porque o Next so permite exportar os metodos HTTP de la.
import { z } from "zod";
import { ATIVIDADES, PRIORIDADES, STATUS_CAMPANHA, dataValida } from "./disponibilidade";

export const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

export const campanhaSchema = z.object({
  recebidaEm: dia.nullable().optional(),
  solicitante: z.string().trim().max(120).nullable().optional(),
  projeto: z.string().trim().min(1).max(60),
  grupo: z.string().trim().min(1).max(40),
  atividade: z.enum(ATIVIDADES),
  local: z.string().trim().max(160).nullable().optional(),
  inicio: dia,
  fim: dia,
  qtdEquipes: z.number().int().min(1).max(100).default(1),
  prioridade: z.enum(PRIORIDADES).default("Média"),
  status: z.enum(STATUS_CAMPANHA).default("Nova"),
  observacao: z.string().trim().max(500).nullable().optional(),
});
