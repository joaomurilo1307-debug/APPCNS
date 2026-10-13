// Regras puras (sem banco) do controle de efetivos de campo (afugentamento / resgate).
//
// Reproduz a logica da planilha do Samuel (aba Equipes/Dashboard) e acrescenta o que
// ela nao fazia: disponibilidade por PESSOA e por PERIODO, e a consulta "quem esta
// livre de X a Y" para montar a equipe de cada campanha.
//
// Datas de calendario trafegam como "AAAA-MM-DD" (comparacao de texto e correta e
// nao sofre com fuso). Nada aqui acessa banco; as rotas carregam os dados e chamam.

export type Dia = string; // AAAA-MM-DD

export const STATUS_EQUIPE = ["Ativa", "Em formação", "Inativa"] as const;
export const STATUS_VAGA = ["Vigente", "Apto com restrição", "Afastado", "Em contratação", "Desmobilizado"] as const;
export const TIPOS_AUSENCIA = ["Férias", "Atestado", "Afastado", "Folga", "Treinamento", "Outro"] as const;
export const GRUPOS = ["Fauna", "Flora"] as const;
export const ATIVIDADES = ["Afugentamento", "Resgate", "Afugentamento e Resgate", "Apoio / Coordenação"] as const;
export const PRIORIDADES = ["Alta", "Média", "Baixa"] as const;
export const STATUS_CAMPANHA = ["Nova", "Em análise", "Planejada", "Confirmada", "Em execução", "Concluída", "Cancelada"] as const;

// Na planilha original so "Vigente" conta como pessoa em condicao de trabalhar.
// "Apto com restrição" ficou de fora porque a formula dele trata qualquer status
// diferente de Vigente como ausencia; se o Samuel decidir o contrario, e so mudar aqui.
export const STATUS_QUE_TRABALHAM: readonly string[] = ["Vigente"];

// Campanha cancelada ou concluida nao segura mais ninguem.
export const STATUS_CAMPANHA_QUE_LIBERAM: readonly string[] = ["Cancelada", "Concluída"];

export type EquipeBase = {
  id: string;
  codigo: string;
  nome: string;
  projeto: string;
  gestor: string | null;
  grupo: string;
  status: string;
};

export type VagaBase = {
  id: string;
  equipeId: string;
  nome: string | null;
  status: string;
  cargo: string;
  empresa: string;
  atividade: string;
  previsaoInicio?: Dia | null;
  // Pessoa que ainda esta ocupada em outro contrato (ex.: apoio vindo do 4362 LT) e so fica
  // livre a partir desta data; antes dela conta como ocupada, e o contrato aparece como motivo.
  contratoAtual?: string | null;
  disponivelAPartir?: Dia | null;
};

export type AusenciaBase = { id?: string; vagaId: string; tipo: string; inicio: Dia; fim: Dia };
export type AlocacaoBase = { id?: string; vagaId: string; campanhaId: string; inicio: Dia; fim: Dia };
export type CampanhaBase = {
  id: string;
  codigo: string;
  projeto: string;
  grupo: string;
  atividade: string;
  inicio: Dia;
  fim: Dia;
  qtdEquipes: number;
  status: string;
};

export type DadosEfetivos = {
  equipes: EquipeBase[];
  vagas: VagaBase[];
  ausencias: AusenciaBase[];
  // Somente alocacoes de campanhas que ainda seguram gente (ver alocacoesQueSeguram).
  alocacoes: AlocacaoBase[];
};

// ---------------------------------------------------------------- datas

