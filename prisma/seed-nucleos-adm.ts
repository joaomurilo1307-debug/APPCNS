// Cria os NUCLEOS dos setores ADM, com os nomes exatos da lotacao da planilha "LISTAGEM DE ATIVOS", e liga os responsaveis de cada um
// (pedido do Joao, 22/10/2026). Contratos (MRN, AGA, SVPM...) NAO entram: os nucleos sao so' os setores administrativos.
//
// Roda sozinho no boot (sem variavel de ambiente) e e' seguro repetir:
//   1) nucleos: cria so' os que faltam, por nome, UMA vez (marca "seed.nucleos-adm.concluido" na auditoria). Se o Joao renomear ou
//      apagar um nucleo depois, ele nao volta.
//   2) responsaveis (prisma/data/nucleos_adm_responsaveis.json): para cada pessoa, acha o usuario pela matricula (chapa) ou, se nao achar,
//      pelo nome completo quando for unico, e liga como gerente/coordenador/membro. Cada pessoa tem a sua marca
//      ("seed.nucleos-adm.resp.<chapa>"): quem nao foi encontrada tenta de novo no proximo boot; quem ja foi ligada nunca e' refeita.
// Nao mexe em equipes, projetos nem em nucleos que ja existiam alem do que esta listado.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const MARCA_NUCLEOS = "seed.nucleos-adm.concluido";
const dado = (nome: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", nome), "utf-8"));

function chaveNome(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function criarNucleos() {
  if (await prisma.auditLog.findFirst({ where: { action: MARCA_NUCLEOS }, select: { id: true } })) {
    console.log("Nucleos ADM ja foram criados antes; nada a criar.");
    return;
  }
  const lista: { name: string; description?: string }[] = dado("nucleos_adm_listagem.json");
  const criados: string[] = [];
  const jaExistiam: string[] = [];
  for (const n of lista) {
    if (await prisma.nucleo.findUnique({ where: { name: n.name }, select: { id: true } })) {
      jaExistiam.push(n.name);
      continue;
    }
    await prisma.nucleo.create({ data: { name: n.name, description: n.description ?? null } });
    criados.push(n.name);
  }
  await prisma.auditLog.create({ data: { action: MARCA_NUCLEOS, entityType: "Nucleo", metadata: JSON.stringify({ criados, jaExistiam }) } });
  console.log(`Nucleos ADM: ${criados.length} criados, ${jaExistiam.length} ja existiam.`);
}

type Responsavel = { chapa: string; nome: string; gerente?: string[]; coordenador?: string[]; membro?: string };

async function ligarResponsaveis() {
  const lista: Responsavel[] = dado("nucleos_adm_responsaveis.json");
  const usuarios = await prisma.user.findMany({ select: { id: true, name: true } });
  const porNome = new Map<string, string[]>();
  for (const u of usuarios) porNome.set(chaveNome(u.name), [...(porNome.get(chaveNome(u.name)) ?? []), u.id]);

  const idsNucleo = new Map((await prisma.nucleo.findMany({ select: { id: true, name: true } })).map((n) => [n.name, n.id]));
  const ligados: string[] = [];
  const semUsuario: string[] = [];

  for (const r of lista) {
    const marca = `seed.nucleos-adm.resp.${r.chapa}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;

    let userId = (await prisma.user.findUnique({ where: { matriculaSenior: r.chapa }, select: { id: true } }))?.id;
    if (!userId) {
      const ids = porNome.get(chaveNome(r.nome)) ?? [];
      if (ids.length === 1) userId = ids[0];
    }
    if (!userId) {
      semUsuario.push(`${r.chapa} ${r.nome}`);
      continue;
    }

    const faltando = [...(r.gerente ?? []), ...(r.coordenador ?? []), ...(r.membro ? [r.membro] : [])].filter((n) => !idsNucleo.has(n));
    if (faltando.length) {
      console.log(`Responsavel ${r.chapa}: nucleo(s) inexistente(s) (${faltando.join("; ")}); tentarei de novo no proximo boot.`);
      continue;
    }

    for (const n of r.gerente ?? []) await prisma.nucleo.update({ where: { id: idsNucleo.get(n)! }, data: { gerentes: { connect: { id: userId } } } });
    for (const n of r.coordenador ?? []) await prisma.nucleo.update({ where: { id: idsNucleo.get(n)! }, data: { coordenadores: { connect: { id: userId } } } });
    if (r.membro) await prisma.user.update({ where: { id: userId }, data: { nucleoId: idsNucleo.get(r.membro)! } });

    await prisma.auditLog.create({
      data: { action: marca, entityType: "Nucleo", entityId: userId, metadata: JSON.stringify({ chapa: r.chapa, gerente: r.gerente ?? [], coordenador: r.coordenador ?? [], membro: r.membro ?? null }) },
    });
    ligados.push(r.chapa);
  }
  console.log(`Responsaveis dos nucleos ADM: ${ligados.length} ligados (chapas ${ligados.join(", ") || "-"}); sem usuario no sistema: ${semUsuario.length ? semUsuario.join(" | ") : "nenhum"}.`);
}

async function main() {
  await criarNucleos();
  await ligarResponsaveis();
}

main()
  .catch((e) => {
    console.error("Falha no seed dos nucleos ADM:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
