// Leitura das planilhas do controle de efetivos (afugentamento / resgate) da MRN.
// Aceita os formatos que o Samuel usa:
//   A) "painel": aba "Profissionais" (ID VAGA, ID EQUIPE, PROJETO, ... STATUS ATUAL) + aba "Equipes" (status da equipe);
//   B) "original": uma aba so, uma linha por vaga, nome da equipe preenchido apenas na 1a linha de cada equipe;
//   C) "divisao" (semana 42): aba "DIVISÃO DE EQUIPES" (equipe, 4x4, viatura VL) + aba de apoio vindo de outro contrato.
// So le e devolve estruturas; quem grava (e so acrescenta) e a rota de importacao.

import * as XLSX from "xlsx";
import { dataValida, somarDias, type Dia } from "./disponibilidade";

export type EquipeImportada = { codigo: string; projeto: string; gestor: string | null; grupo: string; nome: string; status: string };
export type AusenciaImportada = { tipo: string; inicio: Dia; fim: Dia };
export type VagaImportada = {
  numero: number | null;
  equipeCodigo: string;
  atividade: string;
  empresa: string;
  cargo: string;
  nome: string | null;
  status: string;
  observacao: string | null;
  ausencia: AusenciaImportada | null;
  nivel?: string | null;
  direcao4x4?: boolean | null;
  contratoAtual?: string | null;
  disponivelAPartir?: Dia | null;
  destino?: string | null;
};
// Viatura que a planilha cita para a equipe ("VL 01"); placa e contrato nao vem na planilha.
export type VeiculoImportado = { identificacao: string; equipeCodigo: string; ocupantes: number };
export type ResultadoImportacao = {
  formato: "painel" | "divisao" | "original";
  equipes: EquipeImportada[];
  vagas: VagaImportada[];
  veiculos: VeiculoImportado[];
  avisos: string[];
};
export type OpcoesLeitura = { anoReferencia?: number };

export function normalizar(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const texto = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
const textoOuNulo = (v: unknown): string | null => {
  const t = texto(v);
  return t === "" ? null : t;
};

/** Numero de serie do Excel, texto dd/mm/aaaa ou aaaa-mm-dd -> AAAA-MM-DD (ou null). */
export function paraDia(v: unknown): Dia | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    const d = v.toISOString().slice(0, 10);
    return dataValida(d) ? d : null;
  }
  if (typeof v === "number") {
    if (!(v > 20000 && v < 80000)) return null;
    const dia = somarDias("1899-12-30", Math.floor(v));
    return dataValida(dia) ? dia : null;
  }
  const t = String(v).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (br) {
    const dia = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    return dataValida(dia) ? dia : null;
  }
  return dataValida(t.slice(0, 10)) ? t.slice(0, 10) : null;
}

const TIPOS_COM_PRAZO: Record<string, string> = { ferias: "Férias", atestado: "Atestado", folga: "Folga", treinamento: "Treinamento" };

/** Converte o texto de status da planilha para o status da vaga (+ ausencia datada quando houver prazo). */
export function interpretarStatus(
  bruto: unknown,
  inicio: Dia | null,
  fim: Dia | null
): { status: string; ausencia: AusenciaImportada | null; observacao: string | null; aviso: string | null } {
  const n = normalizar(bruto);
  const original = texto(bruto);
  if (n === "" || n === "vigente" || n === "ativo") return { status: "Vigente", ausencia: null, observacao: null, aviso: null };
  if (n.startsWith("apto") && n.includes("restri")) return { status: "Apto com restrição", ausencia: null, observacao: null, aviso: null };
  if (n.startsWith("afastad")) {
    return { status: "Afastado", ausencia: null, observacao: original === "Afastado" ? null : original, aviso: null };
  }
  if (n === "em contratacao") return { status: "Em contratação", ausencia: null, observacao: null, aviso: null };
  if (n.startsWith("desmobiliz")) return { status: "Desmobilizado", ausencia: null, observacao: null, aviso: null };
  const tipo = TIPOS_COM_PRAZO[n];
  if (tipo) {
    if (inicio && fim && inicio <= fim) return { status: "Vigente", ausencia: { tipo, inicio, fim }, observacao: null, aviso: null };
    return {
      status: "Afastado",
      ausencia: null,
      observacao: `Importado como "${original}" sem período informado`,
      aviso: `Status "${original}" sem datas de início e fim: ficou como Afastado até ser informado o período.`,
    };
  }
  return {
    status: "Afastado",
    ausencia: null,
    observacao: `Status importado: "${original}"`,
    aviso: `Status "${original}" não reconhecido: ficou como Afastado (indisponível) até ser conferido.`,
  };
}

