// Liga cada pessoa ao NUCLEO da lotacao da planilha "LISTAGEM DE ATIVOS" (coluna E: setores ADM e contratos MRN, AGA, SVPM...), como colaboradora do
// nucleo (pedido do Joao, 25/10/2026: "os nucleos e as pessoas dos nucleos de contrato", para chamar o pessoal de qualquer lugar para a equipe de um projeto).
//
// Roda sozinho no boot (sem variavel de ambiente) e e' seguro repetir:
//   - acha o usuario pela matricula (chapa) ou, se nao achar, pelo nome (so' se unico); na duvida NAO liga ninguem (nunca chuta);
//   - so' liga quem AINDA NAO TEM nucleo: quem ja foi colocado num nucleo (pelo Joao ou por outro seed) nao e' movido;
//   - cada pessoa tem a sua marca ("seed.nucleos-pessoas.<chapa>") na auditoria: quem nao foi encontrada tenta de novo no proximo boot (cadastro novo),
//     e quem o Joao tirar do nucleo depois nao volta.
// Nao cria nucleo, nao mexe em gerentes, coordenadores, diretores, equipes nem projetos.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { acharUsuario } from "./achar-usuario";

const prisma = new PrismaClient();

type Linha = { chapa: string; nome: string; nucleo: string };

async function main() {
  const lista: Linha[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "nucleos_pessoas.json"), "utf-8"));
  const nucleos = new Map((await prisma.nucleo.findMany({ select: { id: true, name: true } })).map((n) => [n.name, n.id]));
  const usuarios = await prisma.user.findMany({ select: { id: true, name: true } });
  const feitas = new Set((await prisma.auditLog.findMany({ where: { action: { startsWith: "seed.nucleos-pessoas." } }, select: { action: true } })).map((a) => a.action));

  let ligadas = 0, jaTinham = 0, semUsuario = 0, semNucleo = 0, puladas = 0;
  const naoAchadas: string[] = [];
  for (const l of lista) {
    const marca = `seed.nucleos-pessoas.${l.chapa}`;
    if (feitas.has(marca)) { puladas++; continue; }
    const nucleoId = nucleos.get(l.nucleo);
    if (!nucleoId) { semNucleo++; continue; } // o nucleo ainda nao existe: tenta no proximo boot
    const achado = await acharUsuario(prisma, l.chapa, l.nome, usuarios);
    if (!achado) { semUsuario++; naoAchadas.push(`${l.chapa} ${l.nome}`); continue; }
    const u = await prisma.user.findUnique({ where: { id: achado.id }, select: { nucleoId: true } });
    if (u && u.nucleoId === null) {
      await prisma.user.update({ where: { id: achado.id }, data: { nucleoId } });
      ligadas++;
    } else {
      jaTinham++;
    }
    await prisma.auditLog.create({ data: { action: marca, entityType: "User", entityId: achado.id, metadata: JSON.stringify({ nucleo: l.nucleo, via: achado.via, ligada: u?.nucleoId === null }) } });
  }
  console.log(`Pessoas nos nucleos: ${ligadas} ligadas, ${jaTinham} ja tinham nucleo, ${puladas} ja tratadas antes, ${semUsuario} sem usuario no sistema, ${semNucleo} com nucleo ainda inexistente.`);
  if (naoAchadas.length) console.log(`Sem usuario (tenta de novo no proximo boot): ${naoAchadas.slice(0, 80).join("; ")}${naoAchadas.length > 80 ? ` ... +${naoAchadas.length - 80}` : ""}`);
}

main()
  .catch((e) => { console.error("seed-nucleos-pessoas falhou:", e); })
  .finally(() => prisma.$disconnect());
