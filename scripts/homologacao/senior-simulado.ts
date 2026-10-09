import { createServer } from "node:http";
import { contaTeste } from "./fixtures";

export function criarSeniorSimulado(porta = 3099) {
  let modo = "OK";
  let envios = 0;
  const consultas: string[] = [];
  const pagos = new Map<string, string>();
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const server = createServer(async (req, res) => {
    let corpo = "";
    for await (const p of req) corpo += p;
    if (req.url === "/_controle") {
      if (req.method === "POST") modo = JSON.parse(corpo).modo;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ modo, envios, pagos: [...pagos.keys()], consultas })); return;
    }
    res.setHeader("Content-Type", "text/xml; charset=UTF-8");
    if (req.url === "/leitura") {
      const sql = (/<pmSQL>([\s\S]*?)<\/pmSQL>/.exec(corpo)?.[1] ?? "").replace(/&apos;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<");
      consultas.push(sql); if (consultas.length > 100) consultas.shift();
      if (!/^SELECT\s/i.test(sql)) { res.statusCode = 400; res.end("Somente SELECT permitido no simulador."); return; }
      let linhas: Record<string, string>[] = [];
      if (/E600CCO/i.test(sql)) linhas = [{ NUMCCO: "TESTE", DESCCO: "CONTA FICTICIA", CODBAN: "341", CODAGE: contaTeste.agencia, NUMCTA: contaTeste.conta + contaTeste.dac, SITCCO: "A" }];
      if (/E501TCP/i.test(sql)) {
        const titulo = /NUMTIT\s*=\s*'([^']+)'/i.exec(sql)?.[1];
        const lista = /NUMTIT\s+IN\s*\(([^)]+)\)/i.exec(sql)?.[1];
        const titulos = titulo ? [titulo] : lista ? [...lista.matchAll(/'([^']+)'/g)].map(m=>m[1]) : [];
        linhas = titulos.filter(t => !/SITTIT = 'AB'/.test(sql) || !pagos.has(t)).map(t => ({ NUMTIT: t, CODTPT: "DUP", CODFOR: "999999", CODFIL: "1", CODEMP: "1", DATEMI: "08/10/2026", SITTIT: pagos.has(t) ? "LQ" : "AB", VLRORI: "100,00", VLRABE: pagos.has(t) ? "0,00" : "100,00", ULTPGT: pagos.get(t) ?? "", CODFPG: modo === "CONFERENCIA_SEM_FORMA" ? "0" : "3", CODBAN:"0", CODAGE:"0", CCBFOR:"0" }));
        if (modo === "CONFERENCIA_OUTRO_TIPO" && linhas.length) linhas.push({ ...linhas[0], CODTPT: "OUT", CODFPG: "19" });
      }
      if (/E095FOR/i.test(sql)) linhas = [{CODFOR:"999999", NOMFOR:"FORNECEDOR FICTICIO", CGCCPF:"52998224725", TIPFOR:"F"}];
      if (/E095HFO/i.test(sql)) linhas = [{CODFOR:"999999", CODEMP:"1", CODFIL:"1", CODBAN:"341", CODAGE:"9999", CCBFOR:"99999-1", TIPTCC:"1", DOCIDEFAV:"52998224725"}];
      if (/E420OCP/i.test(sql)) {
        const lista = /NUMOCP\s+IN\s*\(([^)]+)\)/i.exec(sql)?.[1];
        linhas = (lista?.split(",") ?? []).map(n => ({CODEMP:"1", CODFIL:"1", NUMOCP:n.trim(),CODFPG:"19",USU_CHVPIX:"",USU_CODAGE:"",USU_NUMCCO:"",USU_DESCCO:"",USU_CGCCPF:""}));
      }
      if (/E066FPG/i.test(sql)) linhas = [{ CODEMP: "1", CODFPG: "3", DESFPG: "Deposito em Conta" }, { CODEMP: "1", CODFPG: "18", DESFPG: "Boleto" }, { CODEMP: "1", CODFPG: "19", DESFPG: "PIX" }, { CODEMP:"1",CODFPG:"20",DESFPG:"Cartao de Credito" }];
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
