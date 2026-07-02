/*
  Warnings:

  - You are about to drop the `movimientos_proveedores` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `proveedores` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "TipoMovimientoCliente" ADD VALUE 'PAGO';

-- DropForeignKey
ALTER TABLE "entradas" DROP CONSTRAINT "entradas_proveedorId_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_proveedores" DROP CONSTRAINT "movimientos_proveedores_entradaId_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_proveedores" DROP CONSTRAINT "movimientos_proveedores_operacionId_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_proveedores" DROP CONSTRAINT "movimientos_proveedores_proveedorId_fkey";

-- DropForeignKey
ALTER TABLE "operaciones" DROP CONSTRAINT "operaciones_proveedorId_fkey";

-- DropTable
DROP TABLE "movimientos_proveedores";

-- DropTable
DROP TABLE "proveedores";

-- DropEnum
DROP TYPE "TipoMovimientoProveedor";

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
