-- CreateEnum
CREATE TYPE "Modo4x1000Proveedor" AS ENUM ('SUMAR', 'RESTAR');

-- AlterTable
ALTER TABLE "salidas" ADD COLUMN     "modo4x1000Proveedor" "Modo4x1000Proveedor" DEFAULT 'RESTAR';
