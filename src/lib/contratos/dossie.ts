// Dossie Excel do contrato: UMA planilha com tudo o que o app ja mostra do contrato, cada parte numa aba. So' reune numeros que ja existem nas telas
// (Custos, Rel114, Medicao, Previsao, equipe); nao calcula nada novo. Cada aba e' opcional: se uma parte nao estiver disponivel (sem permissao,
// contrato sem medicao...), o dossie sai sem ela e a aba "Resumo" diz o que faltou. Sem acesso ao banco: quem chama entrega o `buscar`.
import { agruparPorGrupo, chaveMes, contratosNaBase, linhasDoContrato, soma, type ContratoCusto, type Filtros } from "@/lib/custos/agregacao";
import { mesCurto } from "@/lib/custos/formato";
import { linhasRel114 } from "@/lib/custos/rel114";
import { abaDeLinhas, type AbaExcel } from "@/lib/exportarExcel";
import { abaPrevisaoMesAMes } from "@/lib/contratos/planilhaExcel";
import { abaMedicaoPorLinha } from "@/lib/medicao/excel";

export type FichaDossie = {
  codccu: string; nome: string; tipo: string; status: string; cliente: string | null; numero: string | null;
  vigenciaInicio: string | null; vigenciaFim: string | null; valor: number | null;
};
/** Devolve o JSON da resposta, ou null se a parte nao esta disponivel (erro, sem permissao...). */
export type Buscar = (url: string) => Promise<any | null>;

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;

/** Plano de contas x mes do contrato (todos os meses da base), agrupado por tipo de conta, com a participacao de cada conta e a linha de TOTAL. */
export function abaCustoPorConta(contrato: ContratoCusto, mesesAsc: string[]): AbaExcel {
  const f: Filtros = { de: mesesAsc[0] ?? "", ate: mesesAsc[mesesAsc.length - 1] ?? "", tipo: "todos", grupo: "todos" };
  const linhas = linhasDoContrato(contrato, f, mesesAsc).filter((l) => l.total !== 0);
  const grupos = agruparPorGrupo(linhas, mesesAsc.length);
  const total = soma(linhas.map((l) => l.total));
  const totaisMes = mesesAsc.map((_, i) => soma(linhas.map((l) => l.serie[i])));
  const cab = ["Grupo", "Conta financeira", "Reembolsável", ...mesesAsc.map(mesCurto), "Total do período", "% do centro de custo"];
  const corpo: (string | number)[][] = [];
  for (const g of grupos) for (const l of g.linhas) corpo.push([g.grupoNome, l.conta.contaFinanceira, l.conta.reembolsavel ? "sim" : "não", ...l.serie, l.total, total ? l.total / total : 0]);
  corpo.push(["", "TOTAL", "", ...totaisMes, total, 1]);
  return abaDeLinhas("Custo por conta x mês", [cab, ...corpo], `${contrato.nome} · CCU ${contrato.codccu} · custo por data de pagamento, ${mesCurto(f.de)} a ${mesCurto(f.ate)}`, true);
}

type MembroEquipe = { role: string; user: { name: string; cargo?: string | null } };
export function abaEquipe(equipeNome: string, membros: MembroEquipe[]): AbaExcel {
  const ordem = [...membros].sort((a, b) => (a.role === b.role ? a.user.name.localeCompare(b.user.name, "pt-BR") : a.role === "GESTOR" ? -1 : 1));
  return {
    nome: "Equipe",
    observacao: `Equipe: ${equipeNome}`,
    colunas: [{ titulo: "Nome", largura: 40 }, { titulo: "Papel na equipe", largura: 18 }, { titulo: "Cargo", largura: 36 }],
    linhas: ordem.map((m) => [m.user.name, m.role === "GESTOR" ? "Gestor" : "Membro", m.user.cargo ?? ""]),
  };
}

