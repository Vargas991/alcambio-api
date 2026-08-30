-- AlterEnum
ALTER TYPE "RolUsuario" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "ConfiguracionOrganizacion" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionOrganizacion_tenantId_key" ON "ConfiguracionOrganizacion"("tenantId");

-- CreateIndex
CREATE INDEX "usuarios_tenantId_idx" ON "usuarios"("tenantId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracionOrganizacion" ADD CONSTRAINT "ConfiguracionOrganizacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