type Cabecalho = Map<string, number>; // nome normalizado -> indice da coluna

function acharCabecalho(linhas: unknown[][], obrigatorias: string[]): { indice: number; cab: Cabecalho } | null {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cab: Cabecalho = new Map();
    linhas[i].forEach((c, j) => {
      const n = normalizar(c);
      if (n && !cab.has(n)) cab.set(n, j);
    });
    if (obrigatorias.every((o) => cab.has(o))) return { indice: i, cab };
  }
  return null;
}

function col(cab: Cabecalho, ...nomes: string[]): number {
  for (const n of nomes) if (cab.has(n)) return cab.get(n)!;
  return -1;
}

function codigoEquipe(n: number): string {
  return `EQ-${String(n).padStart(2, "0")}`;
}

function lerLinhas(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false, defval: "" });
}

function abaVisivel(wb: XLSX.WorkBook, nome: string): boolean {
  const info = wb.Workbook?.Sheets?.find((x) => x.name === nome);
  return !info || !info.Hidden;
}

export function lerPlanilhaEfetivos(dados: ArrayBuffer | Uint8Array | Buffer, opcoes: OpcoesLeitura = {}): ResultadoImportacao {
  const wb = XLSX.read(dados, { type: "buffer" });
  const avisos: string[] = [];

  // ---- formato A: painel com aba Profissionais
  const abaProf = wb.SheetNames.find((n) => normalizar(n) === "profissionais");
  if (abaProf) {
    const linhas = lerLinhas(wb.Sheets[abaProf]);
    const ch = acharCabecalho(linhas, ["id equipe", "projeto", "grupo"]);
    if (!ch) throw new Error('Aba "Profissionais" sem as colunas ID EQUIPE, PROJETO e GRUPO.');
    const c = ch.cab;
    const iNum = col(c, "id vaga", "id");
    const iEq = col(c, "id equipe");
    const iProj = col(c, "projeto");
    const iGestor = col(c, "gestor mrn");
    const iGrupo = col(c, "grupo");
    const iNome = col(c, "equipe");
    const iAtiv = col(c, "atividade base", "atividade");
    const iEmp = col(c, "empresa");
    const iCargo = col(c, "cargo / funcao", "cargo");
    const iProfis = col(c, "profissional", "profissionais");
    const iStatus = col(c, "status atual", "status");
    const iIni = col(c, "inicio condicao");
    const iFim = col(c, "fim condicao");
    const iObs = col(c, "observacao");

    const statusEquipe = new Map<string, string>();
    const abaEq = wb.SheetNames.find((n) => normalizar(n) === "equipes");
    if (abaEq) {
      const le = lerLinhas(wb.Sheets[abaEq]);
      const ce = acharCabecalho(le, ["id equipe", "status equipe"]);
      if (ce) {
        const iId = ce.cab.get("id equipe")!;
        const iSt = ce.cab.get("status equipe")!;
        for (const r of le.slice(ce.indice + 1)) {
          const id = texto(r[iId]);
          if (id) statusEquipe.set(id, texto(r[iSt]) || "Ativa");
        }
      }
    }

    const equipes = new Map<string, EquipeImportada>();
    const vagas: VagaImportada[] = [];
    for (const r of linhas.slice(ch.indice + 1)) {
      const eqCodigo = texto(r[iEq]);
      if (!eqCodigo) continue;
      if (!equipes.has(eqCodigo)) {
        equipes.set(eqCodigo, {
          codigo: eqCodigo,
          projeto: texto(r[iProj]),
          gestor: textoOuNulo(r[iGestor]),
          grupo: texto(r[iGrupo]),
          nome: texto(r[iNome]) || eqCodigo,
          status: statusEquipe.get(eqCodigo) ?? "Ativa",
        });
      }
      const st = interpretarStatus(r[iStatus], iIni >= 0 ? paraDia(r[iIni]) : null, iFim >= 0 ? paraDia(r[iFim]) : null);
      if (st.aviso) avisos.push(`${eqCodigo} vaga ${texto(r[iNum])}: ${st.aviso}`);
      const obsPlanilha = iObs >= 0 ? textoOuNulo(r[iObs]) : null;
      const n = Number(r[iNum]);
      vagas.push({
        numero: Number.isFinite(n) && texto(r[iNum]) !== "" ? n : null,
        equipeCodigo: eqCodigo,
        atividade: texto(r[iAtiv]) || "Resgate",
        empresa: texto(r[iEmp]),
        cargo: texto(r[iCargo]),
        nome: textoOuNulo(r[iProfis]),
        status: st.status,
        observacao: [obsPlanilha, st.observacao].filter(Boolean).join(" | ") || null,
        ausencia: st.ausencia,
      });
    }
    if (vagas.length === 0) throw new Error('A aba "Profissionais" não tem nenhuma vaga.');
    return { formato: "painel", equipes: [...equipes.values()], vagas, veiculos: [], avisos };
  }

  // ---- formato C: "DIVISÃO DE EQUIPES" (semana 42): equipe na coluna ATIVIDADE, viaturas VL e direção 4x4
  const abaDivisao = wb.SheetNames.find((n) => normalizar(n) === "divisao de equipes");
  if (abaDivisao) return lerDivisaoDeEquipes(wb, abaDivisao, opcoes);

  // ---- formato B: planilha original (primeira aba visivel com as colunas esperadas)
  const abaOriginal = wb.SheetNames.find((n) => abaVisivel(wb, n) && !!acharCabecalho(lerLinhas(wb.Sheets[n]), ["projeto", "grupo", "equipe / projeto"]));
  const ws = wb.Sheets[abaOriginal ?? wb.SheetNames[0]];
  const linhas = lerLinhas(ws);
  const ch = acharCabecalho(linhas, ["projeto", "grupo", "equipe / projeto"]);
  if (!ch) throw new Error("Não reconheci a planilha: esperava a aba Profissionais (painel) ou as colunas PROJETO, GRUPO e EQUIPE / PROJETO (original).");
  const c = ch.cab;
  const iNum = col(c, "id");
  const iProj = col(c, "projeto");
  const iGestor = col(c, "gestor mrn");
  const iGrupo = col(c, "grupo");
  const iNome = col(c, "equipe / projeto");
  const iAtiv = col(c, "resgate / afugentamento");
  const iEmp = col(c, "empresa");
  const iCargo = col(c, "carg / funcao", "cargo / funcao");
  const iProfis = col(c, "profissionais", "profissional");
  const iStatus = col(c, "status");

  // O nome da equipe so aparece na 1a linha de cada bloco; as linhas seguintes herdam o nome.
  // A equipe-base e identificada por projeto + nome + grupo (o mesmo nome de equipe tem
  // metade Fauna e metade Flora, e pode reaparecer em outro trecho da planilha), na
  // ordem em que aparece -- e assim que o painel do Samuel numera EQ-01...EQ-17.
  const equipes: EquipeImportada[] = [];
  const porChave = new Map<string, EquipeImportada>();
  const vagas: VagaImportada[] = [];
  let projetoAnterior = "";
  let nomeAtual = "";
  for (const r of linhas.slice(ch.indice + 1)) {
    const projeto = texto(r[iProj]);
    const cargo = texto(r[iCargo]);
    if (!projeto && !cargo) continue;
    if (projeto !== projetoAnterior) {
      projetoAnterior = projeto;
      nomeAtual = "";
    }
    const nomeLinha = texto(r[iNome]);
    if (nomeLinha !== "") nomeAtual = nomeLinha;
    const nome = nomeAtual || "(sem nome na planilha)";
    const grupo = texto(r[iGrupo]);
    const chave = `${projeto}|${nome}|${grupo}`;
    let eq = porChave.get(chave);
    if (!eq) {
      eq = {
        codigo: codigoEquipe(equipes.length + 1),
        projeto,
        gestor: textoOuNulo(r[iGestor]),
        grupo,
        nome,
        status: "Ativa",
      };
      if (!nomeAtual) avisos.push(`${eq.codigo}: a planilha não traz o nome da equipe (projeto ${projeto}).`);
      porChave.set(chave, eq);
      equipes.push(eq);
    }
    const st = interpretarStatus(r[iStatus], null, null);
    const n = Number(r[iNum]);
    if (st.aviso) avisos.push(`${eq.codigo} vaga ${texto(r[iNum])}: ${st.aviso}`);
    vagas.push({
      numero: Number.isFinite(n) && texto(r[iNum]) !== "" ? n : null,
      equipeCodigo: eq.codigo,
      atividade: texto(r[iAtiv]) || "Resgate",
      empresa: texto(r[iEmp]),
      cargo,
      nome: textoOuNulo(r[iProfis]),
      status: st.status,
      observacao: st.observacao,
      ausencia: null,
    });
  }
  if (vagas.length === 0) throw new Error("A planilha não tem nenhuma vaga abaixo do cabeçalho.");
  return { formato: "original", equipes, vagas, veiculos: [], avisos };
}


