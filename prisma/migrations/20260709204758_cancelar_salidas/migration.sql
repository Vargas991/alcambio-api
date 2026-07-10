-- CreateEnum
CREATE TYPE "EstadoSalida" AS ENUM ('REGISTRADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "salidas" ADD COLUMN     "estado" "EstadoSalida" NOT NULL DEFAULT 'REGISTRADA';
