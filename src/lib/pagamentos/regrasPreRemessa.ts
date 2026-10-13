// Regras do relatório de falhas ANTES da remessa que o Itaú rejeitaria (ou que
// pagariam errado) e que a conferência ainda não pegava. Funções PURAS (sem
// banco nem relógio) para dar pra testar; quem chama injeta data/hora.
//
// Origem de cada regra (manual SISPAG CNAB240 v086, Nota 8 -- ocorrências):
//  - valor do item x valor do boleto: IB/CF "valor do documento inválido",
//    IE/IF "valor da mora/multa inválido", ID "valor do desconto inválido";
//  - boleto vencido: II "data de vencimento inválida" e as de mora/multa acima;
//  - dia sem expediente: AE "data de pagamento alterada" (o banco move pro
//    próximo dia útil e avisa no retorno);
//  - TED: "MESMO DIA ATÉ 15:00 HS" (quadro de prazos mínimos do manual).
// Caso real que motivou (13/10/2026): boleto de R$ 626,09 em título de R$ 437,55;
// boleto R$ 6.098,06 em título de R$ 6.098,11; boleto R$ 1.150,00 em título de R$ 805,00.

export type AvaliacaoRegra = { campo: "valor" | "dataPagamento" | "titulo"; mensagem: string; gravidade: "erro" | "aviso" };

const DIA_MS = 86_400_000;
const TED_OUTRO_TITULAR = "41";
const TED_MESMO_TITULAR = "43";
const HORA_LIMITE_TED = 15;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function paraUtc(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}
function paraIso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function somarDias(iso: string, dias: number) {
  return paraIso(new Date(paraUtc(iso).getTime() + dias * DIA_MS));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) -- base dos feriados móveis. */
function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Feriados em que os bancos não têm expediente: nacionais fixos + Carnaval (seg/ter), Sexta-feira Santa e Corpus Christi. */
export function feriadosBancarios(ano: number): Map<string, string> {
  const fixos: [string, string][] = [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalho"],
    ["09-07", "Independência"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Consciência Negra"],
    ["12-25", "Natal"],
  ];
  const mapa = new Map<string, string>(fixos.map(([md, nome]) => [`${ano}-${md}`, nome]));
  const p = pascoa(ano);
  mapa.set(somarDias(p, -48), "Carnaval");
  mapa.set(somarDias(p, -47), "Carnaval");
  mapa.set(somarDias(p, -2), "Sexta-feira Santa");
  mapa.set(somarDias(p, 60), "Corpus Christi");
  return mapa;
}

/** Motivo de o dia não ser útil bancário ("sábado", "domingo", nome do feriado) ou null se for dia útil. */
export function motivoDiaNaoUtil(iso: string): string | null {
  const dow = paraUtc(iso).getUTCDay();
  if (dow === 6) return "sábado";
  if (dow === 0) return "domingo";
  return feriadosBancarios(Number(iso.slice(0, 4))).get(iso) ?? null;
}

export function ehDiaUtil(iso: string) {
  return motivoDiaNaoUtil(iso) === null;
}

/** O próprio dia, se útil; senão o primeiro dia útil seguinte. */
export function proximoDiaUtil(iso: string) {
  let d = iso;
  for (let i = 0; i < 15 && !ehDiaUtil(d); i++) d = somarDias(d, 1);
  return d;
}

/** Data (yyyy-mm-dd) e hora (0-23.99) em Brasília para um instante. */
export function instanteBrasilia(agora: Date = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) + Number(p.minute) / 60 };
}

/** Data do pagamento: dia sem expediente (o banco move e avisa) e TED do mesmo dia depois das 15h. */
export function avaliarDataPagamento(opcoes: { forma?: string; dataPagamento?: string; hoje: string; hora: number }): AvaliacaoRegra[] {
  const { forma, dataPagamento, hoje, hora } = opcoes;
  if (!dataPagamento || !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) return []; // data inválida: quem barra é validarItemRemessa
  const saida: AvaliacaoRegra[] = [];
  const motivo = motivoDiaNaoUtil(dataPagamento);
  if (motivo && dataPagamento >= hoje) {
    saida.push({
      campo: "dataPagamento",
      gravidade: "aviso",
      mensagem: `${dataBr(dataPagamento)} é ${motivo} (sem expediente bancário): o Itaú só processa no próximo dia útil (${dataBr(proximoDiaUtil(dataPagamento))}) e devolve a ocorrência "data de pagamento alterada". Se o pagamento precisa sair antes, escolha o dia útil anterior.`,
    });
  }
  if ((forma === TED_OUTRO_TITULAR || forma === TED_MESMO_TITULAR) && dataPagamento === hoje && hora >= HORA_LIMITE_TED) {
    saida.push({
      campo: "dataPagamento",
      gravidade: "erro",
      mensagem: `TED no mesmo dia só é aceita pelo Itaú até as ${HORA_LIMITE_TED}:00 e já passou desse horário. Mude a data para o próximo dia útil (${dataBr(proximoDiaUtil(somarDias(hoje, 1)))}).`,
    });
  }
  return saida;
}