type ProjetoDoContrato = {
  name: string; status: string; percentComplete: number; overdueCount: number; blockedCount?: number; startDate: string | null; endDate: string | null;
  owner: { name: string }; team?: { name: string }; nucleos?: { name: string }[]; saude?: { rotulo: string; motivos: string[] }; _count?: { tasks: number };
};
const SITUACAO: Record<string, string> = { PLANEJADO: "Planejado", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", CONCLUIDO: "Concluído" };

/** Projetos ligados ao contrato (Project.codccu), com a saude de cada um. */
export function abaProjetos(projetos: ProjetoDoContrato[]): AbaExcel {
  return {
    nome: "Projetos",
    colunas: [
      { titulo: "Projeto", largura: 44 }, { titulo: "Situação", largura: 14 }, { titulo: "Saúde", largura: 12 }, { titulo: "Por quê", largura: 46 }, { titulo: "Responsável", largura: 26 }, { titulo: "Equipe", largura: 28 },
      { titulo: "Núcleos", largura: 30 }, { titulo: "Início", tipo: "data" }, { titulo: "Fim previsto", tipo: "data" }, { titulo: "Tarefas", tipo: "inteiro" }, { titulo: "Atrasadas", tipo: "inteiro" }, { titulo: "Bloqueadas", tipo: "inteiro" }, { titulo: "Andamento", tipo: "percentual" },
    ],
    linhas: projetos.map((p) => [
      p.name, SITUACAO[p.status] ?? p.status, p.saude?.rotulo ?? "", p.saude?.motivos.join("; ") ?? "", p.owner.name, p.team?.name ?? "", (p.nucleos ?? []).map((n) => n.name).join(", "),
      p.startDate, p.endDate, p._count?.tasks ?? 0, p.overdueCount ?? 0, p.blockedCount ?? 0, (p.percentComplete ?? 0) / 100,
    ]),
  };
}

export type Indicadores = { custoTotal: number | null; periodoCusto: string | null; mesesComCusto: number; maiorConta: { nome: string; valor: number } | null; contratado: number | null; medido: number | null; saldo: number | null };

export function abaResumo(ficha: FichaDossie, ind: Indicadores, equipe: { nome: string; pessoas: number } | null, avisos: string[], agora: Date): AbaExcel {
  const texto = (item: string, t: string): (string | number | null)[] => [item, t, null];
  const valor = (item: string, v: number | null): (string | number | null)[] => [item, "", v];
  const linhas: (string | number | null)[][] = [
    texto("CCU", ficha.codccu), texto("Contrato", ficha.nome), texto("Tipo", ficha.tipo === "ADMINISTRATIVO" ? "Administrativo" : "Contrato"), texto("Situação", ficha.status === "ENCERRADO" ? "Encerrado" : "Ativo"),
    texto("Cliente", ficha.cliente ?? ""), texto("Número do contrato", ficha.numero ?? ""), texto("Vigência", [dataBr(ficha.vigenciaInicio), dataBr(ficha.vigenciaFim)].filter(Boolean).join(" a ")),
    valor("Valor do contrato (R$)", ficha.valor),
  ];
  if (ind.custoTotal !== null) {
    linhas.push(texto("Período do custo", ind.periodoCusto ?? ""), valor("Custo no período (R$)", ind.custoTotal), texto("Meses com custo", String(ind.mesesComCusto)));
    if (ind.mesesComCusto > 0) linhas.push(valor("Média por mês com custo (R$)", ind.custoTotal / ind.mesesComCusto));
    if (ind.maiorConta) linhas.push(texto("Maior conta", `${ind.maiorConta.nome} (${pct(ind.custoTotal ? ind.maiorConta.valor / ind.custoTotal : 0)} do custo)`));
  }
  if (ind.contratado !== null) {
    linhas.push(valor("Contratado nas linhas do Senior (R$)", ind.contratado), valor("Medido acumulado (R$)", ind.medido), valor("Saldo a medir (R$)", ind.saldo));
    if (ind.contratado > 0 && ind.medido !== null) linhas.push(texto("Medido sobre o contratado", pct(ind.medido / ind.contratado)));
  }
  if (equipe) linhas.push(texto("Equipe", `${equipe.nome} · ${equipe.pessoas} pessoa(s)`));
  linhas.push(texto("Gerado em", agora.toLocaleString("pt-BR")));
  for (const a of avisos) linhas.push(texto("Aviso", a));
  return {
    nome: "Resumo",
    observacao: `Dossiê do contrato · ${ficha.nome} · CCU ${ficha.codccu}. Reúne o que o sistema mostra do contrato; nada aqui é calculado à parte.`,
    colunas: [{ titulo: "Item", largura: 38 }, { titulo: "Informação", largura: 60 }, { titulo: "Valor", tipo: "moeda" }],
    linhas,
  };
}

export async function montarDossie(ficha: FichaDossie, buscar: Buscar, agora: Date = new Date()): Promise<AbaExcel[]> {
  const avisos: string[] = [];
  const abas: AbaExcel[] = [];
  const ind: Indicadores = { custoTotal: null, periodoCusto: null, mesesComCusto: 0, maiorConta: null, contratado: null, medido: null, saldo: null };

  // 1) custos (quadro por conta x mes) e 2) lancamentos do Rel114
  const custos = await buscar("/api/custos-conta");
  if (!custos || !Array.isArray(custos.contratos)) {
    avisos.push("Custos: não foi possível ler (sem permissão ou sistema fora do ar).");
  } else {
    const mesesAsc: string[] = (custos.meses as string[]).map(chaveMes).sort();
    const cc = contratosNaBase(custos.contratos, "pagamento").find((c) => c.codccu === ficha.codccu);
    if (!cc || mesesAsc.length === 0) {
      avisos.push("Custos: este contrato não tem custo lançado nos meses da base.");
    } else {
      const quadro = abaCustoPorConta(cc, mesesAsc);
      abas.push(quadro);
      const f: Filtros = { de: mesesAsc[0], ate: mesesAsc[mesesAsc.length - 1], tipo: "todos", grupo: "todos" };
      const linhas = linhasDoContrato(cc, f, mesesAsc).filter((l) => l.total !== 0);
      const totaisMes = mesesAsc.map((_, i) => soma(linhas.map((l) => l.serie[i])));
      ind.custoTotal = soma(linhas.map((l) => l.total));
      ind.periodoCusto = `${mesCurto(f.de)} a ${mesCurto(f.ate)} (por data de pagamento)`;
      ind.mesesComCusto = totaisMes.filter((t) => t !== 0).length;
      const maior = linhas[0];
      ind.maiorConta = maior ? { nome: maior.conta.contaFinanceira, valor: maior.total } : null;

      const qs = new URLSearchParams({ codccu: ficha.codccu, de: f.de, ate: f.ate, base: "pagamento" });
      const lanc = await buscar(`/api/custos-conta/lancamentos?${qs.toString()}`);
      if (lanc && Array.isArray(lanc.linhas) && lanc.linhas.length > 0) abas.push(abaDeLinhas("Lançamentos (Rel114)", linhasRel114(lanc), `${ficha.nome} · CCU ${ficha.codccu} · lançamentos de ${mesCurto(f.de)} a ${mesCurto(f.ate)}, no layout do Rel114 do Senior`, true));
      else avisos.push(lanc && Array.isArray(lanc.linhas) ? "Lançamentos (Rel114): nenhum lançamento no período." : "Lançamentos (Rel114): não foi possível ler.");
    }
  }

  // 3) medicao por linha (so' contratos que tem linhas contratadas no Senior)
  const lista = await buscar("/api/medicao?todos=1");
  const m = lista && Array.isArray(lista.contratos) ? lista.contratos.find((c: any) => c.codccu === ficha.codccu) : null;
  if (!m) {
    avisos.push(lista ? "Medição: este contrato não tem linhas contratadas no Senior." : "Medição: não foi possível ler.");
  } else {
    ind.contratado = m.valorContratado ?? null;
    ind.medido = m.valorMedido ?? null;
    ind.saldo = m.saldo ?? null;
    const d = await buscar(`/api/medicao/${encodeURIComponent(m.numCtr)}`);
    if (d && Array.isArray(d.linhas) && d.periodo) abas.push(abaMedicaoPorLinha(d, d.periodo));
    else avisos.push("Medição por linha: não foi possível ler.");
  }

  // 4) previsao mes a mes (planilha por linha de custo)
  const prev = await buscar(`/api/previsao/mensal?ccu=${encodeURIComponent(ficha.codccu)}`);
  if (prev && prev.planilha && Array.isArray(prev.planilha.linhas) && prev.planilha.linhas.length > 0) abas.push(abaPrevisaoMesAMes(prev.planilha, "Linha de custo"));
  else avisos.push(prev ? "Previsão: sem previsão lançada para este contrato." : "Previsão: não foi possível ler.");

  // 5) projetos ligados ao contrato (a mesma lista da tela de Projetos: so' os que a pessoa ve)
  const todosProjetos = await buscar("/api/projects");
  const doContrato = Array.isArray(todosProjetos) ? todosProjetos.filter((p: any) => p.contrato?.codccu === ficha.codccu) : null;
  if (doContrato && doContrato.length > 0) abas.push(abaProjetos(doContrato));
  else avisos.push(doContrato ? "Projetos: nenhum projeto ligado a este contrato que você possa ver." : "Projetos: não foi possível ler.");

  // 6) equipe do contrato (a equipe cujo centro de custo e' o do contrato)
  const times = await buscar("/api/teams");
  const equipe = Array.isArray(times) ? times.find((t: any) => t.codccu === ficha.codccu) : null;
  let equipeResumo: { nome: string; pessoas: number } | null = null;
  if (equipe && Array.isArray(equipe.members)) {
    abas.push(abaEquipe(equipe.name, equipe.members));
    equipeResumo = { nome: equipe.name, pessoas: equipe.members.length };
  } else {
    avisos.push("Equipe: não há equipe ligada a este contrato (ou você não a enxerga).");
  }

  return [abaResumo(ficha, ind, equipeResumo, avisos, agora), ...abas];
}