export function dataValida(s: unknown): s is Dia {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function somarDias(dia: Dia, n: number): Dia {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diferencaDias(de: Dia, ate: Dia): number {
  return Math.round((Date.parse(`${ate}T00:00:00.000Z`) - Date.parse(`${de}T00:00:00.000Z`)) / 86400000);
}

/** Dois periodos fechados [aIni,aFim] e [bIni,bFim] tem algum dia em comum? */
export function intersecta(aIni: Dia, aFim: Dia, bIni: Dia, bFim: Dia): boolean {
  return aIni <= bFim && bIni <= aFim;
}

export function temNome(v: Pick<VagaBase, "nome">): boolean {
  return !!v.nome && v.nome.trim() !== "";
}

// ---------------------------------------------------------------- estado da pessoa

export type SituacaoPessoa = "LIVRE" | "ALOCADA" | "AUSENTE" | "VAGA_ABERTA";

export type EstadoVaga = {
  situacao: SituacaoPessoa;
  // AUSENTE: tipo da ausencia/status (dado restrito); VAGA_ABERTA: "Em contratação" ou "Sem profissional"
  motivo: string | null;
  campanhaId: string | null;
  // pessoa alocada num periodo em que tambem esta ausente (precisa de atencao)
  conflito: boolean;
};

export type Indice = {
  ausencias: Map<string, AusenciaBase[]>;
  alocacoes: Map<string, AlocacaoBase[]>;
};

export function indexar(dados: Pick<DadosEfetivos, "ausencias" | "alocacoes">, ignorarCampanhaId?: string | null): Indice {
  const ausencias = new Map<string, AusenciaBase[]>();
  for (const a of dados.ausencias) {
    if (!ausencias.has(a.vagaId)) ausencias.set(a.vagaId, []);
    ausencias.get(a.vagaId)!.push(a);
  }
  const alocacoes = new Map<string, AlocacaoBase[]>();
  for (const a of dados.alocacoes) {
    if (ignorarCampanhaId && a.campanhaId === ignorarCampanhaId) continue;
    if (!alocacoes.has(a.vagaId)) alocacoes.set(a.vagaId, []);
    alocacoes.get(a.vagaId)!.push(a);
  }
  return { ausencias, alocacoes };
}

/** Estado de uma vaga em um dia (ini=fim) ou ao longo de um periodo (qualquer dia do periodo conta). */
export function estadoDaVaga(vaga: VagaBase, idx: Indice, ini: Dia, fim: Dia = ini): EstadoVaga {
  if (!temNome(vaga)) {
    return {
      situacao: "VAGA_ABERTA",
      motivo: vaga.status === "Em contratação" ? "Em contratação" : "Sem profissional",
      campanhaId: null,
      conflito: false,
    };
  }
  const aloc = (idx.alocacoes.get(vaga.id) ?? []).find((a) => intersecta(a.inicio, a.fim, ini, fim));
  if (!STATUS_QUE_TRABALHAM.includes(vaga.status)) {
    return { situacao: "AUSENTE", motivo: vaga.status, campanhaId: aloc?.campanhaId ?? null, conflito: !!aloc };
  }
  const aus = (idx.ausencias.get(vaga.id) ?? []).find((a) => intersecta(a.inicio, a.fim, ini, fim));
  if (aus) return { situacao: "AUSENTE", motivo: aus.tipo, campanhaId: aloc?.campanhaId ?? null, conflito: !!aloc };
  if (vaga.disponivelAPartir && ini < vaga.disponivelAPartir) {
    return { situacao: "ALOCADA", motivo: `Em ${vaga.contratoAtual ?? "outro contrato"} até ${somarDias(vaga.disponivelAPartir, -1)}`, campanhaId: aloc?.campanhaId ?? null, conflito: false };
  }
  if (aloc) return { situacao: "ALOCADA", motivo: null, campanhaId: aloc.campanhaId, conflito: false };
  return { situacao: "LIVRE", motivo: null, campanhaId: null, conflito: false };
}

/** So as alocacoes de campanhas que ainda seguram pessoas entram no calculo de disponibilidade. */
export function alocacoesQueSeguram(
  alocacoes: AlocacaoBase[],
  campanhas: Pick<CampanhaBase, "id" | "status">[]
): AlocacaoBase[] {
  const seguram = new Set(campanhas.filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)).map((c) => c.id));
  return alocacoes.filter((a) => seguram.has(a.campanhaId));
}

// ---------------------------------------------------------------- equipe (igual a planilha)

export type SituacaoRh = "EQUIPE NÃO ATIVA" | "COM VAGAS" | "COM AUSÊNCIA" | "COMPLETA";
export type Disponibilidade = "DISPONÍVEL" | "ALOCADA" | "INDISPONÍVEL";

export type LinhaEquipe = EquipeBase & {
  vagasPrevistas: number;
  nomesPreenchidos: number;
  ausentes: number;
  alocacoes: number; // pessoas da equipe alocadas no periodo
  livres: number; // pessoas da equipe livres no periodo
  conflitos: number;
  situacaoRh: SituacaoRh;
  disponibilidade: Disponibilidade;
};

