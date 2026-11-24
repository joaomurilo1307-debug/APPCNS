// Conferencia de OC: a OC ja' virou titulo na Senior? (23/11/2026)
//
// Antes a tela so' olhava o numero que o comprador digita na OC (USU_NUMTIT), e so' entre os titulos do mesmo codigo de fornecedor.
// Em 23/11/2026 ficavam na tela OCs que ja' tinham titulo:
//   - OC 16710 e 16712: a NF de compra (E440ISC.NUMOCP) gerou os titulos 525A1 e 527A1, sem nada digitado na OC;
//   - OC 16778: digitado 4270A1, que existe -- mas lancado no fornecedor 711673, do mesmo grupo (E095FOR.CODGRE) do 711334 da OC,
//     e o titulo ainda traz USU_NUMOCP = 16778. A tela dizia "nao existe no Senior".
// Agora a OC so' fica na tela enquanto nenhum titulo da Senior (nao cancelado) estiver ligado a ela por um destes caminhos:
//   1. GERADO_AQUI: gerado pelo botao "Gerar titulo" desta tela (TituloGeradoOC, conferido na Senior);
//   2. CAMPO_DO_TITULO: E501TCP.USU_NUMOCP do titulo = a OC (fornecedor igual ou do mesmo grupo);
//   3. NF: a NF de compra tem a OC nos itens (E440IPC/E440ISC.NUMOCP) e o titulo e' dessa NF (mesma filial, fornecedor e NUMNFC);
//   4. DIGITADO: o numero digitado na OC existe entre os titulos do fornecedor OU de outro fornecedor do mesmo grupo;
//   5. MANUAL: vinculo confirmado por uma pessoa (TituloOcVinculo -- o mesmo da Programacao de Pagamento).
// Os caminhos 2, 3 e 5 sao os mesmos que a Programacao de Pagamento usa para ligar o titulo a OC (criarMotorVinculo +
// aplicarCorrecaoManual): a OC sai daqui quando o titulo dela aparece la.
//
// Titulo PROVAVEL (nao tira a OC da tela; regra de 30/10/2026: nada de vinculo automatico por fornecedor+valor+data): titulo
// aberto do mesmo fornecedor/grupo, nao ligado a outra OC, com o mesmo vencimento e valor entre 80% e 100% da OC (retencoes),
// ou com o numero da NF digitado na OC (USU_NUMNFC). So' quando ha exatamente UM candidato e ele nao e' candidato de outra OC.
// A tela mostra o provavel para a pessoa confirmar o vinculo (e nao gerar um titulo duplicado).

import { normalizarReferencia } from "../vinculoOcTitulo";
import { tituloDigitadoExiste } from "./tituloDigitado";

export type TituloSenior = {
  codFil: string;
  codFor: string;
  numTit: string;
  codTpt: string;
  situacao: string; // SITTIT: AB aberto, LQ liquidado, CA cancelado...
  valor: number; // VLRORI
  aberto: number; // VLRABE
  vencimento: string | null; // VCTPRO, aaaa-mm-dd
  numNfc: string | null;
  numOcp: string | null; // USU_NUMOCP
};
export type NfDaOc = { codFil: string; codFor: string; numNfc: string; numOcp: string };
export type VinculoManual = { numTit: string; codFil: string; codFor: string; numOcp: string };
export type TituloGeradoAqui = { numOcp: string; codFil: string; codFor: string; numTit: string; codTpt: string; valor: number; vencimento: string | null };

export type OrigemTitulo = "GERADO_AQUI" | "CAMPO_DO_TITULO" | "NF" | "DIGITADO" | "MANUAL";
export type TituloDaOc = TituloSenior & { origem: OrigemTitulo };
export type OcParaTitulo = {
  numOcp: string;
  codFil: string;
  codFor: string;
  numTitSenior: string | null;
  numNfc: string | null;
  vencimento: string | null;
  valor: number;
};
export type ApuracaoTitulos = {
  titulos: TituloDaOc[]; // vazio = a OC ainda nao tem titulo
  provavel: TituloSenior | null;
  digitadoInexistente: boolean; // tem numero digitado na OC e nenhum titulo da Senior com esse numero
};

