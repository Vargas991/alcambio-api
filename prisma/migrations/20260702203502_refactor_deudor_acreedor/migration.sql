/*
  Warnings:

  - You are about to drop the column `clienteId` on the `entradas` table. All the data in the column will be lost.
  - You are about to drop the column `proveedorId` on the `entradas` table. All the data in the column will be lost.
  - You are about to drop the column `clienteId` on the `operaciones` table. All the data in the column will be lost.
  - You are about to drop the column `proveedorId` on the `operaciones` table. All the data in the column will be lost.
  - Added the required column `deudorId` to the `entradas` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "entradas" DROP CONSTRAINT "entradas_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "entradas" DROP CONSTRAINT "entradas_proveedorId_fkey";

-- DropForeignKey
ALTER TABLE "operaciones" DROP CONSTRAINT "operaciones_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "operaciones" DROP CONSTRAINT "operaciones_proveedorId_fkey";

-- AlterTable
ALTER TABLE "entradas" DROP COLUMN "clienteId",
DROP COLUMN "proveedorId",
ADD COLUMN     "acreedorId" TEXT,
ADD COLUMN     "deudorId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "operaciones" DROP COLUMN "clienteId",
DROP COLUMN "proveedorId",
ADD COLUMN     "acreedorId" TEXT,
ADD COLUMN     "deudorId" TEXT;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_deudorId_fkey" FOREIGN KEY ("deudorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_acreedorId_fkey" FOREIGN KEY ("acreedorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_deudorId_fkey" FOREIGN KEY ("deudorId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_acreedorId_fkey" FOREIGN KEY ("acreedorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
