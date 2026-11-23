// Alcada de aprovacao de OC por centro de custo, lida da Senior (GetDBInfo, so' LEITURA). E' o mesmo cadastro da tela F068CNA
// ("Centro de Custo por Usuario", rotina 12 = Ordem de Compra): quem aprova cada CC em cada nivel (1 Coordenador, 2 Gerencia,
// 3 Diretoria). Usado pela tela Aprovadores por CC (23/11/2026).
//
// Tabelas (conferidas na Senior em 23/11/2026):
//   E068CNA  CC x nivel x usuario. SITCNA A/I. USUGER/DATGER/HORGER = inclusao e USUATU/DATATU/HORATU = ultima alteracao
//            (HOR* em minutos desde 0h; DATATU 31/12/1900 = nunca alterado). CRICNA vem sempre 1 e OBSCNA vazio: nao entram.
//   E068NAP  nome do nivel (DESNAP) e se ele esta ativo (SITNAP), por empresa
//   E068UNA  nivel x usuario (SITUNA A/I): se o nivel esta ativo para aquele usuario
//   E044CCU  nome do CC (DESCCU) e tipo (ANASIN A = analitico, S = sintetico), por empresa
//   E099USU  login (NOMUSU), e-mail (INTNET) e situacao (SITUSU) do usuario, por empresa (o mesmo CODUSU vale em todas)
//   R910USU  nome completo (NOMCOM), descricao/setor (DESUSU) e bloqueio do login (CONBLO); R910ENT.NOMENT = login no SGU
//   E070EMP  sigla das empresas
//
// Nivel sem nenhum aprovador ativo NAO trava a OC: a Senior tira esse nivel da cadeia (NIVEXI). A tela mostra esses buracos
// como linhas "Sem aprovador ativo" para quem cuida da alcada enxergar.

import type { LinhaSenior } from "./getDbInfo";
import { dataIso } from "./ocsConferencia";
import { usuariosDoE099 } from "./sincronizacao/aprovacoes";

export const ROTA_OC = 12;

export type SituacaoVinculo = "ATIVO" | "INATIVO" | "VAZIO";
export type SituacaoNivelUsuario = "ATIVO" | "INATIVO" | "SEM_CADASTRO";
export type SituacaoUsuarioSenior = "ATIVO" | "INATIVO" | "BLOQUEADO" | "SEM_CADASTRO";
export type SituacaoFolha = "ATIVO" | "NAO_ENCONTRADO";

export type LinhaAlcada = {
  chave: string;
  codEmp: string;
  empresa: string;
  codCcu: string;
  nomeCcu: string | null;
  tipoCcu: "ANALITICO" | "SINTETICO" | null;
  nivel: number;
  nomeNivel: string;
  /** null nas linhas "Sem aprovador ativo" */
  codUsu: string | null;
  nome: string | null;
  login: string | null;
  email: string | null;
  setor: string | null;
  situacao: SituacaoVinculo;
  nivelDoUsuario: SituacaoNivelUsuario | null;
  usuarioSenior: SituacaoUsuarioSenior | null;
  /** null quando nao ha folha guardada para comparar */
  folha: SituacaoFolha | null;
  pessoaNoSistema: string | null;
  /** "AAAA-MM-DDTHH:MM" (horario da Senior) */
  incluidoEm: string | null;
  incluidoPor: string | null;
  alteradoEm: string | null;
  alteradoPor: string | null;
};

export type DadosAlcada = {
  vinculos: LinhaSenior[]; // E068CNA
  niveis: LinhaSenior[]; // E068NAP
  niveisUsuario: LinhaSenior[]; // E068UNA
  ccus: LinhaSenior[]; // E044CCU
  usuariosEmpresa: LinhaSenior[]; // E099USU
  usuariosSgu: LinhaSenior[]; // R910USU
  entidadesSgu: LinhaSenior[]; // R910ENT
  empresas: LinhaSenior[]; // E070EMP
};

export type Consultar = (sql: string, opcoes?: { timeoutMs?: number }) => Promise<LinhaSenior[]>;

const t = (v: string | undefined) => (v ?? "").trim();
const codigoValido = (v: string | undefined) => /^\d+$/.test(t(v)) && t(v) !== "0";