export const ORIGEM_TITULO: Record<OrigemTitulo, string> = {
  GERADO_AQUI: "gerado nesta tela",
  CAMPO_DO_TITULO: "o título informa esta OC (USU_NUMOCP)",
  NF: "título da NF de compra desta OC",
  DIGITADO: "número digitado na OC",
  MANUAL: "vínculo confirmado manualmente",
};

/** Tipos que nao sao pagamento de compra (impostos, provisao): nunca sao titulo provavel de uma OC. */
const TIPOS_NAO_OC = new Set(["PRV", "IMP", "ISS", "IRF", "PIS", "COF", "CSL", "INS"]);

const codigo = (v: string | null | undefined) => normalizarReferencia(v).replace(/^0+(?=\d)/, "");
const ref = (v: string | null | undefined) => {
  const t = codigo(v);
  return t && !/^0+$/.test(t) ? t : null;
};
export const chaveOc = (o: { numOcp: string; codFil: string }) => `${codigo(o.numOcp)}|${codigo(o.codFil)}`;
const chaveTitulo = (t: { codFil: string; codFor: string; numTit: string }) => `${codigo(t.codFil)}|${codigo(t.codFor)}|${normalizarReferencia(t.numTit)}`;
const cancelado = (t: TituloSenior) => t.situacao.trim().toUpperCase() === "CA";
const emAberto = (t: TituloSenior) => !cancelado(t) && (t.situacao.trim().toUpperCase() === "AB" || t.aberto > 0);

