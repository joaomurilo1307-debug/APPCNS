// Motor único de correspondência Dossiê(OC) <-> Título, reaproveitado por
// /api/titulos-pagar (coluna "Dossiê" da Programação de Pagamento) e por
// /api/titulos-pagar/exportar-pacote (zip com os PDFs dos selecionados).
//
// Achado 01/10/2026 ("alguns dossiês aparecem, outros não"): a correspondência
// original comparava o numTit do título contra DossieOC.titulos com só um
// .trim() -- sem a normalização/variantes de parcela que o PRÓPRIO motor de
// vínculo OC<->título (vinculoOcTitulo.ts) já precisou construir pra resolver
// o mesmo tipo de dado sujo (ex.: comprador registra "2072$" na OC, o título
// real é "2072$01" -- confirmado ao vivo nos dados reais, Fort Minas CODFOR
// 113). DossieOC.titulos vem do n8n lendo esse mesmo campo de texto livre da
// OC -- é exatamente a fonte que motivou aquele motor existir.
//
// Fix: reaproveita as MESMAS 4 camadas de match do motor de vínculo, só que
// Dossiê<->Título em vez de OC<->Título:
//   1) numOcp da OC já confirmada pelo motor de vínculo -- identificador
//      nativo da Senior, não texto digitado por humano.
//   2) referência exata (com variantes de normalização).
//   3) título tem sufixo de parcela ($NN/_NN) -- busca pela base no índice
//      do dossiê (cobre "dossiê truncado ($ sem número), título completo").
//   4) dossiê tem sufixo de parcela -- busca pela base a partir da
//      referência direta do título (simétrico ao caso 3).

import { chavesFornecedor, normalizarReferencia, prefixoParcela, variantesReferencia } from "./vinculoOcTitulo";

export type DossieParaIndice = {
  id: string;
  numOcp: string | null;
  codFor: string | null;
  titulos: string[];
  status: string;
  motivo: string | null;
  arquivoPath: string | null;
  geradoEm: Date;
};

export function criarIndiceDossies(dossies: DossieParaIndice[]) {
  const porNumOcp = new Map<string, DossieParaIndice>();
  const porReferencia = new Map<string, DossieParaIndice>();
  const porReferenciaFornecedor = new Map<string, DossieParaIndice>();
  const porBase = new Map<string, DossieParaIndice>();
  const porBaseFornecedor = new Map<string, DossieParaIndice>();

  function set(mapa: Map<string, DossieParaIndice>, chave: string, d: DossieParaIndice) {
    if (!mapa.has(chave)) mapa.set(chave, d); // dossies já vem geradoEm desc -> 1º a ocupar é o mais recente
  }

  for (const d of dossies) {
    if (d.numOcp) {
      const chave = normalizarReferencia(d.numOcp);
      if (chave) set(porNumOcp, chave, d);
    }
    const fornecedores = chavesFornecedor(d.codFor);
    for (const bruto of d.titulos) {
      for (const ref of variantesReferencia(bruto)) {
        set(porReferencia, ref, d);
        for (const fornecedor of fornecedores) set(porReferenciaFornecedor, `${fornecedor}|${ref}`, d);

        const prefixo = prefixoParcela(ref);
        if (!prefixo) continue;
        for (const base of variantesReferencia(prefixo)) {
          set(porBase, base, d);
          for (const fornecedor of fornecedores) set(porBaseFornecedor, `${fornecedor}|${base}`, d);
        }
      }
    }
  }

  function dossieDoTitulo(titulo: { numTit: string; codFor: string | null; numOcp?: string | null }) {
    if (titulo.numOcp) {
      const achado = porNumOcp.get(normalizarReferencia(titulo.numOcp));
      if (achado) return achado;
    }

    const fornecedores = chavesFornecedor(titulo.codFor);
    const referencias = variantesReferencia(titulo.numTit);

    for (const ref of referencias) {
      for (const fornecedor of fornecedores) {
        const achado = porReferenciaFornecedor.get(`${fornecedor}|${ref}`);
        if (achado) return achado;
      }
    }
    for (const ref of referencias) {
      const achado = porReferencia.get(ref);
      if (achado) return achado;
    }

    // Título tem parcela ($NN/_NN) -- a OC/dossiê pode ter registrado só a base.
    const prefixo = prefixoParcela(titulo.numTit);
    if (prefixo) {
      const bases = variantesReferencia(prefixo);
      for (const base of bases) {
        for (const fornecedor of fornecedores) {
          const achado = porReferenciaFornecedor.get(`${fornecedor}|${base}`);
          if (achado) return achado;
        }
      }
      for (const base of bases) {
        const achado = porReferencia.get(base);
        if (achado) return achado;
      }
    }

    // Simétrico: o dossiê tem parcela e o título é só a base.
    for (const ref of referencias) {
      for (const fornecedor of fornecedores) {
        const achado = porBaseFornecedor.get(`${fornecedor}|${ref}`);
        if (achado) return achado;
      }
    }
    for (const ref of referencias) {
      const achado = porBase.get(ref);
      if (achado) return achado;
    }

    return null;
  }

  return { dossieDoTitulo };
}
