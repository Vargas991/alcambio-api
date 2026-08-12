/*
Custom migration: 20260806211935_abonos_multimoneda

Objetivo:
- Conservar datos históricos al migrar a campos multimoneda.
- Hacer backfill antes de aplicar NOT NULL.
- Ser tolerante a una ejecución parcial en PostgreSQL mediante IF NOT EXISTS
  para columnas/índices que pudieran haberse creado antes de un fallo.

NOTA:
- Esta migración NO elimina datos.
- Los campos históricos COP se reutilizan como fuente para completar:
  entradas.montoPago / montoAplicado
  salidas.montoPago / montoAplicado
  movimientos_clientes.debito / credito
*/

-- =========================================================
-- CUENTAS
-- =========================================================

ALTER TABLE "cuentas"
ALTER COLUMN "saldo" SET DATA TYPE DECIMAL(18,6);

-- =========================================================
-- ENTRADAS
-- =========================================================

ALTER TABLE "entradas"
ALTER COLUMN "montoCop" SET DEFAULT 0,
ALTER COLUMN "montoCop" SET DATA TYPE DECIMAL(18,6);

UPDATE "entradas"
SET
  "montoPago" = COALESCE("montoPago", "montoCop", 0),
  "montoAplicado" = COALESCE("montoAplicado", "montoCop", 0)
WHERE
  "montoPago" IS NULL
  OR "montoAplicado" IS NULL;

ALTER TABLE "entradas"
ALTER COLUMN "montoAplicado" SET NOT NULL,
ALTER COLUMN "montoPago" SET NOT NULL;

-- =========================================================
-- MOVIMIENTOS CLIENTES
-- =========================================================

ALTER TABLE "movimientos_clientes"
ADD COLUMN IF NOT EXISTS "saldoAnterior" DECIMAL(18,6),
ADD COLUMN IF NOT EXISTS "saldoNuevo" DECIMAL(18,6);

ALTER TABLE "movimientos_clientes"
ALTER COLUMN "montoTransaccion" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "debitoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "creditoCop" SET DATA TYPE DECIMAL(18,6);

UPDATE "movimientos_clientes"
SET
  "credito" = COALESCE("credito", "creditoCop", 0),
  "debito" = COALESCE("debito", "debitoCop", 0)
WHERE
  "credito" IS NULL
  OR "debito" IS NULL;

ALTER TABLE "movimientos_clientes"
ALTER COLUMN "credito" SET DEFAULT 0,
ALTER COLUMN "credito" SET NOT NULL,
ALTER COLUMN "debito" SET DEFAULT 0,
ALTER COLUMN "debito" SET NOT NULL;

-- =========================================================
-- MOVIMIENTOS CUENTAS
-- =========================================================

ALTER TABLE "movimientos_cuentas"
ALTER COLUMN "monto" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "saldoAnterior" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "saldoNuevo" SET DATA TYPE DECIMAL(18,6);

-- =========================================================
-- OPERACIONES
-- =========================================================

ALTER TABLE "operaciones"
ALTER COLUMN "montoTransaccion" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "tasaCompra" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "tasaVenta" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "totalCompraCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "totalVentaCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "utilidadCop" SET DATA TYPE DECIMAL(18,6);

-- =========================================================
-- SALIDAS
-- =========================================================

ALTER TABLE "salidas"
ALTER COLUMN "montoCop" SET DEFAULT 0,
ALTER COLUMN "montoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "impuestoCuenta4x1000Cop" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "impuestoProveedor4x1000Cop" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "montoBaseCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "montoEnviadoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "totalDebitadoCop" SET DATA TYPE DECIMAL(18,6);

UPDATE "salidas"
SET
  "montoPago" = COALESCE("montoPago", "montoCop", 0),
  "montoAplicado" = COALESCE("montoAplicado", "montoCop", 0)
WHERE
  "montoPago" IS NULL
  OR "montoAplicado" IS NULL;

ALTER TABLE "salidas"
ALTER COLUMN "montoAplicado" SET NOT NULL,
ALTER COLUMN "montoPago" SET NOT NULL;

-- =========================================================
-- ÍNDICES
-- =========================================================

CREATE INDEX IF NOT EXISTS "clientes_nombre_idx"
ON "clientes"("nombre");

CREATE INDEX IF NOT EXISTS "cuentas_moneda_estado_idx"
ON "cuentas"("moneda", "estado");

CREATE INDEX IF NOT EXISTS "entradas_deudorId_creadoEn_idx"
ON "entradas"("deudorId", "creadoEn");

CREATE INDEX IF NOT EXISTS "entradas_cuentaId_creadoEn_idx"
ON "entradas"("cuentaId", "creadoEn");

CREATE INDEX IF NOT EXISTS "entradas_monedaPago_monedaAplicacion_idx"
ON "entradas"("monedaPago", "monedaAplicacion");

CREATE INDEX IF NOT EXISTS "movimientos_clientes_clienteId_moneda_creadoEn_idx"
ON "movimientos_clientes"("clienteId", "moneda", "creadoEn");

CREATE INDEX IF NOT EXISTS "movimientos_clientes_entradaId_idx"
ON "movimientos_clientes"("entradaId");

CREATE INDEX IF NOT EXISTS "movimientos_clientes_salidaId_idx"
ON "movimientos_clientes"("salidaId");

CREATE INDEX IF NOT EXISTS "movimientos_clientes_operacionId_idx"
ON "movimientos_clientes"("operacionId");

CREATE INDEX IF NOT EXISTS "movimientos_cuentas_cuentaId_creadoEn_idx"
ON "movimientos_cuentas"("cuentaId", "creadoEn");

CREATE INDEX IF NOT EXISTS "movimientos_cuentas_referenciaTipo_referenciaId_idx"
ON "movimientos_cuentas"("referenciaTipo", "referenciaId");

CREATE INDEX IF NOT EXISTS "operaciones_deudorId_fechaOperacion_idx"
ON "operaciones"("deudorId", "fechaOperacion");

CREATE INDEX IF NOT EXISTS "operaciones_acreedorId_fechaOperacion_idx"
ON "operaciones"("acreedorId", "fechaOperacion");

CREATE INDEX IF NOT EXISTS "operaciones_monedaDeuda_estado_idx"
ON "operaciones"("monedaDeuda", "estado");

CREATE INDEX IF NOT EXISTS "salidas_acreedorId_creadoEn_idx"
ON "salidas"("acreedorId", "creadoEn");

CREATE INDEX IF NOT EXISTS "salidas_cuentaId_creadoEn_idx"
ON "salidas"("cuentaId", "creadoEn");

CREATE INDEX IF NOT EXISTS "salidas_monedaPago_monedaAplicacion_idx"
ON "salidas"("monedaPago", "monedaAplicacion");