/** PURA: titulos (e o provavel) de cada OC. Chave do mapa: chaveOc(oc). */
export function apurarTitulosDasOcs(
  ocs: OcParaTitulo[],
  dados: { titulos: TituloSenior[]; nfs: NfDaOc[]; manuais: VinculoManual[]; gerados: TituloGeradoAqui[]; grupos?: Map<string, string> }
): Map<string, ApuracaoTitulos> {
  // fornecedor igual ou do mesmo grupo de empresas = mesma "familia"
  const familia = (cod: string) => {
    const g = dados.grupos?.get(codigo(cod));
    return g ? `G:${g}` : `F:${codigo(cod)}`;
  };
  const mesmoFornecedor = (a: string, b: string) => familia(a) === familia(b);

  const vivos = dados.titulos.filter((t) => !cancelado(t));
  const porChave = new Map(vivos.map((t) => [chaveTitulo(t), t]));
  const porFamilia = new Map<string, TituloSenior[]>();
  for (const t of vivos) porFamilia.set(familia(t.codFor), [...(porFamilia.get(familia(t.codFor)) ?? []), t]);
  const porNf = new Map<string, TituloSenior[]>();
  for (const t of vivos) {
    const nf = ref(t.numNfc);
    if (!nf) continue;
    const k = `${codigo(t.codFil)}|${codigo(t.codFor)}|${nf}`;
    porNf.set(k, [...(porNf.get(k) ?? []), t]);
  }
  const porOcNoCampo = new Map<string, TituloSenior[]>();
  for (const t of vivos) {
    const oc = ref(t.numOcp);
    if (oc) porOcNoCampo.set(oc, [...(porOcNoCampo.get(oc) ?? []), t]);
  }
  const nfsPorOc = new Map<string, NfDaOc[]>();
  for (const n of dados.nfs) {
    const oc = ref(n.numOcp);
    if (oc) nfsPorOc.set(oc, [...(nfsPorOc.get(oc) ?? []), n]);
  }

  // 1) ligacoes formais
  const formais = new Map<string, TituloDaOc[]>();
  const ocupados = new Set<string>(); // titulos ja ligados a alguma OC: nao podem ser "provavel" de outra
  for (const t of vivos) if (ref(t.numOcp)) ocupados.add(chaveTitulo(t));
  for (const n of dados.nfs) for (const t of porNf.get(`${codigo(n.codFil)}|${codigo(n.codFor)}|${ref(n.numNfc)}`) ?? []) ocupados.add(chaveTitulo(t));
  for (const v of dados.manuais) ocupados.add(chaveTitulo(v));
  const digitadoInexistente = new Set<string>();

  for (const oc of ocs) {
    const lista: TituloDaOc[] = [];
    const vistos = new Set<string>();
    const add = (t: TituloSenior, origem: OrigemTitulo) => {
      const k = chaveTitulo(t);
      if (vistos.has(k)) return;
      vistos.add(k);
      lista.push({ ...t, origem });
    };
    const numOcp = codigo(oc.numOcp);

    for (const g of dados.gerados) {
      if (codigo(g.numOcp) !== numOcp || codigo(g.codFil) !== codigo(oc.codFil)) continue;
      const lido = porChave.get(chaveTitulo(g));
      add(lido ?? { codFil: g.codFil, codFor: g.codFor, numTit: g.numTit, codTpt: g.codTpt, situacao: "AB", valor: g.valor, aberto: g.valor, vencimento: g.vencimento, numNfc: null, numOcp: null }, "GERADO_AQUI");
    }
    for (const t of porOcNoCampo.get(numOcp) ?? []) if (mesmoFornecedor(t.codFor, oc.codFor)) add(t, "CAMPO_DO_TITULO");
    for (const n of nfsPorOc.get(numOcp) ?? []) {
      for (const t of porNf.get(`${codigo(n.codFil)}|${codigo(n.codFor)}|${ref(n.numNfc)}`) ?? []) add(t, "NF");
    }
    let digitadoAchado = false;
    if (ref(oc.numTitSenior)) {
      for (const t of porFamilia.get(familia(oc.codFor)) ?? []) {
        if (!tituloDigitadoExiste(oc.numTitSenior, [t.numTit])) continue;
        digitadoAchado = true;
        add(t, "DIGITADO");
      }
    }
    if (ref(oc.numTitSenior) && !digitadoAchado) digitadoInexistente.add(chaveOc(oc));
    for (const v of dados.manuais) {
      if (codigo(v.numOcp) !== numOcp) continue;
      const t = porChave.get(chaveTitulo(v));
      if (t) add(t, "MANUAL"); // vinculo para titulo que nao existe mais (ou foi cancelado) nao conta
    }
    for (const t of lista) ocupados.add(chaveTitulo(t));
    formais.set(chaveOc(oc), lista);
  }

  // 2) provavel: so' para quem nao tem titulo, unico e sem disputa entre OCs
  const candidatos = new Map<string, TituloSenior[]>();
  const disputa = new Map<string, number>();
  for (const oc of ocs) {
    if (formais.get(chaveOc(oc))!.length) continue;
    const nfDigitada = ref(oc.numNfc);
    const lista = (porFamilia.get(familia(oc.codFor)) ?? []).filter((t) => {
      if (!emAberto(t) || TIPOS_NAO_OC.has(t.codTpt.trim().toUpperCase()) || ocupados.has(chaveTitulo(t))) return false;
      const pelaNf = !!nfDigitada && ref(t.numNfc) === nfDigitada;
      const pelaData = !!oc.vencimento && t.vencimento === oc.vencimento && oc.valor > 0 && t.valor <= oc.valor + 0.01 && t.valor >= oc.valor * 0.8;
      return pelaNf || pelaData;
    });
    candidatos.set(chaveOc(oc), lista);
    for (const t of lista) disputa.set(chaveTitulo(t), (disputa.get(chaveTitulo(t)) ?? 0) + 1);
  }

  const saida = new Map<string, ApuracaoTitulos>();
  for (const oc of ocs) {
    const k = chaveOc(oc);
    const titulos = formais.get(k)!;
    const c = candidatos.get(k) ?? [];
    const provavel = c.length === 1 && disputa.get(chaveTitulo(c[0])) === 1 ? c[0] : null;
    saida.set(k, { titulos, provavel, digitadoInexistente: digitadoInexistente.has(k) });
  }
  return saida;
}
