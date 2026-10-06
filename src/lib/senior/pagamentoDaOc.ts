// Tipo de pagamento que o comprador definiu NA OC (E420OCP.CODFPG + descricao
// do catalogo F066FPG) e os dados de pagamento que ele digitou nela (chave
// PIX, agencia/conta). Pedido do Joao (06/10/2026): ao clicar na OC dentro da
// Programacao de Pagamento, aparecer tambem o tipo de pagamento -- cartao,
// pix, boleto... A forma que ja aparecia vinha so' do TITULO gerado (E501TCP),
// entao OC sem titulo ainda nao mostrava nada.
//
// Consulta a Senior ao vivo (so' leitura, 1 linha) e guarda 10 min em memoria
// pra abrir a mesma OC varias vezes sem repetir a chamada.

import { consultarSenior } from "./getDbInfo";
import { carregarCatalogoFormasPagamento, garantirFormasPagamentoAtualizadas } from "./formasPagamento";

export type PagamentoDaOc = {
  codFpg: string | null;
  formaPagamento: string | null; // descricao por extenso da Senior
  chavePix: string | null;
  agencia: string | null;
  conta: string | null;
  contaDescricao: string | null;
};

const CACHE_MS = 10 * 60 * 1000;
const LIMITE_MS = 20_000;
const cache = new Map<string, { em: number; dados: PagamentoDaOc }>();

// Campo da Senior "preenchido" = nao vazio e nao so' zeros (0 = nao informado).
function preenchido(valor: string | undefined): string | null {
  const t = (valor ?? "").trim();
  return t && !/^0+$/.test(t) ? t : null;
}

function comLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`A Senior não respondeu em ${Math.round(ms / 1000)}s.`)), ms);
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function pagamentoDaOc(numOcp: string, codFil: string | null): Promise<PagamentoDaOc> {
  // Numerico sem aspas no dialeto do GetDBInfo -- e so' digitos, pra nada de
  // texto livre entrar na consulta.
  if (!/^\d+$/.test(numOcp)) throw new Error("Número de OC inválido.");
  const filtroFilial = codFil && /^\d+$/.test(codFil) ? ` AND CODFIL = ${codFil}` : "";

  const chave = `${numOcp}|${codFil ?? ""}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.dados;

  garantirFormasPagamentoAtualizadas(); // atualiza o catalogo em segundo plano, sem esperar
  const [linhas, catalogo] = await Promise.all([
    comLimite(
      consultarSenior(
        `SELECT CODFPG, USU_CHVPIX, USU_CODAGE, USU_NUMCCO, USU_DESCCO FROM E420OCP WHERE CODEMP = 1${filtroFilial} AND NUMOCP = ${numOcp}`
      ),
      LIMITE_MS
    ),
    carregarCatalogoFormasPagamento(),
  ]);

  const l = linhas[0];
  const codFpg = preenchido(l?.CODFPG);
  const dados: PagamentoDaOc = {
    codFpg,
    formaPagamento: codFpg ? catalogo.get(codFpg) ?? null : null,
    chavePix: preenchido(l?.USU_CHVPIX),
    agencia: preenchido(l?.USU_CODAGE),
    conta: preenchido(l?.USU_NUMCCO),
    contaDescricao: preenchido(l?.USU_DESCCO),
  };
  cache.set(chave, { em: Date.now(), dados });
  return dados;
}
