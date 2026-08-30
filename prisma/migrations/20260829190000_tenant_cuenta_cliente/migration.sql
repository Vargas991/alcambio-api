-- Add tenant columns as nullable first so existing data can be backfilled safely.
ALTER TABLE "cuentas" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "clientes" ADD COLUMN "tenantId" TEXT;

-- Ensure the default tenant exists for pre-multitenant records.
INSERT INTO "tenants" ("id", "nombre", "slug", "activo", "fechaActivacion", "periodoRenovacion", "creadoEn", "actualizadoEn")
VALUES ('00000000-0000-4000-8000-000000000001', 'AlCambio', 'default', true, CURRENT_TIMESTAMP, 'MENSUAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Backfill existing financial base records to the default tenant.
UPDATE "cuentas"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

UPDATE "clientes"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

-- Enforce tenant ownership after backfill.
ALTER TABLE "cuentas" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "clientes" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "cuentas_tenantId_idx" ON "cuentas"("tenantId");
CREATE INDEX "clientes_tenantId_idx" ON "clientes"("tenantId");

ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