export function avaliarEquipe(equipe: EquipeBase, vagas: VagaBase[], idx: Indice, ini: Dia, fim: Dia = ini): LinhaEquipe {
  let nomes = 0;
  let ausentes = 0;
  let alocadas = 0;
  let livres = 0;
  let conflitos = 0;
  for (const v of vagas) {
    const e = estadoDaVaga(v, idx, ini, fim);
    if (temNome(v)) nomes++;
    if (e.situacao === "AUSENTE") ausentes++;
    if (e.situacao === "ALOCADA") alocadas++;
    if (e.situacao === "LIVRE") livres++;
    if (e.conflito) conflitos++;
  }
  const previstas = vagas.length;
  const ativa = equipe.status === "Ativa";
  const situacaoRh: SituacaoRh = !ativa ? "EQUIPE NÃO ATIVA" : nomes < previstas ? "COM VAGAS" : ausentes > 0 ? "COM AUSÊNCIA" : "COMPLETA";
  const disponibilidade: Disponibilidade =
    !ativa || nomes < previstas || ausentes > 0 ? "INDISPONÍVEL" : alocadas > 0 ? "ALOCADA" : "DISPONÍVEL";
  return {
    ...equipe,
    vagasPrevistas: previstas,
    nomesPreenchidos: nomes,
    ausentes,
    alocacoes: alocadas,
    livres,
    conflitos,
    situacaoRh,
    disponibilidade,
  };
}

// ---------------------------------------------------------------- painel + resumo por grupo

export type ResumoGrupo = {
  grupo: string;
  total: number;
  disponiveis: number;
  alocadas: number;
  indisponiveis: number;
  pessoas: { vagas: number; preenchidas: number; livres: number; alocadas: number; ausentes: number; abertas: number };
};

export type Painel = {
  inicio: Dia;
  fim: Dia;
  equipes: LinhaEquipe[];
  grupos: ResumoGrupo[];
  totais: {
    equipes: number;
    disponiveis: number;
    alocadas: number;
    indisponiveis: number;
    pessoas: ResumoGrupo["pessoas"];
    conflitos: number;
  };
};

export function ordenarGrupos(grupos: string[]): string[] {
  const unicos = Array.from(new Set(grupos));
  const conhecidos = GRUPOS.filter((g) => unicos.includes(g)) as string[];
  const outros = unicos.filter((g) => !(GRUPOS as readonly string[]).includes(g)).sort();
  return [...conhecidos, ...outros];
}

function pessoasVazio(): ResumoGrupo["pessoas"] {
  return { vagas: 0, preenchidas: 0, livres: 0, alocadas: 0, ausentes: 0, abertas: 0 };
}

