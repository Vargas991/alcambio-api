-- AlterTable
ALTER TABLE "entradas" ADD COLUMN     "impuestoProveedor4x1000Cop" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoNetoAcreedorCop" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "proveedorCobra4x1000" BOOLEAN NOT NULL DEFAULT false;
