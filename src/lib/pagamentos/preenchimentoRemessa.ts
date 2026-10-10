export type BlocoPagamento = {
  formaPagamento: string; segmento: "A" | "J"; bancoFavorecido: string;
  agenciaFavorecido: string; contaFavorecido: string; dacFavorecido: string;
  codigoBarras: string; chavePixTipo?: "01" | "02" | "03" | "04"; chavePixValor?: string;
};
export function snapshotPagamento(i: BlocoPagamento) {
  return JSON.stringify([i.formaPagamento,i.segmento,i.bancoFavorecido,i.agenciaFavorecido,i.contaFavorecido,i.dacFavorecido,i.codigoBarras,i.chavePixTipo??"",i.chavePixValor??""]);
}
export function podeAtualizarPagamento(i: BlocoPagamento & {preenchidoAutomaticamente:boolean;snapshotAuto?:string}) {
  return (!i.codigoBarras.trim() && !i.agenciaFavorecido.trim() && !i.contaFavorecido.trim() && !i.dacFavorecido.trim() && !i.chavePixValor?.trim()) ||
    (i.preenchidoAutomaticamente && !!i.snapshotAuto && snapshotPagamento(i) === i.snapshotAuto);
}
export type FontePreenchimento = {
  codFpg: string | null; formaPagamento: string | null; codigoBarras: string | null;
  conta: {banco:string;agencia:string;conta:string;dac:string;fonte:string} | null;
  chavePix: {tipo:"01"|"02"|"03"|"04";valor:string;fonte:string} | null;
};
export function montarBlocoSenior(d: FontePreenchimento): BlocoPagamento | null {
  const descricao=(d.formaPagamento??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const boleto=/boleto/.test(descricao)||d.codFpg==="18";
  const pix=/pix/.test(descricao)||d.codFpg==="19";
  const vazio:BlocoPagamento={formaPagamento:"01",segmento:"A",bancoFavorecido:"",agenciaFavorecido:"",contaFavorecido:"",dacFavorecido:"",codigoBarras:"",chavePixTipo:undefined,chavePixValor:undefined};
  if (boleto || (!d.codFpg && d.codigoBarras)) return {...vazio,segmento:"J",formaPagamento:"31",codigoBarras:d.codigoBarras??""};
  // Chave especifica do titulo precede uma conta generica do cadastro.
  if (pix && d.chavePix?.fonte === "titulo" && d.conta?.fonte !== "titulo") return {...vazio,formaPagamento:"45",chavePixTipo:d.chavePix.tipo,chavePixValor:d.chavePix.valor};
  if (d.conta) return {...vazio,formaPagamento:pix ? "45" : ["341","409"].includes(d.conta.banco)?"01":"41",bancoFavorecido:d.conta.banco,agenciaFavorecido:d.conta.agencia,contaFavorecido:d.conta.conta,dacFavorecido:d.conta.dac,chavePixTipo:pix?d.chavePix?.tipo:undefined,chavePixValor:pix?d.chavePix?.valor:undefined};
  if ((pix || !d.codFpg) && d.chavePix) return {...vazio,formaPagamento:"45",chavePixTipo:d.chavePix.tipo,chavePixValor:d.chavePix.valor};
  return pix ? {...vazio,formaPagamento:"45"} : null;
}
