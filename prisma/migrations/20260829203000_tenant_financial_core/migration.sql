-- Add tenant columns as nullable first so existing financial records can be backfilled safely.
ALTER TABLE "operaciones" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "entradas" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "salidas" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "movimientos_cuentas" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "movimientos_clientes" ADD COLUMN "tenantId" TEXT;

-- Ensure the compatibility/default tenant exists for legacy records.
INSERT INTO "tenants" ("id", "nombre", "slug", "activo", "fechaActivacion", "periodoRenovacion", "creadoEn", "actualizadoEn")
VALUES ('00000000-0000-4000-8000-000000000001', 'AlCambio', 'default', true, CURRENT_TIMESTAMP, 'MENSUAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Backfill operations from their operative account when present.
UPDATE "operaciones" AS op
SET "tenantId" = cuenta."tenantId"
FROM "cuentas" AS cuenta
WHERE op."cuentaOperativaId" = cuenta."id"
  AND op."tenantId" IS NULL;

-- Backfill remaining operations from debtor/creditor clients.
UPDATE "operaciones" AS op
SET "tenantId" = cliente."tenantId"
FROM "clientes" AS cliente
WHERE op."deudorId" = cliente."id"
  AND op."tenantId" IS NULL;

UPDATE "operaciones" AS op
SET "tenantId" = cliente."tenantId"
FROM "clientes" AS cliente
WHERE op."acreedorId" = cliente."id"
  AND op."tenantId" IS NULL;

-- Backfill entries from account first, then clients.
UPDATE "entradas" AS entrada
SET "tenantId" = cuenta."tenantId"
FROM "cuentas" AS cuenta
WHERE entrada."cuentaId" = cuenta."id"
  AND entrada."tenantId" IS NULL;

UPDATE "entradas" AS entrada
SET "tenantId" = cliente."tenantId"
FROM "clientes" AS cliente
WHERE entrada."deudorId" = cliente."id"
  AND entrada."tenantId" IS NULL;

UPDATE "entradas" AS entrada
SET "tenantId" = cliente."tenantId"
FROM "clientes" AS cliente
WHERE entrada."acreedorId" = cliente."id"
  AND entrada."tenantId" IS NULL;

-- Backfill exits from account first, then creditor client.
UPDATE "salidas" AS salida
SET "tenantId" = cuenta."tenantId"
FROM "cuentas" AS cuenta
WHERE salida."cuentaId" = cuenta."id"
  AND salida."tenantId" IS NULL;

UPDATE "salidas" AS salida
SET "tenantId" = cliente."tenantId"
FROM "clientes" AS cliente
WHERE salida."acreedorId" = cliente."id"
  AND salida."tenantId" IS NULL;

-- Backfill account movements from their account.
UPDATE "movimientos_cuentas" AS movimiento
SET "tenantId" = cuenta."tenantId"
FROM "cuentas" AS cuenta
WHERE movimiento."cuentaId" = cuenta."id"
  AND movimiento."tenantId" IS NULL;

-- Backfill client movements from their client.
UPDATE "movimientos_clientes" AS movimiento
SET "tenantId" = cliente."tenantId"
FROM "clientes" AS cliente
WHERE movimiento."clienteId" = cliente."id"
  AND movimiento."tenantId" IS NULL;

-- Fallback for legacy orphaned records.
UPDATE "operaciones"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

UPDATE "entradas"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

UPDATE "salidas"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

UPDATE "movimientos_cuentas"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

UPDATE "movimientos_clientes"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

-- Enforce tenant ownership after backfill.
ALTER TABLE "operaciones" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "entradas" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "salidas" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "movimientos_cuentas" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "movimientos_clientes" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "operaciones_tenantId_idx" ON "operaciones"("tenantId");
CREATE INDEX "operaciones_tenantId_estado_idx" ON "operaciones"("tenantId", "estado");
CREATE INDEX "operaciones_tenantId_fechaOperacion_idx" ON "operaciones"("tenantId", "fechaOperacion");

CREATE INDEX "entradas_tenantId_idx" ON "entradas"("tenantId");
CREATE INDEX "entradas_tenantId_creadoEn_idx" ON "entradas"("tenantId", "creadoEn");
CREATE INDEX "entradas_tenantId_estado_idx" ON "entradas"("tenantId", "estado");

CREATE INDEX "salidas_tenantId_idx" ON "salidas"("tenantId");
CREATE INDEX "salidas_tenantId_creadoEn_idx" ON "salidas"("tenantId", "creadoEn");
CREATE INDEX "salidas_tenantId_estado_idx" ON "salidas"("tenantId", "estado");

CREATE INDEX "movimientos_cuentas_tenantId_idx" ON "movimientos_cuentas"("tenantId");
CREATE INDEX "movimientos_cuentas_tenantId_creadoEn_idx" ON "movimientos_cuentas"("tenantId", "creadoEn");

CREATE INDEX "movimientos_clientes_tenantId_idx" ON "movimientos_clientes"("tenantId");
CREATE INDEX "movimientos_clientes_tenantId_creadoEn_idx" ON "movimientos_clientes"("tenantId", "creadoEn");

ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salidas" ADD CONSTRAINT "salidas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_cuentas" ADD CONSTRAINT "movimientos_cuentas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_clientes" ADD CONSTRAINT "movimientos_clientes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