/** So' SELECT, uma consulta por vez (a fila do GetDBInfo e' de quem chama). A E068CNA inteira leva ~20 s. */
export async function lerDadosAlcada(consultar: Consultar): Promise<DadosAlcada> {
  const vinculos = await consultar(
    `SELECT CODEMP, CODCCU, CODNAP, CODUSU, SITCNA, USUGER, DATGER, HORGER, USUATU, DATATU, HORATU FROM E068CNA WHERE ROTNAP=${ROTA_OC}`,
    { timeoutMs: 180_000 }
  );
  const empresasComAlcada = [...new Set(vinculos.map((v) => t(v.CODEMP)).filter(codigoValido))].sort((a, b) => Number(a) - Number(b));
  const emp = empresasComAlcada.length ? empresasComAlcada.join(",") : "0";
  const niveis = await consultar(`SELECT CODEMP, CODNAP, DESNAP, SITNAP FROM E068NAP WHERE ROTNAP=${ROTA_OC}`);
  const niveisUsuario = await consultar(`SELECT CODEMP, CODNAP, CODUSU, SITUNA FROM E068UNA WHERE ROTNAP=${ROTA_OC}`);
  const ccus = await consultar(`SELECT CODEMP, CODCCU, DESCCU, ANASIN FROM E044CCU WHERE CODEMP IN (${emp})`, { timeoutMs: 120_000 });
  const usuariosEmpresa = await consultar(`SELECT CODEMP, CODUSU, NOMUSU, INTNET, SITUSU FROM E099USU WHERE CODEMP IN (${emp})`, { timeoutMs: 120_000 });
  const usuariosSgu = await consultar("SELECT CODENT, NOMCOM, DESUSU, CONBLO FROM R910USU", { timeoutMs: 120_000 });
  const entidadesSgu = await consultar("SELECT CODENT, NOMENT FROM R910ENT WHERE TIPENT='U'", { timeoutMs: 120_000 });
  const empresas = await consultar("SELECT CODEMP, SIGEMP, NOMEMP FROM E070EMP");
  return { vinculos, niveis, niveisUsuario, ccus, usuariosEmpresa, usuariosSgu, entidadesSgu, empresas };
}

