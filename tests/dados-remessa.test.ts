import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buscarDadosPagamento, type PedidoTitulo } from "../src/lib/senior/dadosPagamentoTitulos";
import { documentoFavorecido, escolherCadastroBancario, mapearTitulo } from "../src/lib/senior/mapeamentoTitulos";
import { consultarSenior, type LinhaSenior } from "../src/lib/senior/getDbInfo";
import { prisma } from "../src/lib/prisma";
import { montarBlocoSenior, podeAtualizarPagamento, snapshotPagamento } from "../src/lib/pagamentos/preenchimentoRemessa";
import { identificacaoBeneficiarioBoleto } from "../src/lib/pagamentos/beneficiarioBoleto";
import { validarItemRemessa, cnpjValido } from "../src/lib/cnab240/itau/validacaoItem";
import { boletoTeste, itemTeste } from "../scripts/homologacao/fixtures";

const banco=new URL(process.env.DATABASE_URL??"");
assert.ok(["localhost","127.0.0.1"].includes(banco.hostname)&&banco.pathname==="/consominas_gestao_itau_homologacao");
const fetchOriginal=globalThis.fetch;
after(async()=>{globalThis.fetch=fetchOriginal;await prisma.$disconnect()});
const pedido:PedidoTitulo={tituloId:"a",numTit:"FICTICIO",codFil:"1",codFor:"999999",tipo:"OUT",dataEmissao:"2026-10-08",numOcp:null};
const titulo:LinhaSenior={CODEMP:"1",CODFIL:"1",CODFOR:"999999",NUMTIT:"FICTICIO",CODTPT:"OUT",DATEMI:"08/10/2026",SITTIT:"AB",VLRORI:"100,00",VLRABE:"100,00",CODFPG:"3",CODBAN:"237",CODAGE:"1234",CCBFOR:"12345678",DOCIDEFAV:"0",CODFAV:"0",CODBAR:"0",NUMOCP:"0",FILOCP:"0"};
const cadastro:LinhaSenior={CODEMP:"1",CODFIL:"1",CODFOR:"999999",CODBAN:"341",CODAGE:"9999",CCBFOR:"99999-1",DOCIDEFAV:"0",CODFAV:"0"};
async function ler(ts:LinhaSenior[],cs:LinhaSenior[]=[cadastro],os:LinhaSenior[]=[],pedidos=[pedido]){
 const consultas:string[]=[];
 globalThis.fetch=async(_url,init)=>{
  const sql=/<pmSQL>([\s\S]*?)<\/pmSQL>/.exec(String(init?.body))?.[1]??"";consultas.push(sql);
  const rows=sql.includes("E501TCP")?ts:sql.includes("E095HFO")?cs:sql.includes("E420OCP")?os:sql.includes("E095FOR")?[{CODFOR:"999999",NOMFOR:"FORNECEDOR FICTICIO",CGCCPF:"52998224725",TIPFOR:"F"}]:[];
  const xml=`<lines>${rows.map(r=>`<line>${Object.entries(r).map(([k,v])=>`<${k}>${v}</${k}>`).join("")}</line>`).join("")}</lines>`;
  return new Response(`<pmReturnGetDBInfo>${Buffer.from(xml).toString("base64")}</pmReturnGetDBInfo>`);
 };
 try{return {...await buscarDadosPagamento(pedidos),consultas}}finally{globalThis.fetch=fetchOriginal}
}
test("Conta sem hifen preserva banco agencia conta e informa somente DAC ausente",async()=>{
 const r=await ler([titulo]);const d=r.dados[0];
 assert.deepEqual(d.conta,{banco:"237",agencia:"1234",conta:"12345678",dac:"",fonte:"titulo"});
 assert.match(d.problemas!.join(" "),/sem digito verificador/);
 assert.equal(montarBlocoSenior(d)!.contaFavorecido,"12345678");assert.equal(montarBlocoSenior(d)!.dacFavorecido,"");
});
test("Remessa identifica tipo emissao e empresa, mesmo numero de outro tipo nao cruza dados",async()=>{
 const r=await ler([{...titulo,CODTPT:"ADT",CHVPIX:"outro@example.invalid",TPCPIX:"2"},{...titulo,CODBAN:"341",CCBFOR:"88888-0"},{...titulo,CODEMP:"2",CCBFOR:"77777-7"}]);
 assert.equal(r.dados[0].conta!.conta,"88888");assert.equal(r.dados[0].chavePix,null);
 assert.match(r.consultas.find(q=>q.includes("E501TCP"))!,/CODEMP = 1 AND NUMTIT IN/);
});
test("Titulo ambiguo nao utiliza primeira linha nem completa por fornecedor",async()=>{
 const r=await ler([titulo,{...titulo,CCBFOR:"11111-1"}]);
 assert.equal(r.dados[0].achouNoSenior,false);assert.equal(r.dados[0].conta,null);assert.equal(r.dados[0].documento,null);
 assert.match(r.dados[0].problemas!.join(" "),/ambigua/);
});
test("Emissao diferente nao corresponde e pedido sem tipo nao escolhe titulo",async()=>{
 assert.equal((await ler([{...titulo,DATEMI:"07/10/2026"}])).dados[0].achouNoSenior,false);
 assert.equal((await ler([titulo],[cadastro],[],[{...pedido,tipo:undefined}])).dados[0].achouNoSenior,false);
});
test("Titulo PE aberto pode trazer dados, liquidado e cancelado nao trazem destino",async()=>{
 assert.equal((await ler([{...titulo,SITTIT:"PE"}])).dados[0].achouNoSenior,true);
 for(const t of [{...titulo,SITTIT:"LQ",VLRABE:"0,00"},{...titulo,SITTIT:"CA"}])assert.equal((await ler([t])).dados[0].conta,null);
});
test("Cadastro bancario somente da filial do titulo, inclusive consulta fora da filial 1",async()=>{
 const r=await ler([{...titulo,CODFIL:"2",CODBAN:"0",CODAGE:"0",CCBFOR:"0"}],[cadastro],[],[{...pedido,codFil:"2"}]);
 assert.equal(r.dados[0].conta,null);assert.match(r.consultas.find(q=>q.includes("E095HFO"))!,/CODFIL IN \(2\)/);
 assert.equal(escolherCadastroBancario([cadastro,{...cadastro,CCBFOR:"12345-6"}],"1","1"),undefined);
});
test("OC repetida em outras filiais e fornecedores nao fornece chave PIX",async()=>{
 const p={...pedido,numOcp:"123",codFilOc:"1"};
 const os=[{CODEMP:"1",CODFIL:"2",CODFOR:"999999",NUMOCP:"123",USU_CHVPIX:"errado@example.invalid"},{CODEMP:"1",CODFIL:"1",CODFOR:"888888",NUMOCP:"123",USU_CHVPIX:"outro@example.invalid"}];
 const r=await ler([{...titulo,CODBAN:"0",CODAGE:"0",CCBFOR:"0"}],[],os,[p]);assert.equal(r.dados[0].chavePix,null);
});
test("PIX com tipo 02 e mantido no titulo, forma do titulo nao vem da OC",async()=>{
 const d=(await ler([{...titulo,CODFPG:"0",TPCPIX:"02",CHVPIX:"titulo@example.invalid"}])).dados[0];
 assert.equal(d.chavePix!.tipo,"02");assert.equal(d.codFpg,null);
});
test("CODFAV legado do titulo precede CPF do fornecedor, sem usar tipo do fornecedor",async()=>{
 const d=(await ler([{...titulo,CODFAV:"11222333000181"}])).dados[0];
 assert.equal(d.documento,"11222333000181");assert.equal(d.origemDocumento,"titulo");
 assert.equal(mapearTitulo({...titulo,CODFAV:"11222333000181"},{TIPFOR:"F",CGCCPF:"52998224725"})!.documentoFavorecido,"11222333000181");
});
test("Documento com zeros numericos e reconstruido somente se DV valido e inequivoco",()=>{
 const doc=Array.from({length:100},(_,i)=>"001234560001"+String(i).padStart(2,"0")).find(cnpjValido)!;
 assert.equal(documentoFavorecido(doc.replace(/^0+/,"")),doc);assert.equal(documentoFavorecido("12345678901234"),null);
});
test("Documento substituto do fornecedor tem origem explicita, nao vira beneficiario confirmado",async()=>{
 const d=(await ler([titulo])).dados[0];assert.equal(d.origemDocumento,"fornecedor");
 const i=itemTeste("30");
 assert.ok(validarItemRemessa({...i,favorecidoTipoDoc:"1",dataPagamento:"2026-10-09"}).some(p=>p.campo==="favorecidoDocumento"&&p.gravidade==="erro"));
});
test("Boleto da Senior e validado, codigo de 48 digitos nao vira ausencia silenciosa",async()=>{
 const d=(await ler([{...titulo,CODBAR:boletoTeste()}])).dados[0];assert.equal(d.codigoBarras,boletoTeste());
 const invalido=(await ler([{...titulo,CODBAR:"1".repeat(48)}])).dados[0];assert.equal(invalido.codigoBarras,null);assert.match(invalido.problemas!.join(" "),/invalido/);
});
test("Forma boleto sem barras nao recebe conta bancaria como transferencia",()=>{
 const base={codFpg:"18",formaPagamento:"Boleto",codigoBarras:null,conta:{banco:"341",agencia:"9999",conta:"12345",dac:"1",fonte:"cadastro"},chavePix:null};
 assert.equal(montarBlocoSenior(base)!.segmento,"J");assert.equal(montarBlocoSenior(base)!.codigoBarras,"");
 assert.equal(montarBlocoSenior({...base,codFpg:"3",formaPagamento:"Deposito",chavePix:{tipo:"02",valor:"nao-usar@example.invalid",fonte:"oc"}})!.formaPagamento,"01");
});
test("Atualizacao automatica atualiza copia intacta e preserva modificacao manual",()=>{
 const b=montarBlocoSenior({codFpg:"3",formaPagamento:null,codigoBarras:null,conta:{banco:"237",agencia:"1234",conta:"12345678",dac:"",fonte:"titulo"},chavePix:null})!;
 const i={...b,preenchidoAutomaticamente:true,snapshotAuto:snapshotPagamento(b)};
 assert.equal(podeAtualizarPagamento(i),true);assert.equal(podeAtualizarPagamento({...i,contaFavorecido:"77777"}),false);
});
test("Chave PIX especifica do titulo precede conta generica do fornecedor",()=>{
 const d={codFpg:"19",formaPagamento:"PIX",codigoBarras:null,conta:{banco:"341",agencia:"9999",conta:"12345",dac:"1",fonte:"cadastro"},chavePix:{tipo:"02" as const,valor:"titulo@example.invalid",fonte:"titulo"}};
 const b=montarBlocoSenior(d)!;assert.equal(b.formaPagamento,"45");assert.equal(b.contaFavorecido,"");assert.equal(b.chavePixValor,"titulo@example.invalid");
});
test("Confirmacao de beneficiario nao sobrevive a troca de documento nem de boleto",()=>{
 const i=itemTeste("30");const conf=identificacaoBeneficiarioBoleto(i.favorecidoDocumento,i.codigoBarras);
 const original={...i,favorecidoTipoDoc:"1",dataPagamento:"2026-10-09",beneficiarioBoletoConferido:conf};
 assert.ok(!validarItemRemessa(original).some(p=>p.campo==="favorecidoDocumento"&&p.gravidade==="erro"));
 for(const alterado of [{...original,codigoBarras:boletoTeste(101)},{...original,favorecidoDocumento:"11222333000181"}])assert.ok(validarItemRemessa(alterado).some(p=>p.campo==="favorecidoDocumento"&&p.gravidade==="erro"));
});
test("CPF invalido bloqueia geracao, mesmo com conferencia manual do boleto",()=>{
 const i=itemTeste("30");const doc="12345678901";
 assert.ok(validarItemRemessa({...i,dataPagamento:"2026-10-09",favorecidoDocumento:doc,beneficiarioBoletoConferido:identificacaoBeneficiarioBoleto(doc,i.codigoBarras)}).some(p=>/verificador invalido|verificador inválido/.test(p.mensagem)&&p.gravidade==="erro"));
});
test("Fila do GetDBInfo nao sobrepoe consultas de requisicoes simultaneas",async()=>{
 let ativas=0,maximo=0;
 globalThis.fetch=async()=>{ativas++;maximo=Math.max(maximo,ativas);await new Promise(r=>setTimeout(r,15));ativas--;return new Response(`<pmReturnGetDBInfo>${Buffer.from("<lines/>").toString("base64")}</pmReturnGetDBInfo>`)};
 try{await Promise.all([consultarSenior("SELECT A"),consultarSenior("SELECT B"),consultarSenior("SELECT C")]);assert.equal(maximo,1)}finally{globalThis.fetch=fetchOriginal}
});
