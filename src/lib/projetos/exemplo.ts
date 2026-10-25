// "Projeto teste que ensina": cada pessoa recebe UM projeto de exemplo, so' dela, para aprender o fluxo (equipe, tarefas, Kanban, Gantt, atualizacoes)
// sem mexer em nada real. PURO (sem banco): so' descreve o projeto e as tarefas; a rota /api/projects/exemplo e' quem grava.
export const NOME_PROJETO_EXEMPLO = "Projeto teste: aprenda a usar o sistema";
export const MARCADOR_EXEMPLO = "PROJETO_EXEMPLO_CRIADO";

export const DESCRICAO_EXEMPLO =
  "Este projeto é só seu e serve para você aprender. Edite, mova e apague à vontade: nada aqui é real e ninguém mais enxerga. " +
  "Projetos no sistema são particulares: você só vê os que criou ou aqueles para os quais foi chamado(a) na aba Equipe.";

export type TarefaDoExemplo = {
  title: string;
  description: string;
  status: "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO";
  inicioEmDias: number;
  prazoEmDias: number;
  isEntrega?: boolean;
};

export const TAREFAS_DO_EXEMPLO: TarefaDoExemplo[] = [
  { title: "Leia isto primeiro: como este projeto funciona", status: "FEITO", inicioEmDias: -3, prazoEmDias: -2, description: "Cada coluna do Kanban é uma situação: A fazer, Fazendo, Bloqueado e Feito. Arraste os cartões entre as colunas para atualizar o andamento. Esta tarefa já está em Feito." },
  { title: "Monte a equipe: abra a aba Equipe e chame as pessoas", status: "A_FAZER", inicioEmDias: 0, prazoEmDias: 1, description: "Antes de criar tarefas, defina quem trabalha no projeto. Na aba Equipe você chama qualquer pessoa da empresa, de qualquer núcleo. Só quem está na equipe (ou foi atribuído a uma tarefa) enxerga o projeto." },
  { title: "Arraste este cartão para a coluna Fazendo", status: "A_FAZER", inicioEmDias: 0, prazoEmDias: 2, description: "Clique no cartão e arraste para outra coluna. O percentual de andamento do projeto sobe sozinho conforme as tarefas ficam Feitas." },
  { title: "Crie sua primeira tarefa com o botão + Tarefa", status: "FAZENDO", inicioEmDias: -1, prazoEmDias: 3, description: "Dê um título, escolha o responsável e informe início e prazo. Só tarefas com as duas datas aparecem no Gantt." },
  { title: "Veja as datas desta tarefa no Gantt", status: "A_FAZER", inicioEmDias: 1, prazoEmDias: 5, description: "Abra a aba Gantt do projeto. A barra mostra o período, e as datas de início e prazo aparecem ao lado dela e na coluna do nome." },
  { title: "Esta tarefa está bloqueada: marque o motivo ao comentar", status: "BLOQUEADO", inicioEmDias: -2, prazoEmDias: -1, description: "Tarefas bloqueadas e com prazo vencido contam como atraso e deixam a saúde do projeto em atenção. Comente o motivo para a equipe saber o que destrava." },
  { title: "Registre uma atualização na aba Atualizações", status: "A_FAZER", inicioEmDias: 2, prazoEmDias: 6, description: "Use as atualizações para dizer como o projeto está (no prazo, em atenção ou atrasado) e o que vem a seguir. Quem acompanha o projeto lê ali, sem precisar perguntar." },
  { title: "Entrega: projeto de teste concluído", status: "A_FAZER", inicioEmDias: 7, prazoEmDias: 7, isEntrega: true, description: "Entregas são marcos do projeto e aparecem com a bandeira no Gantt. Quando terminar de explorar, você pode apagar este projeto." },
];

const DIA = 86400000;
export const emDias = (base: Date, dias: number) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + dias * DIA);