/** Data da Senior ("dd/mm/aaaa", as vezes com hora) + minutos desde 0h -> "AAAA-MM-DDTHH:MM". 31/12/1900 = vazio. */
export function dataHoraSenior(data: string | undefined, minutos: string | undefined): string | null {
  const dia = dataIso(data);
  if (!dia) return null;
  const m = Number(t(minutos));
  if (!Number.isFinite(m) || m <= 0 || m >= 24 * 60) return `${dia}T00:00`;
  return `${dia}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const NOME_NIVEL_PADRAO: Record<number, string> = { 1: "Coordenador", 2: "Gerência", 3: "Diretoria" };
const nomeDoNivel = (desnap: string, nivel: number) => {
  const d = desnap.trim();
  if (!d) return NOME_NIVEL_PADRAO[nivel] ?? `Nível ${nivel}`;
  return d === "Gerencia" ? "Gerência" : d;
};

export function montarAlcada(
  d: DadosAlcada,
  extras: { ativoNaFolha?: ((login: string) => boolean) | null; pessoaNoSistema?: ReadonlyMap<string, string> } = {}
): LinhaAlcada[] {
  const empresa = new Map(d.empresas.map((e) => [t(e.CODEMP), t(e.SIGEMP) || t(e.NOMEMP) || `Empresa ${t(e.CODEMP)}`]));
  const nivelInfo = new Map<string, { nome: string; ativo: boolean }>();
  for (const n of d.niveis) {
    const niv = Number(t(n.CODNAP));
    if (!niv) continue;
    nivelInfo.set(`${t(n.CODEMP)}|${niv}`, { nome: nomeDoNivel(t(n.DESNAP), niv), ativo: t(n.SITNAP).toUpperCase() === "A" });
  }
  const nivelUsuario = new Map<string, SituacaoNivelUsuario>();
  for (const u of d.niveisUsuario) {
    nivelUsuario.set(`${t(u.CODEMP)}|${Number(t(u.CODNAP))}|${t(u.CODUSU)}`, t(u.SITUNA).toUpperCase() === "A" ? "ATIVO" : "INATIVO");
  }
  const ccu = new Map<string, { nome: string | null; tipo: LinhaAlcada["tipoCcu"] }>();
  for (const c of d.ccus) {
    const tipo = t(c.ANASIN).toUpperCase();
    ccu.set(`${t(c.CODEMP)}|${t(c.CODCCU)}`, { nome: t(c.DESCCU) || null, tipo: tipo === "A" ? "ANALITICO" : tipo === "S" ? "SINTETICO" : null });
  }
  const usuarioEmpresa = new Map<string, { login: string; email: string; situacao: string }>();
  for (const u of d.usuariosEmpresa) {
    usuarioEmpresa.set(`${t(u.CODEMP)}|${t(u.CODUSU)}`, { login: t(u.NOMUSU), email: t(u.INTNET), situacao: t(u.SITUSU).toUpperCase() });
  }
  // login/e-mail sem empresa (mesma regra e correcao de cadastro da busca de OCs), para quem nao tem E099USU naquela empresa
  const usuarioGeral = usuariosDoE099(d.usuariosEmpresa);
  const sgu = new Map(d.usuariosSgu.map((u) => [t(u.CODENT), { nome: t(u.NOMCOM), setor: t(u.DESUSU), bloqueado: t(u.CONBLO) === "1" }]));
  const loginSgu = new Map(d.entidadesSgu.map((e) => [t(e.CODENT), t(e.NOMENT).toLowerCase()]));
  const loginDe = (cod: string) => usuarioGeral.get(cod)?.login || loginSgu.get(cod) || null;
  const quem = (cod: string | undefined) => (codigoValido(cod) ? loginDe(t(cod)) ?? `#${t(cod)}` : null);

  const linhas: LinhaAlcada[] = [];
  const ccsComAtivo = new Map<string, { codEmp: string; codCcu: string; niveisAtivos: Set<number> }>();
  const vistos = new Set<string>();

  const baseCc = (codEmp: string, codCcu: string, nivel: number) => {
    const c = ccu.get(`${codEmp}|${codCcu}`);
    return {
      codEmp,
      empresa: empresa.get(codEmp) ?? `Empresa ${codEmp}`,
      codCcu,
      nomeCcu: c?.nome ?? null,
      tipoCcu: c?.tipo ?? null,
      nivel,
      nomeNivel: nivelInfo.get(`${codEmp}|${nivel}`)?.nome ?? NOME_NIVEL_PADRAO[nivel] ?? `Nível ${nivel}`,
    };
  };

  for (const v of d.vinculos) {
    const codEmp = t(v.CODEMP);
    const codCcu = t(v.CODCCU);
    const nivel = Number(t(v.CODNAP));
    const codUsu = t(v.CODUSU);
    if (!codigoValido(codEmp) || !codCcu || !nivel || !codigoValido(codUsu)) continue;
    const chave = `${codEmp}|${codCcu}|${nivel}|${codUsu}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const situacao: SituacaoVinculo = t(v.SITCNA).toUpperCase() === "A" ? "ATIVO" : "INATIVO";
    const ue = usuarioEmpresa.get(`${codEmp}|${codUsu}`);
    const s = sgu.get(codUsu);
    const login = ue?.login || loginDe(codUsu);
    const usuarioSenior: SituacaoUsuarioSenior = s?.bloqueado ? "BLOQUEADO" : !ue ? "SEM_CADASTRO" : ue.situacao === "A" ? "ATIVO" : "INATIVO";
    linhas.push({
      chave,
      ...baseCc(codEmp, codCcu, nivel),
      codUsu,
      nome: s?.nome || login || null,
      login: login || null,
      email: ue?.email || usuarioGeral.get(codUsu)?.email || null,
      setor: s?.setor || null,
      situacao,
      nivelDoUsuario: nivelUsuario.get(`${codEmp}|${nivel}|${codUsu}`) ?? "SEM_CADASTRO",
      usuarioSenior,
      folha: extras.ativoNaFolha && login ? (extras.ativoNaFolha(login) ? "ATIVO" : "NAO_ENCONTRADO") : null,
      pessoaNoSistema: extras.pessoaNoSistema?.get(codUsu) ?? null,
      incluidoEm: dataHoraSenior(v.DATGER, v.HORGER),
      incluidoPor: quem(v.USUGER),
      alteradoEm: dataHoraSenior(v.DATATU, v.HORATU),
      alteradoPor: quem(v.USUATU),
    });
    if (situacao === "ATIVO") {
      const k = `${codEmp}|${codCcu}`;
      const cc = ccsComAtivo.get(k) ?? { codEmp, codCcu, niveisAtivos: new Set<number>() };
      cc.niveisAtivos.add(nivel);
      ccsComAtivo.set(k, cc);
    }
  }

  // CC com alcada ativa e nivel (ativo na empresa) sem ninguem ativo: linha "Sem aprovador ativo"
  for (const cc of ccsComAtivo.values()) {
    const niveisDaEmpresa = [...nivelInfo.entries()]
      .filter(([k, n]) => k.startsWith(`${cc.codEmp}|`) && n.ativo)
      .map(([k]) => Number(k.split("|")[1]));
    const niveis = niveisDaEmpresa.length ? niveisDaEmpresa : [1, 2, 3];
    for (const nivel of niveis) {
      if (cc.niveisAtivos.has(nivel)) continue;
      linhas.push({
        chave: `${cc.codEmp}|${cc.codCcu}|${nivel}|-`,
        ...baseCc(cc.codEmp, cc.codCcu, nivel),
        codUsu: null, nome: null, login: null, email: null, setor: null,
        situacao: "VAZIO", nivelDoUsuario: null, usuarioSenior: null, folha: null, pessoaNoSistema: null,
        incluidoEm: null, incluidoPor: null, alteradoEm: null, alteradoPor: null,
      });
    }
  }

  const ordemSit: Record<SituacaoVinculo, number> = { ATIVO: 0, VAZIO: 1, INATIVO: 2 };
  const numCc = (c: string) => (/^\d+$/.test(c) ? Number(c) : Number.MAX_SAFE_INTEGER);
  return linhas.sort(
    (a, b) =>
      Number(a.codEmp) - Number(b.codEmp) ||
      numCc(a.codCcu) - numCc(b.codCcu) ||
      a.codCcu.localeCompare(b.codCcu) ||
      a.nivel - b.nivel ||
      ordemSit[a.situacao] - ordemSit[b.situacao] ||
      (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
  );
}