// ---------------------------------------------------------------- formato "DIVISÃO DE EQUIPES"

const PROJETO_A_DEFINIR = "A definir";

function ehVago(v: unknown): boolean {
  const n = normalizar(v);
  return n === "" || n === "vago" || n === "vaga";
}

/** "Acaba LT 10/10" -> data do ultimo dia (dd/mm do ano de referencia). */
export function ultimoDiaDeTexto(texto_: unknown, ano: number): Dia | null {
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(String(texto_ ?? ""));
  if (!m) return null;
  const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ano;
  const dia = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return dataValida(dia) ? dia : null;
}

function lerDivisaoDeEquipes(wb: XLSX.WorkBook, aba: string, opcoes: OpcoesLeitura): ResultadoImportacao {
  const avisos: string[] = [];
  const linhas = lerLinhas(wb.Sheets[aba]);
  const ch = acharCabecalho(linhas, ["atividade", "empresa", "equipe", "cargo / funcao", "nome profissionais"]);
  if (!ch) throw new Error('Aba "DIVISÃO DE EQUIPES" sem as colunas ATIVIDADE, EMPRESA, EQUIPE, Cargo / Função e NOME PROFISSIONAIS.');
  const c = ch.cab;
  const iTime = col(c, "atividade");
  const iEmp = col(c, "empresa");
  const iAtiv = col(c, "equipe");
  const iNivel = col(c, "nivel");
  const iCargo = col(c, "cargo / funcao");
  const iNome = col(c, "nome profissionais");
  const i4x4 = col(c, "direcao 4x4");
  const iCarro = col(c, "carros");
  const iStatus = col(c, "status atual");

  const equipes: EquipeImportada[] = [];
  const vagas: VagaImportada[] = [];
  const veiculos: VeiculoImportado[] = [];
  const cargosPorEquipe = new Map<string, string[]>();
  let atual: EquipeImportada | null = null;
  let carroAtual: VeiculoImportado | null = null;
  for (const r of linhas.slice(ch.indice + 1)) {
    const cargo = texto(r[iCargo]);
    const nomeEquipe = texto(r[iTime]);
    if (!cargo && !nomeEquipe) continue;
    // a equipe (coluna ATIVIDADE) vem mesclada: so a 1a linha traz o nome
    if (nomeEquipe !== "" || !atual) {
      atual = {
        codigo: codigoEquipe(equipes.length + 1),
        projeto: PROJETO_A_DEFINIR,
        gestor: null,
        grupo: "Fauna",
        nome: nomeEquipe || "(sem nome na planilha)",
        status: "Ativa",
      };
      equipes.push(atual);
      cargosPorEquipe.set(atual.codigo, []);
      carroAtual = null; // a viatura nunca atravessa de uma equipe para outra
    }
    // a viatura (coluna CARROS) tambem vem mesclada: vale ate a proxima viatura citada
    const placa = texto(r[iCarro]);
    if (placa !== "") {
      carroAtual = { identificacao: placa, equipeCodigo: atual.codigo, ocupantes: 0 };
      veiculos.push(carroAtual);
    }
    const nome = ehVago(r[iNome]) ? null : texto(r[iNome]);
    const st = interpretarStatus(r[iStatus], null, null);
    if (st.aviso) avisos.push(`${atual.nome} (${cargo}): ${st.aviso}`);
    const dir = normalizar(r[i4x4]);
    if (carroAtual && nome) carroAtual.ocupantes++;
    cargosPorEquipe.get(atual.codigo)!.push(cargo);
    vagas.push({
      numero: vagas.length + 1,
      equipeCodigo: atual.codigo,
      atividade: texto(r[iAtiv]) || "Resgate",
      empresa: texto(r[iEmp]),
      cargo,
      nome,
      status: st.status,
      observacao: st.observacao,
      ausencia: null,
      nivel: textoOuNulo(r[iNivel]),
      direcao4x4: dir === "sim" ? true : dir === "nao" ? false : null,
    });
  }
  if (vagas.length === 0) throw new Error('A aba "DIVISÃO DE EQUIPES" não tem nenhuma vaga.');

  // grupo: Flora so quando algum cargo da equipe for de flora; senao Fauna (todos os cargos desta planilha sao de fauna)
  for (const e of equipes) {
    if ((cargosPorEquipe.get(e.codigo) ?? []).some((x) => normalizar(x).includes("flora"))) e.grupo = "Flora";
  }
  avisos.unshift(
    `A planilha não informa contrato/projeto, gestor nem grupo das ${equipes.length} equipes: entraram com projeto "${PROJETO_A_DEFINIR}" e grupo deduzido pelos cargos (Fauna, salvo cargo de Flora). Defina o contrato de cada equipe no sistema.`
  );

  // aba de apoio vindo de outro contrato (ex.: "EQUIPE DE LT PARA APOIO")
  const abaApoio = wb.SheetNames.find((n) => normalizar(n).includes("apoio"));
  if (abaApoio) {
    const la = lerLinhas(wb.Sheets[abaApoio]);
    const ca = acharCabecalho(la, ["contrato", "funcao", "profissional"]);
    if (ca) {
      const k = ca.cab;
      const ano = opcoes.anoReferencia ?? new Date().getFullYear();
      const porContrato = new Map<string, EquipeImportada>();
      for (const r of la.slice(ca.indice + 1)) {
        const contrato = texto(r[k.get("contrato")!]);
        const prof = textoOuNulo(r[k.get("profissional")!]);
        if (!contrato || !prof) continue;
        let eq = porContrato.get(contrato);
        if (!eq) {
          eq = { codigo: codigoEquipe(equipes.length + 1), projeto: contrato, gestor: null, grupo: "Apoio", nome: `APOIO — ${contrato}`, status: "Ativa" };
          porContrato.set(contrato, eq);
          equipes.push(eq);
        }
        const transicao = textoOuNulo(r[col(k, "data de tranasicao", "data de transicao")]);
        const ultimo = transicao ? ultimoDiaDeTexto(transicao, ano) : null;
        if (transicao && !ultimo) avisos.push(`Apoio ${contrato} (${prof}): não entendi a data "${transicao}"; ficou sem previsão de liberação.`);
        const partes = (
          [
            ["Liberação pela segurança", textoOuNulo(r[col(k, "liberacao pela seguranca")])],
            ["Mobilizado", textoOuNulo(r[col(k, "mobilizado")])],
            ["Lavra", textoOuNulo(r[col(k, "lavra")])],
            ["Transição", transicao],
          ] as [string, string | null][]
        )
          .filter(([, v]) => v)
          .map(([a, v]) => `${a}: ${v}`);
        vagas.push({
          numero: vagas.length + 1,
          equipeCodigo: eq.codigo,
          atividade: "Apoio",
          empresa: "A informar",
          cargo: texto(r[k.get("funcao")!]) || "A informar",
          nome: prof,
          status: "Vigente",
          observacao: partes.join(" · ") || null,
          ausencia: null,
          contratoAtual: contrato,
          disponivelAPartir: ultimo ? somarDias(ultimo, 1) : null,
          destino: textoOuNulo(r[col(k, "migrar para")]),
        });
      }
    }
  }
  return { formato: "divisao", equipes, vagas, veiculos, avisos };
}
