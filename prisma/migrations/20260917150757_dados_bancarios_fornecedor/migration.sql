-- AlterTable
ALTER TABLE "TituloContasAPagar" ADD COLUMN     "codigoBarrasBoleto" TEXT;

-- CreateTable
CREATE TABLE "FornecedorDadosBancarios" (
    "codFor" TEXT NOT NULL,
    "fornecedorNome" TEXT,
    "banco" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "dac" TEXT NOT NULL,
    "tipoConta" TEXT NOT NULL DEFAULT 'CC',
    "cpfCnpj" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FornecedorDadosBancarios_pkey" PRIMARY KEY ("codFor")
);
