-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DIRETOR', 'GESTOR_PROJETO', 'APROVADOR', 'COLABORADOR', 'CLIENTE', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "Horizon" AS ENUM ('H1', 'H2', 'H3');

-- CreateEnum
CREATE TYPE "NivelHierarquico" AS ENUM ('DIRETORIA', 'GERENCIA', 'COORDENACAO', 'SUPERVISOR', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('ABERTO', 'MITIGADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('NOVA', 'EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "IdeaLevel" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "ScorecardScope" AS ENUM ('PESSOAL', 'EQUIPE', 'PROJETO', 'CORPORATIVO');

-- CreateEnum
CREATE TYPE "ScorecardStatusColor" AS ENUM ('VERDE', 'AMARELO', 'VERMELHO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TAREFA_ATRIBUIDA', 'PRAZO_ALTERADO', 'TAREFA_ATRASADA', 'APROVACAO_PENDENTE', 'MENCAO_COMENTARIO', 'REUNIAO_PROXIMA', 'CONVITE_PROJETO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NAO_REQUER', 'PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('GESTOR', 'MEMBRO');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANEJADO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('A_FAZER', 'FAZENDO', 'BLOQUEADO', 'FEITO');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "RotinaFrequencia" AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('REUNIAO', 'COMPROMISSO', 'ENTREGA', 'PRAZO', 'OUTRO');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('ALINHAMENTO', 'KICKOFF', 'UM_A_UM', 'DIRETORIA', 'CLIENTE', 'TECNICA', 'TREINAMENTO', 'OUTRA');

-- CreateEnum
CREATE TYPE "OnlineMeetingProvider" AS ENUM ('NENHUM', 'TEAMS', 'GOOGLE_MEET', 'JITSI');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXTO', 'NUMERO', 'MOEDA', 'DATA', 'LISTA', 'CHECKBOX', 'PESSOA', 'FORMULA');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "StatusRemessaPagamento" AS ENUM ('RASCUNHO', 'GERADO', 'RETORNO_PROCESSADO');

-- CreateEnum
CREATE TYPE "StatusItemPagamento" AS ENUM ('PENDENTE', 'AGENDADO', 'PAGO', 'REJEITADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusDdaBoleto" AS ENUM ('PENDENTE', 'BAIXADO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "StatusConciliacaoLancamento" AS ENUM ('NAO_CONCILIADO', 'CONCILIADO_AUTOMATICO', 'CONCILIADO_MANUAL', 'DIVERGENTE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COLABORADOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verTodosCustos" BOOLEAN NOT NULL DEFAULT false,
    "avatarColor" TEXT NOT NULL DEFAULT '#0f766e',
    "avatarUrl" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "statusManual" TEXT,
    "cargo" TEXT,
    "setor" TEXT,
    "diretoria" TEXT,
    "ramal" TEXT,
    "whatsapp" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "nivelHierarquico" "NivelHierarquico",
    "nucleoId" TEXT,
    "dataInicio" TIMESTAMP(3),
    "gestorImediatoId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primeiroAcesso" BOOLEAN NOT NULL DEFAULT false,
    "origemCadastro" TEXT NOT NULL DEFAULT 'MANUAL',
    "matriculaSenior" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDENTE',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessageRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessageRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutlookAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "msEmail" TEXT,
    "deltaLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutlookAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codccu" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoContaFinanceira" (
    "id" TEXT NOT NULL,
    "codccu" TEXT NOT NULL,
    "contrato" TEXT NOT NULL,
    "contaFinanceira" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "teamId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoContaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoFinanceiroDetalhe" (
    "id" TEXT NOT NULL,
    "codccu" TEXT NOT NULL,
    "contaFinanceira" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "numTit" TEXT NOT NULL,
    "codFor" TEXT NOT NULL,
    "fornecedorNome" TEXT,
    "dataEntrada" TIMESTAMP(3),
    "dataVencimento" TIMESTAMP(3),
    "valorRateado" DOUBLE PRECISION NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoFinanceiroDetalhe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoCcuColaborador" (
    "id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "codccu" TEXT NOT NULL,
    "colaborador" TEXT NOT NULL,
    "teamId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricoCcuColaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TituloContasAPagar" (
    "id" TEXT NOT NULL,
    "numTit" TEXT NOT NULL,
    "codFil" TEXT NOT NULL,
    "codFor" TEXT NOT NULL,
    "fornecedorNome" TEXT,
    "tipo" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "pago" BOOLEAN NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "vencimentoOriginal" TIMESTAMP(3),
    "vencimentoProgramado" TIMESTAMP(3),
    "valorOriginal" DOUBLE PRECISION NOT NULL,
    "valorAberto" DOUBLE PRECISION NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "codccu" TEXT,
    "ccuNome" TEXT,
    "numOcp" TEXT,
    "filOcp" TEXT,
    "numNfc" TEXT,
    "descricao" TEXT,
    "lancadoPorCod" TEXT,
    "dataLancamento" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TituloContasAPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nucleo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nucleo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBRO',

    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANEJADO',
    "teamId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "approverId" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NAO_REQUER',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "actualStartedAt" TIMESTAMP(3),
    "actualEndedAt" TIMESTAMP(3),
    "kanbanColumns" TEXT,
    "horizon" "Horizon",
    "orcamento" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceRate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ResourceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "impact" "RiskLevel" NOT NULL DEFAULT 'MEDIO',
    "probability" "RiskLevel" NOT NULL DEFAULT 'MEDIO',
    "mitigationPlan" TEXT,
    "status" "RiskStatus" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'NOVA',
    "impact" "IdeaLevel" NOT NULL DEFAULT 'MEDIO',
    "viability" "IdeaLevel" NOT NULL DEFAULT 'MEDIO',
    "urgency" "IdeaLevel" NOT NULL DEFAULT 'MEDIO',
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "convertedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaComment" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardItem" (
    "id" TEXT NOT NULL,
    "scope" "ScorecardScope" NOT NULL,
    "teamId" TEXT,
    "projectId" TEXT,
    "userId" TEXT,
    "objective" TEXT NOT NULL,
    "indicator" TEXT NOT NULL,
    "target" DOUBLE PRECISION,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "statusColor" "ScorecardStatusColor" NOT NULL DEFAULT 'VERDE',
    "trend" TEXT,
    "periodicity" TEXT,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoSenior" (
    "id" TEXT NOT NULL,
    "numOcp" TEXT NOT NULL,
    "codFil" TEXT,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "fornecedorCodigo" TEXT NOT NULL,
    "fornecedorNome" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "contratoTexto" TEXT,
    "codccu" TEXT,
    "contratoNome" TEXT,
    "criadorCod" TEXT,
    "criadorNome" TEXT,
    "previsaoPagamento" TIMESTAMP(3),
    "usuNumTit" TEXT,
    "usuNumNfc" TEXT,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "numApr" TEXT NOT NULL,
    "rotNap" TEXT,
    "situacaoAtual" TEXT NOT NULL,
    "niveisExigidos" TEXT,
    "niveisAprovados" TEXT,
    "nivelAtual" INTEGER NOT NULL DEFAULT 1,
    "historicoNiveis" TEXT,
    "temRateio" BOOLEAN NOT NULL DEFAULT false,
    "rateioDetalhe" TEXT,
    "aprovadoresPendentes" TEXT,
    "aprovadoresPendentesCod" TEXT,
    "mapaCotacao" TEXT,
    "proximoAprovadorCod" TEXT,
    "proximoAprovadorNome" TEXT,
    "proximoAprovadorUserId" TEXT,
    "primeiraDeteccaoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaSincEm" TIMESTAMP(3) NOT NULL,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoComo" TEXT,

    CONSTRAINT "AprovacaoSenior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioSenior" (
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioSenior_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "AprovacaoSeniorEvento" (
    "id" TEXT NOT NULL,
    "aprovacaoSeniorId" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "nivel" INTEGER,
    "usuAprSenior" TEXT,
    "observacao" TEXT,
    "detectadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AprovacaoSeniorEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'OUTRO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCustomFieldValue" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "TaskCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignedTeamId" TEXT,
    "parentGoalId" TEXT,
    "contributionValue" DOUBLE PRECISION,
    "autoFromProjectProgress" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDI" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gestorId" TEXT NOT NULL,
    "period" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDIItem" (
    "id" TEXT NOT NULL,
    "pdiId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'A_FAZER',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDIItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'COMPROMISSO',
    "meetingType" "MeetingType",
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "creatorId" TEXT NOT NULL,
    "outlookEventId" TEXT,
    "onlineMeetingProvider" "OnlineMeetingProvider" NOT NULL DEFAULT 'NENHUM',
    "onlineMeetingUrl" TEXT,
    "icsSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmail" TEXT,
    "guestName" TEXT,
    "inviteToken" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "CalendarEventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBoard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectClient" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ProjectClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'A_FAZER',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIA',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "isEntrega" BOOLEAN NOT NULL DEFAULT false,
    "isRotina" BOOLEAN NOT NULL DEFAULT false,
    "rotinaFrequencia" "RotinaFrequencia",
    "rotinaAteData" TIMESTAMP(3),
    "rotinaGroupId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "assigneeId" TEXT,
    "parentTaskId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "outlookEventId" TEXT,
    "actualStartedAt" TIMESTAMP(3),
    "actualEndedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "teamMessageId" TEXT,
    "directMessageId" TEXT,
    "projectId" TEXT,
    "teamId" TEXT,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "teamId" TEXT,
    "parentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DossieOC" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "numOcp" TEXT,
    "codFil" TEXT NOT NULL,
    "codFor" TEXT,
    "titulos" TEXT[],
    "fornecedorNome" TEXT,
    "vencimento" TIMESTAMP(3),
    "valorTotal" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "motivo" TEXT,
    "origem" TEXT,
    "gedDocumentId" TEXT,
    "gedVersao" TEXT,
    "arquivoNome" TEXT,
    "arquivoPath" TEXT,
    "arquivoBytes" INTEGER,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DossieOC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "apelido" TEXT NOT NULL,
    "banco" TEXT NOT NULL DEFAULT '341',
    "cnpj" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "dac" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemessaPagamento" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "codigoLote" TEXT NOT NULL DEFAULT '0001',
    "status" "StatusRemessaPagamento" NOT NULL DEFAULT 'RASCUNHO',
    "nomeArquivo" TEXT,
    "conteudoArquivo" TEXT,
    "totalRegistros" INTEGER NOT NULL DEFAULT 0,
    "totalValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geradoEm" TIMESTAMP(3),

    CONSTRAINT "RemessaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemessaItemPagamento" (
    "id" TEXT NOT NULL,
    "remessaId" TEXT NOT NULL,
    "tituloId" TEXT,
    "numeroSequencial" INTEGER NOT NULL,
    "segmento" TEXT NOT NULL,
    "formaPagamento" TEXT NOT NULL,
    "referenciaEmpresa" TEXT NOT NULL,
    "favorecidoNome" TEXT NOT NULL,
    "favorecidoTipoDoc" TEXT NOT NULL,
    "favorecidoDocumento" TEXT NOT NULL,
    "bancoFavorecido" TEXT,
    "agenciaFavorecido" TEXT,
    "contaFavorecido" TEXT,
    "dacFavorecido" TEXT,
    "codigoBarras" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "status" "StatusItemPagamento" NOT NULL DEFAULT 'PENDENTE',
    "nossoNumero" TEXT,
    "dataEfetivacao" TIMESTAMP(3),
    "valorEfetivado" DOUBLE PRECISION,
    "ocorrencias" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemessaItemPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetornoPagamentoArquivo" (
    "id" TEXT NOT NULL,
    "remessaId" TEXT,
    "nomeArquivo" TEXT NOT NULL,
    "totalRegistros" INTEGER NOT NULL DEFAULT 0,
    "totalReconhecidos" INTEGER NOT NULL DEFAULT 0,
    "processadoPorId" TEXT,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetornoPagamentoArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdaBoletoRegistrado" (
    "id" TEXT NOT NULL,
    "codigoBarras" TEXT NOT NULL,
    "linhaDigitavel" TEXT,
    "sacadorNome" TEXT,
    "sacadorDocumento" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusDdaBoleto" NOT NULL DEFAULT 'PENDENTE',
    "origemArquivo" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DdaBoletoRegistrado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoBancariaLancamento" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "dataLancamento" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "historico" TEXT NOT NULL,
    "documento" TEXT,
    "status" "StatusConciliacaoLancamento" NOT NULL DEFAULT 'NAO_CONCILIADO',
    "remessaItemId" TEXT,
    "origemArquivo" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciliacaoBancariaLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_NucleoGerente" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ProjectNucleo" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ProjectDiretor" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ProjectCoordenador" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_GoalAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_matriculaSenior_key" ON "User"("matriculaSenior");

-- CreateIndex
CREATE INDEX "ApprovalRequest_approverId_status_idx" ON "ApprovalRequest"("approverId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requesterId_idx" ON "ApprovalRequest"("requesterId");

-- CreateIndex
CREATE INDEX "DirectMessage_senderId_receiverId_idx" ON "DirectMessage"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "DirectMessage_receiverId_senderId_idx" ON "DirectMessage"("receiverId", "senderId");

-- CreateIndex
CREATE INDEX "TeamMessage_teamId_createdAt_idx" ON "TeamMessage"("teamId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMessageRead_userId_teamId_key" ON "TeamMessageRead"("userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "OutlookAccount_userId_key" ON "OutlookAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_codccu_key" ON "Team"("codccu");

-- CreateIndex
CREATE INDEX "CustoContaFinanceira_teamId_idx" ON "CustoContaFinanceira"("teamId");

-- CreateIndex
CREATE INDEX "CustoContaFinanceira_competencia_idx" ON "CustoContaFinanceira"("competencia");

-- CreateIndex
CREATE UNIQUE INDEX "CustoContaFinanceira_codccu_contaFinanceira_competencia_key" ON "CustoContaFinanceira"("codccu", "contaFinanceira", "competencia");

-- CreateIndex
CREATE INDEX "CustoFinanceiroDetalhe_codccu_contaFinanceira_competencia_idx" ON "CustoFinanceiroDetalhe"("codccu", "contaFinanceira", "competencia");

-- CreateIndex
CREATE INDEX "HistoricoCcuColaborador_teamId_idx" ON "HistoricoCcuColaborador"("teamId");

-- CreateIndex
CREATE INDEX "HistoricoCcuColaborador_competencia_idx" ON "HistoricoCcuColaborador"("competencia");

-- CreateIndex
CREATE INDEX "HistoricoCcuColaborador_codccu_idx" ON "HistoricoCcuColaborador"("codccu");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricoCcuColaborador_matricula_competencia_key" ON "HistoricoCcuColaborador"("matricula", "competencia");

-- CreateIndex
CREATE INDEX "TituloContasAPagar_numOcp_idx" ON "TituloContasAPagar"("numOcp");

-- CreateIndex
CREATE INDEX "TituloContasAPagar_filOcp_numOcp_idx" ON "TituloContasAPagar"("filOcp", "numOcp");

-- CreateIndex
CREATE INDEX "TituloContasAPagar_codFor_numNfc_idx" ON "TituloContasAPagar"("codFor", "numNfc");

-- CreateIndex
CREATE INDEX "TituloContasAPagar_pago_idx" ON "TituloContasAPagar"("pago");

-- CreateIndex
CREATE INDEX "TituloContasAPagar_codFor_idx" ON "TituloContasAPagar"("codFor");

-- CreateIndex
CREATE UNIQUE INDEX "TituloContasAPagar_numTit_codFil_codFor_tipo_dataEmissao_key" ON "TituloContasAPagar"("numTit", "codFil", "codFor", "tipo", "dataEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "Nucleo_name_key" ON "Nucleo"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserTeam_userId_teamId_key" ON "UserTeam"("userId", "teamId");

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceRate_projectId_userId_key" ON "ResourceRate"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Idea_convertedTaskId_key" ON "Idea"("convertedTaskId");

-- CreateIndex
CREATE INDEX "Idea_projectId_status_idx" ON "Idea"("projectId", "status");

-- CreateIndex
CREATE INDEX "ScorecardItem_scope_idx" ON "ScorecardItem"("scope");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AprovacaoSenior_numOcp_key" ON "AprovacaoSenior"("numOcp");

-- CreateIndex
CREATE INDEX "AprovacaoSenior_situacaoAtual_idx" ON "AprovacaoSenior"("situacaoAtual");

-- CreateIndex
CREATE INDEX "AprovacaoSenior_codFil_numOcp_idx" ON "AprovacaoSenior"("codFil", "numOcp");

-- CreateIndex
CREATE INDEX "AprovacaoSenior_codccu_idx" ON "AprovacaoSenior"("codccu");

-- CreateIndex
CREATE INDEX "AprovacaoSenior_proximoAprovadorUserId_idx" ON "AprovacaoSenior"("proximoAprovadorUserId");

-- CreateIndex
CREATE INDEX "AprovacaoSeniorEvento_aprovacaoSeniorId_idx" ON "AprovacaoSeniorEvento"("aprovacaoSeniorId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCustomFieldValue_taskId_customFieldId_key" ON "TaskCustomFieldValue"("taskId", "customFieldId");

-- CreateIndex
CREATE INDEX "Goal_projectId_idx" ON "Goal"("projectId");

-- CreateIndex
CREATE INDEX "Goal_parentGoalId_idx" ON "Goal"("parentGoalId");

-- CreateIndex
CREATE INDEX "Goal_assignedTeamId_idx" ON "Goal"("assignedTeamId");

-- CreateIndex
CREATE INDEX "PDI_userId_idx" ON "PDI"("userId");

-- CreateIndex
CREATE INDEX "PDI_gestorId_idx" ON "PDI"("gestorId");

-- CreateIndex
CREATE INDEX "PDIItem_pdiId_idx" ON "PDIItem"("pdiId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_outlookEventId_key" ON "CalendarEvent"("outlookEventId");

-- CreateIndex
CREATE INDEX "CalendarEvent_projectId_idx" ON "CalendarEvent"("projectId");

-- CreateIndex
CREATE INDEX "CalendarEvent_creatorId_idx" ON "CalendarEvent"("creatorId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventAttendee_inviteToken_key" ON "CalendarEventAttendee"("inviteToken");

-- CreateIndex
CREATE INDEX "CalendarEventAttendee_eventId_idx" ON "CalendarEventAttendee"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventAttendee_eventId_userId_key" ON "CalendarEventAttendee"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBoard_projectId_key" ON "ProjectBoard"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectClient_projectId_userId_key" ON "ProjectClient"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_outlookEventId_key" ON "Task"("outlookEventId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_rotinaGroupId_idx" ON "Task"("rotinaGroupId");

-- CreateIndex
CREATE INDEX "TaskDependency_predecessorId_idx" ON "TaskDependency"("predecessorId");

-- CreateIndex
CREATE INDEX "TaskDependency_successorId_idx" ON "TaskDependency"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_predecessorId_successorId_key" ON "TaskDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");

-- CreateIndex
CREATE INDEX "Attachment_teamMessageId_idx" ON "Attachment"("teamMessageId");

-- CreateIndex
CREATE INDEX "Attachment_directMessageId_idx" ON "Attachment"("directMessageId");

-- CreateIndex
CREATE INDEX "Attachment_projectId_idx" ON "Attachment"("projectId");

-- CreateIndex
CREATE INDEX "Attachment_teamId_idx" ON "Attachment"("teamId");

-- CreateIndex
CREATE INDEX "Attachment_folderId_idx" ON "Attachment"("folderId");

-- CreateIndex
CREATE INDEX "Folder_projectId_idx" ON "Folder"("projectId");

-- CreateIndex
CREATE INDEX "Folder_teamId_idx" ON "Folder"("teamId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Folder_createdBy_idx" ON "Folder"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "DossieOC_chave_key" ON "DossieOC"("chave");

-- CreateIndex
CREATE INDEX "DossieOC_numOcp_idx" ON "DossieOC"("numOcp");

-- CreateIndex
CREATE INDEX "DossieOC_status_idx" ON "DossieOC"("status");

-- CreateIndex
CREATE INDEX "DossieOC_codFor_idx" ON "DossieOC"("codFor");

-- CreateIndex
CREATE INDEX "RemessaPagamento_status_idx" ON "RemessaPagamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RemessaItemPagamento_referenciaEmpresa_key" ON "RemessaItemPagamento"("referenciaEmpresa");

-- CreateIndex
CREATE INDEX "RemessaItemPagamento_remessaId_idx" ON "RemessaItemPagamento"("remessaId");

-- CreateIndex
CREATE INDEX "RemessaItemPagamento_tituloId_idx" ON "RemessaItemPagamento"("tituloId");

-- CreateIndex
CREATE INDEX "RemessaItemPagamento_status_idx" ON "RemessaItemPagamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DdaBoletoRegistrado_codigoBarras_key" ON "DdaBoletoRegistrado"("codigoBarras");

-- CreateIndex
CREATE INDEX "DdaBoletoRegistrado_status_idx" ON "DdaBoletoRegistrado"("status");

-- CreateIndex
CREATE INDEX "DdaBoletoRegistrado_dataVencimento_idx" ON "DdaBoletoRegistrado"("dataVencimento");

-- CreateIndex
CREATE INDEX "ConciliacaoBancariaLancamento_contaBancariaId_dataLancament_idx" ON "ConciliacaoBancariaLancamento"("contaBancariaId", "dataLancamento");

-- CreateIndex
CREATE INDEX "ConciliacaoBancariaLancamento_status_idx" ON "ConciliacaoBancariaLancamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "_NucleoGerente_AB_unique" ON "_NucleoGerente"("A", "B");

-- CreateIndex
CREATE INDEX "_NucleoGerente_B_index" ON "_NucleoGerente"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectNucleo_AB_unique" ON "_ProjectNucleo"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectNucleo_B_index" ON "_ProjectNucleo"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectDiretor_AB_unique" ON "_ProjectDiretor"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectDiretor_B_index" ON "_ProjectDiretor"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectCoordenador_AB_unique" ON "_ProjectCoordenador"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectCoordenador_B_index" ON "_ProjectCoordenador"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_GoalAssignees_AB_unique" ON "_GoalAssignees"("A", "B");

-- CreateIndex
CREATE INDEX "_GoalAssignees_B_index" ON "_GoalAssignees"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gestorImediatoId_fkey" FOREIGN KEY ("gestorImediatoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessageRead" ADD CONSTRAINT "TeamMessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessageRead" ADD CONSTRAINT "TeamMessageRead_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlookAccount" ADD CONSTRAINT "OutlookAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoContaFinanceira" ADD CONSTRAINT "CustoContaFinanceira_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoCcuColaborador" ADD CONSTRAINT "HistoricoCcuColaborador_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceRate" ADD CONSTRAINT "ResourceRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceRate" ADD CONSTRAINT "ResourceRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaComment" ADD CONSTRAINT "IdeaComment_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaComment" ADD CONSTRAINT "IdeaComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardItem" ADD CONSTRAINT "ScorecardItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardItem" ADD CONSTRAINT "ScorecardItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardItem" ADD CONSTRAINT "ScorecardItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoSenior" ADD CONSTRAINT "AprovacaoSenior_proximoAprovadorUserId_fkey" FOREIGN KEY ("proximoAprovadorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioSenior" ADD CONSTRAINT "UsuarioSenior_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoSeniorEvento" ADD CONSTRAINT "AprovacaoSeniorEvento_aprovacaoSeniorId_fkey" FOREIGN KEY ("aprovacaoSeniorId") REFERENCES "AprovacaoSenior"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDI" ADD CONSTRAINT "PDI_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDI" ADD CONSTRAINT "PDI_gestorId_fkey" FOREIGN KEY ("gestorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDIItem" ADD CONSTRAINT "PDIItem_pdiId_fkey" FOREIGN KEY ("pdiId") REFERENCES "PDI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBoard" ADD CONSTRAINT "ProjectBoard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectClient" ADD CONSTRAINT "ProjectClient_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectClient" ADD CONSTRAINT "ProjectClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_teamMessageId_fkey" FOREIGN KEY ("teamMessageId") REFERENCES "TeamMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaPagamento" ADD CONSTRAINT "RemessaPagamento_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaPagamento" ADD CONSTRAINT "RemessaPagamento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaItemPagamento" ADD CONSTRAINT "RemessaItemPagamento_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "RemessaPagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaItemPagamento" ADD CONSTRAINT "RemessaItemPagamento_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "TituloContasAPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetornoPagamentoArquivo" ADD CONSTRAINT "RetornoPagamentoArquivo_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "RemessaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetornoPagamentoArquivo" ADD CONSTRAINT "RetornoPagamentoArquivo_processadoPorId_fkey" FOREIGN KEY ("processadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NucleoGerente" ADD CONSTRAINT "_NucleoGerente_A_fkey" FOREIGN KEY ("A") REFERENCES "Nucleo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NucleoGerente" ADD CONSTRAINT "_NucleoGerente_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectNucleo" ADD CONSTRAINT "_ProjectNucleo_A_fkey" FOREIGN KEY ("A") REFERENCES "Nucleo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectNucleo" ADD CONSTRAINT "_ProjectNucleo_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectDiretor" ADD CONSTRAINT "_ProjectDiretor_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectDiretor" ADD CONSTRAINT "_ProjectDiretor_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectCoordenador" ADD CONSTRAINT "_ProjectCoordenador_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectCoordenador" ADD CONSTRAINT "_ProjectCoordenador_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GoalAssignees" ADD CONSTRAINT "_GoalAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GoalAssignees" ADD CONSTRAINT "_GoalAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
