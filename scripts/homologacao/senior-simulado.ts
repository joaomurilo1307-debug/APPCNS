import { createServer } from "node:http";
import { contaTeste } from "./fixtures";

export function criarSeniorSimulado(porta = 3099) {
  let modo = "OK";
  let envios = 0;
  const pagos = new Map<string, string>();
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const server = createServer(async (req, res) => {
    let corpo = "";
    for await (const p of req) corpo += p;
    if (req.url === "/_controle") {
      if (req.method === "POST") modo = JSON.parse(corpo).modo;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ modo, envios, pagos: [...pagos.keys()] })); return;
    }
    res.setHeader("Content-Type", "text/xml; charset=UTF-8");
    if (req.url === "/leitura") {
      const sql = (/<pmSQL>([\s\S]*?)<\/pmSQL>/.exec(corpo)?.[1] ?? "").replace(/&apos;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<");
      if (!/^SELECT\s/i.test(sql)) { res.statusCode = 400; res.end("Somente SELECT permitido no simulador."); return; }
      let linhas: Record<string, string>[] = [];
      if (/E600CCO/i.test(sql)) linhas = [{ NUMCCO: "TESTE", DESCCO: "CONTA FICTICIA", CODBAN: "341", CODAGE: contaTeste.agencia, NUMCTA: contaTeste.conta + contaTeste.dac, SITCCO: "A" }];
      if (/E501TCP/i.test(sql)) {
        const titulo = /NUMTIT\s*=\s*'([^']+)'/i.exec(sql)?.[1];
        if (titulo) linhas = [{ NUMTIT: titulo, CODTPT: "DUP", CODFOR: "999999", CODFIL: "1", CODEMP: "1", SITTIT: pagos.has(titulo) ? "LQ" : "AB", VLRABE: pagos.has(titulo) ? "0,00" : "100,00", ULTPGT: pagos.get(titulo) ?? "" }];
      }
      if (/E066FPG/i.test(sql)) linhas = [{ CODEMP: "1", CODFPG: "3", DESFPG: "Deposito em Conta" }, { CODEMP: "1", CODFPG: "18", DESFPG: "Boleto" }, { CODEMP: "1", CODFPG: "19", DESFPG: "PIX" }];
      const retorno = `<lines>${linhas.map(l => `<line>${Object.entries(l).map(([k, v]) => `<${k}>${xml(v)}</${k}>`).join("")}</line>`).join("")}</lines>`;
      res.end(`<GetDBInfoResponse><pmReturnGetDBInfo>${Buffer.from(retorno).toString("base64")}</pmReturnGetDBInfo></GetDBInfoResponse>`); return;
    }
    if (req.url === "/baixa") {
      envios++;
      if (modo === "SEM_RESPOSTA") { req.socket.destroy(); return; }
      const itens = [...corpo.matchAll(/<gridTitulosBaixar>([\s\S]*?)<\/gridTitulosBaixar>/g)];
      const grid = itens.map(([_, bloco], indice) => {
        const numInt = /<numInt>(.*?)<\/numInt>/.exec(bloco)?.[1] ?? "";
        const numTit = /<numTit>(.*?)<\/numTit>/.exec(bloco)?.[1] ?? "";
        const erroItem = modo === "ERRO_ITEM" || (modo === "ERRO_ITEM_PARCIAL" && indice === 0);
        if (["OK", "SEM_RESPOSTA_APOS_BAIXA", "ERRO_ITEM_PARCIAL"].includes(modo) && !erroItem) pagos.set(numTit, /<datBai>(.*?)<\/datBai>/.exec(corpo)?.[1] ?? "");
        return `<gridRetorno><numInt>${numInt}</numInt><numTit>${numTit}</numTit><msgErr>${erroItem ? "Permissao de baixa negada (SIMULACAO)" : ""}</msgErr></gridRetorno>`;
      }).join("");
      if (modo === "SEM_RESPOSTA_APOS_BAIXA") { req.socket.destroy(); return; }
      if (["HTTP_500", "HTTP_500_ERRO"].includes(modo)) res.statusCode = 500;
      res.end(`<GerarBaixaPorLoteCPResponse><result>${grid}<resultado>${modo === "HTTP_500_ERRO" ? "ERRO" : "OK"}</resultado><erroExecucao/></result></GerarBaixaPorLoteCPResponse>`); return;
    }
    res.statusCode = 404; res.end("Endpoint simulado inexistente.");
  });
  return { server, iniciar: () => new Promise<void>(resolve => server.listen(porta, "127.0.0.1", resolve)), fechar: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
if (process.argv.includes("--servidor")) {
  criarSeniorSimulado().iniciar().then(() => console.log("Senior FICTICIA disponivel em 127.0.0.1:3099. Nenhuma operacao e enviada ao ERP real."));
}