/**
 * Valor do item x valor do boleto (nominal embutido no código de barras).
 *  - boleto ainda no prazo e valor diferente  -> ERRO (o banco só aceita o valor exato; ocorrência de valor/mora/desconto inválido);
 *  - boleto vencido                           -> AVISO (o banco recalcula juros/multa; só dá pra conferir com a 2ª via).
 * Vencimento em dia sem expediente vale até o próximo dia útil (regra geral de cobrança).
 */
export function avaliarValorDoBoleto(opcoes: { valor: number; nominal: number; vencimentoIso: string | null; dataPagamento: string }): AvaliacaoRegra | null {
  const { valor, nominal, vencimentoIso, dataPagamento } = opcoes;
  if (!(nominal > 0) || !isFinite(valor)) return null; // boleto de valor aberto: qualquer valor
  const dif = Math.round((valor - nominal) * 100) / 100;
  const igual = Math.abs(dif) <= 0.01;
  const efetivaDoPagamento = proximoDiaUtil(dataPagamento);
  const limiteSemEncargo = vencimentoIso ? proximoDiaUtil(vencimentoIso) : null;
  const vencido = !!limiteSemEncargo && efetivaDoPagamento > limiteSemEncargo;

  if (igual) {
    if (!vencido) return null;
    return {
      campo: "valor",
      gravidade: "aviso",
      mensagem: `Boleto VENCIDO em ${dataBr(vencimentoIso!)}: o banco cobra juros/multa sobre ${brl(nominal)} e pode recusar ou pagar a menor se o valor enviado não for o atualizado. Peça a 2ª via com o valor de hoje e informe esse valor.`,
    };
  }
  if (!vencido) {
    return {
      campo: "valor",
      gravidade: "erro",
      mensagem: `Valor do item (${brl(valor)}) diferente do valor do boleto (${brl(nominal)}), ${dif > 0 ? "sobram" : "faltam"} ${brl(Math.abs(dif))}${vencimentoIso ? `, e o boleto vence em ${dataBr(vencimentoIso)} (ainda no prazo)` : ""}. Antes do vencimento o banco só aceita o valor exato do boleto (volta como valor/mora/desconto inválido). Ajuste o valor para ${brl(nominal)}; se o título na Senior está errado ou o boleto é de outro título, corrija antes de gerar.`,
    };
  }
  return {
    campo: "valor",
    gravidade: "aviso",
    mensagem: `Boleto VENCIDO em ${dataBr(vencimentoIso!)} e o valor do item (${brl(valor)}) difere do original do boleto (${brl(nominal)}). Confira se o valor inclui juros/multa conforme a 2ª via; se não bater com o cálculo do banco, ele recusa.`,
  };
}

export type TituloParaDuplicidade = {
  id: string;
  numTit: string;
  codFor: string;
  valorOriginal: number;
  dataEmissao: Date;
  pago?: boolean;
  situacao?: string;
  dataPagamento?: Date | null;
  vencimentoProgramado?: Date | null;
};

/** "485$01", "485=1", "485_02" -> "485" (parcelas da mesma NF/lançamento não são duplicidade). */
function baseDoNumero(numTit: string) {
  const t = numTit.toUpperCase().replace(/\s+/g, "");
  const m = t.match(/^(.+?)[$=_]0*\d+$/);
  return m ? m[1] : t;
}

/**
 * Mesmo fornecedor + mesmo valor + emissão a até 3 dias + número base diferente.
 * Pagamento recorrente (aluguel, mensalidade) tem emissão a ~30 dias e fica de fora;
 * caso real: 14914$01 (R$ 83, 19/08) repetia o 47822$01 (R$ 83, 19/08), já pago em 02/09.
 */
export function acharPossivelDuplicidade(titulo: TituloParaDuplicidade, candidatos: TituloParaDuplicidade[]): TituloParaDuplicidade[] {
  const base = baseDoNumero(titulo.numTit);
  return candidatos.filter(
    (c) =>
      c.id !== titulo.id &&
      c.codFor === titulo.codFor &&
      Math.abs(c.valorOriginal - titulo.valorOriginal) <= 0.01 &&
      Math.abs(c.dataEmissao.getTime() - titulo.dataEmissao.getTime()) <= 3 * DIA_MS &&
      baseDoNumero(c.numTit) !== base
  );
}

export function descreverDuplicidade(c: TituloParaDuplicidade): string {
  const dia = (d: Date) => paraIso(d).split("-").reverse().join("/");
  const estado = c.pago ? `já pago${c.dataPagamento ? ` em ${dia(c.dataPagamento)}` : ""}` : c.situacao && c.situacao !== "AB" ? `situação ${c.situacao}` : "em aberto";
  return `${c.numTit} (${brl(c.valorOriginal)}, emitido em ${dia(c.dataEmissao)}, ${estado})`;
}
