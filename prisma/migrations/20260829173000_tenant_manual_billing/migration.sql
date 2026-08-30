-- CreateEnum
CREATE TYPE "PeriodoRenovacionTenant" AS ENUM ('MENSUAL', 'ANUAL');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "fechaActivacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaRenovacion" TIMESTAMP(3),
ADD COLUMN     "periodoRenovacion" "PeriodoRenovacionTenant" NOT NULL DEFAULT 'MENSUAL';

-- CreateTable
CREATE TABLE "pagos_tenants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'COP',
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_tenants_tenantId_idx" ON "pagos_tenants"("tenantId");

-- AddForeignKey
ALTER TABLE "pagos_tenants" ADD CONSTRAINT "pagos_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