export function montarPainel(dados: DadosEfetivos, ini: Dia, fim: Dia = ini): Painel {
  const idx = indexar(dados);
  const vagasPorEquipe = new Map<string, VagaBase[]>();
  for (const v of dados.vagas) {
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  const linhas = dados.equipes.map((e) => avaliarEquipe(e, vagasPorEquipe.get(e.id) ?? [], idx, ini, fim));

  const grupos: ResumoGrupo[] = ordenarGrupos(dados.equipes.map((e) => e.grupo)).map((g) => ({
    grupo: g,
    total: 0,
    disponiveis: 0,
    alocadas: 0,
    indisponiveis: 0,
    pessoas: pessoasVazio(),
  }));
  const porGrupo = new Map(grupos.map((g) => [g.grupo, g]));
  const totais = { equipes: 0, disponiveis: 0, alocadas: 0, indisponiveis: 0, pessoas: pessoasVazio(), conflitos: 0 };

  for (const l of linhas) {
    const g = porGrupo.get(l.grupo)!;
    g.total++;
    totais.equipes++;
    if (l.disponibilidade === "DISPONÍVEL") (g.disponiveis++, totais.disponiveis++);
    else if (l.disponibilidade === "ALOCADA") (g.alocadas++, totais.alocadas++);
    else (g.indisponiveis++, totais.indisponiveis++);
    totais.conflitos += l.conflitos;
    for (const v of vagasPorEquipe.get(l.id) ?? []) {
      const e = estadoDaVaga(v, idx, ini, fim);
      for (const alvo of [g.pessoas, totais.pessoas]) {
        alvo.vagas++;
        if (temNome(v)) alvo.preenchidas++;
        if (e.situacao === "LIVRE") alvo.livres++;
        else if (e.situacao === "ALOCADA") alvo.alocadas++;
        else if (e.situacao === "AUSENTE") alvo.ausentes++;
        else alvo.abertas++;
      }
    }
  }
  return { inicio: ini, fim, equipes: linhas, grupos, totais };
}

// ---------------------------------------------------------------- quem esta livre (montar equipe)

export type PessoaLivre = VagaBase & { equipeCodigo: string; equipeNome: string; grupo: string; projeto: string };
export type PessoaIndisponivel = PessoaLivre & { situacao: Exclude<SituacaoPessoa, "LIVRE">; motivo: string | null; campanhaId: string | null };

/**
 * Quem esta livre em TODO o periodo [ini,fim]. Pessoa com ausencia ou alocacao em qualquer
 * dia do periodo nao e livre. Equipes inativas nao oferecem gente. `ignorarCampanhaId`
 * desconsidera as alocacoes da propria campanha (para editar a equipe que ja existe).
 */
export function livresNoPeriodo(
  dados: DadosEfetivos,
  ini: Dia,
  fim: Dia,
  opcoes: { ignorarCampanhaId?: string | null; grupo?: string | null } = {}
): { livres: PessoaLivre[]; indisponiveis: PessoaIndisponivel[] } {
  const idx = indexar(dados, opcoes.ignorarCampanhaId);
  const equipes = new Map(dados.equipes.map((e) => [e.id, e]));
  const livres: PessoaLivre[] = [];
  const indisponiveis: PessoaIndisponivel[] = [];
  for (const v of dados.vagas) {
    const eq = equipes.get(v.equipeId);
    if (!eq || eq.status === "Inativa") continue;
    if (opcoes.grupo && eq.grupo !== opcoes.grupo) continue;
    if (!temNome(v)) continue;
    const base: PessoaLivre = { ...v, equipeCodigo: eq.codigo, equipeNome: eq.nome, grupo: eq.grupo, projeto: eq.projeto };
    const e = estadoDaVaga(v, idx, ini, fim);
    if (e.situacao === "LIVRE") livres.push(base);
    else if (e.situacao !== "VAGA_ABERTA") indisponiveis.push({ ...base, situacao: e.situacao, motivo: e.motivo, campanhaId: e.campanhaId });
  }
  return { livres, indisponiveis };
}

export type ProblemaAlocacao = { vagaId: string; motivo: "INEXISTENTE" | "SEM_PROFISSIONAL" | "EQUIPE_INATIVA" | "AUSENTE" | "ALOCADA"; detalhe: string | null };

/** Valida a escolha de pessoas para uma campanha; lista vazia = pode gravar. */
export function validarAlocacao(
  dados: DadosEfetivos,
  campanhaId: string,
  vagaIds: string[],
  ini: Dia,
  fim: Dia
): ProblemaAlocacao[] {
  const idx = indexar(dados, campanhaId);
  const vagas = new Map(dados.vagas.map((v) => [v.id, v]));
  const equipes = new Map(dados.equipes.map((e) => [e.id, e]));
  const problemas: ProblemaAlocacao[] = [];
  for (const id of new Set(vagaIds)) {
    const v = vagas.get(id);
    if (!v) {
      problemas.push({ vagaId: id, motivo: "INEXISTENTE", detalhe: null });
      continue;
    }
    if (!temNome(v)) {
      problemas.push({ vagaId: id, motivo: "SEM_PROFISSIONAL", detalhe: null });
      continue;
    }
    if (equipes.get(v.equipeId)?.status === "Inativa") {
      problemas.push({ vagaId: id, motivo: "EQUIPE_INATIVA", detalhe: null });
      continue;
    }
    const e = estadoDaVaga(v, idx, ini, fim);
    if (e.situacao === "AUSENTE") problemas.push({ vagaId: id, motivo: "AUSENTE", detalhe: e.motivo });
    else if (e.situacao === "ALOCADA") problemas.push({ vagaId: id, motivo: "ALOCADA", detalhe: e.campanhaId ?? e.motivo });
  }
  return problemas;
}

// ---------------------------------------------------------------- campanha x capacidade

export type Atendimento = "CAPACIDADE SUFICIENTE" | "ATENDIMENTO PARCIAL" | "SEM EQUIPE DISPONÍVEL";

export type AtendimentoCampanha = {
  equipesDisponiveis: number; // equipes-base completas, sem ausencia e sem alocacao em todo o periodo
  saldo: number; // disponiveis - demanda
  atendimento: Atendimento;
  pessoasLivresNoGrupo: number;
  pessoasAlocadas: number; // ja reservadas para esta campanha
};

export function atendimentoDaCampanha(dados: DadosEfetivos, c: CampanhaBase): AtendimentoCampanha {
  const idx = indexar(dados, c.id);
  const vagasPorEquipe = new Map<string, VagaBase[]>();
  for (const v of dados.vagas) {
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  let disponiveis = 0;
  for (const e of dados.equipes) {
    if (e.grupo !== c.grupo) continue;
    const l = avaliarEquipe(e, vagasPorEquipe.get(e.id) ?? [], idx, c.inicio, c.fim);
    if (l.disponibilidade === "DISPONÍVEL") disponiveis++;
  }
  const atendimento: Atendimento =
    disponiveis >= c.qtdEquipes ? "CAPACIDADE SUFICIENTE" : disponiveis > 0 ? "ATENDIMENTO PARCIAL" : "SEM EQUIPE DISPONÍVEL";
  const livres = livresNoPeriodo(dados, c.inicio, c.fim, { ignorarCampanhaId: c.id, grupo: c.grupo }).livres.length;
  const alocadas = dados.alocacoes.filter((a) => a.campanhaId === c.id).length;
  return { equipesDisponiveis: disponiveis, saldo: disponiveis - c.qtdEquipes, atendimento, pessoasLivresNoGrupo: livres, pessoasAlocadas: alocadas };
}

// ---------------------------------------------------------------- agora e depois

export type PontoDisponibilidade = {
  data: Dia;
  porGrupo: Record<string, { equipesDisponiveis: number; equipesAlocadas: number; equipesIndisponiveis: number; livres: number; alocadas: number; ausentes: number; abertas: number }>;
};

/** Disponibilidade nos dias pedidos (hoje, +7, +30...), por grupo. */
export function serieDisponibilidade(dados: DadosEfetivos, dias: Dia[]): PontoDisponibilidade[] {
  return dias.map((dia) => {
    const p = montarPainel(dados, dia);
    const porGrupo: PontoDisponibilidade["porGrupo"] = {};
    for (const g of p.grupos) {
      porGrupo[g.grupo] = {
        equipesDisponiveis: g.disponiveis,
        equipesAlocadas: g.alocadas,
        equipesIndisponiveis: g.indisponiveis,
        livres: g.pessoas.livres,
        alocadas: g.pessoas.alocadas,
        ausentes: g.pessoas.ausentes,
        abertas: g.pessoas.abertas,
      };
    }
    return { data: dia, porGrupo };
  });
}

export type BalancoGrupo = {
  grupo: string;
  demandaEquipes: number; // soma de equipes pedidas pelas campanhas que cobrem o dia
  equipesCompletas: number; // equipes ativas com todas as vagas preenchidas e ninguem ausente
  vagasAbertas: number;
  saldo: number; // completas - demanda; negativo = faltam equipes (contratar ou realocar)
};

/** Capacidade (equipes completas) contra a demanda das campanhas vivas no dia, por grupo. */
export function balancoCapacidade(dados: DadosEfetivos, campanhas: CampanhaBase[], dia: Dia): BalancoGrupo[] {
  // alocacoes ignoradas de proposito: capacidade e quem existe, nao quem esta livre
  const idx = indexar({ ausencias: dados.ausencias, alocacoes: [] });
  const vagasPorEquipe = new Map<string, VagaBase[]>();
  for (const v of dados.vagas) {
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  return ordenarGrupos([...dados.equipes.map((e) => e.grupo), ...campanhas.map((c) => c.grupo)]).map((grupo) => {
    let completas = 0;
    let abertas = 0;
    for (const e of dados.equipes.filter((x) => x.grupo === grupo)) {
      const vs = vagasPorEquipe.get(e.id) ?? [];
      const l = avaliarEquipe(e, vs, idx, dia);
      if (l.situacaoRh === "COMPLETA") completas++;
      abertas += vs.filter((v) => !temNome(v)).length;
    }
    const demanda = campanhas
      .filter((c) => c.grupo === grupo && !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && intersecta(c.inicio, c.fim, dia, dia))
      .reduce((s, c) => s + c.qtdEquipes, 0);
    return { grupo, demandaEquipes: demanda, equipesCompletas: completas, vagasAbertas: abertas, saldo: completas - demanda };
  });
}
