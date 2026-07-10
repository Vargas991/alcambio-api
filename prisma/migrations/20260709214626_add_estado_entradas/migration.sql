-- CreateEnum
CREATE TYPE "EstadoEntrada" AS ENUM ('REGISTRADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "entradas" ADD COLUMN     "estado" "EstadoEntrada" NOT NULL DEFAULT 'REGISTRADA';
