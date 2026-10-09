import type { ContaDebito, ItemRemessa } from "../../src/lib/cnab240/itau/tipos";
import { parseCodigoBarras } from "../../src/lib/cnab240/itau/codigoBarras";

// Somente dados artificiais; nunca transmitir estes arquivos ao banco.
export const contaTeste: ContaDebito = { cnpj: "11222333000181", agencia: "9999", conta: "99999", dac: "1", nomeEmpresa: "HOMOLOGACAO - NAO PAGAR" };
export const dataTeste = new Date("2026-10-08T00:00:00Z");
export function boletoTeste(valor = 100) {
  const base = `34190${"0000"}${String(Math.round(valor * 100)).padStart(10, "0")}${"1".repeat(25)}`;
  for (let dv = 1; dv <= 9; dv++) {
    const codigo = base.slice(0, 4) + dv + base.slice(5);
    try { parseCodigoBarras(codigo); return codigo; } catch { /* DV artificial valido */ }
  }
  throw new Error("Nao foi possivel montar boleto artificial.");
}
export function itemTeste(formaPagamento: ItemRemessa["formaPagamento"] = "01", referencia = "TESTE-0001"): ItemRemessa {
  return {
    referenciaEmpresa: referencia, numeroSequencial: 1, formaPagamento,
    favorecidoNome: "FORNECEDOR TESTE - NAO PAGAR", favorecidoTipoDocumento: formaPagamento === "43" ? "2" : "1", favorecidoDocumento: formaPagamento === "43" ? "11222333000181" : "52998224725",
    valor: 100, dataPagamento: dataTeste,
    ...(["30", "31"].includes(formaPagamento) ? { codigoBarras: boletoTeste() } : formaPagamento === "45" ? {
      chavePixTipo: "02", chavePixValor: "homologacao@example.invalid",
    } : { bancoFavorecido: formaPagamento === "01" ? "341" : "237", agenciaFavorecido: "9999", contaFavorecido: "99999", dacFavorecido: "1" }),
  };
}
export function mudarCampo(conteudo: string, linha: number, inicio: number, fim: number, valor: string): string {
  const linhas = conteudo.replace(/[\r\n]+$/, "").split(/\r\n|\n/);
  linhas[linha] = linhas[linha].slice(0, inicio - 1) + valor.padEnd(fim - inicio + 1, " ") + linhas[linha].slice(fim);
  return linhas.join("\r\n") + "\r\n";
}
