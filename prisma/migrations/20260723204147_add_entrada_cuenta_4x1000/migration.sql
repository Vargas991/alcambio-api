-- AlterTable
ALTER TABLE "entradas" ADD COLUMN     "aplica4x1000" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "impuesto4x1000Cop" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoAplicadoDeudaCop" DECIMAL(18,2);
