/*
  Warnings:

  - You are about to alter the column `saldo` on the `cuentas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `montoCop` on the `entradas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `montoTransaccion` on the `movimientos_clientes` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `debitoCop` on the `movimientos_clientes` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `creditoCop` on the `movimientos_clientes` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `monto` on the `movimientos_cuentas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `saldoAnterior` on the `movimientos_cuentas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `saldoNuevo` on the `movimientos_cuentas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `montoTransaccion` on the `operaciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `tasaCompra` on the `operaciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,8)`.
  - You are about to alter the column `tasaVenta` on the `operaciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,8)`.
  - You are about to alter the column `totalCompraCop` on the `operaciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `totalVentaCop` on the `operaciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `utilidadCop` on the `operaciones` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `montoCop` on the `salidas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `impuestoCuenta4x1000Cop` on the `salidas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to alter the column `impuestoProveedor4x1000Cop` on the `salidas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to alter the column `montoBaseCop` on the `salidas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `montoEnviadoCop` on the `salidas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `totalDebitadoCop` on the `salidas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - Made the column `montoAplicado` on table `entradas` required. This step will fail if there are existing NULL values in that column.
  - Made the column `montoPago` on table `entradas` required. This step will fail if there are existing NULL values in that column.
  - Made the column `credito` on table `movimientos_clientes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `debito` on table `movimientos_clientes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `montoAplicado` on table `salidas` required. This step will fail if there are existing NULL values in that column.
  - Made the column `montoPago` on table `salidas` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "cuentas" ALTER COLUMN "saldo" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "entradas" ALTER COLUMN "montoCop" SET DEFAULT 0,
ALTER COLUMN "montoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "montoAplicado" SET NOT NULL,
ALTER COLUMN "montoPago" SET NOT NULL;

-- AlterTable
ALTER TABLE "movimientos_clientes" ADD COLUMN     "saldoAnterior" DECIMAL(18,6),
ADD COLUMN     "saldoNuevo" DECIMAL(18,6),
ALTER COLUMN "montoTransaccion" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "debitoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "creditoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "credito" SET NOT NULL,
ALTER COLUMN "credito" SET DEFAULT 0,
ALTER COLUMN "debito" SET NOT NULL,
ALTER COLUMN "debito" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "movimientos_cuentas" ALTER COLUMN "monto" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "saldoAnterior" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "saldoNuevo" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "operaciones" ALTER COLUMN "montoTransaccion" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "tasaCompra" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "tasaVenta" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "totalCompraCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "totalVentaCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "utilidadCop" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "salidas" ALTER COLUMN "montoCop" SET DEFAULT 0,
ALTER COLUMN "montoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "impuestoCuenta4x1000Cop" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "impuestoProveedor4x1000Cop" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "montoBaseCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "montoEnviadoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "totalDebitadoCop" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "montoAplicado" SET NOT NULL,
ALTER COLUMN "montoPago" SET NOT NULL;

-- CreateIndex
CREATE INDEX "clientes_nombre_idx" ON "clientes"("nombre");

-- CreateIndex
CREATE INDEX "cuentas_moneda_estado_idx" ON "cuentas"("moneda", "estado");

-- CreateIndex
CREATE INDEX "entradas_deudorId_creadoEn_idx" ON "entradas"("deudorId", "creadoEn");

-- CreateIndex
CREATE INDEX "entradas_cuentaId_creadoEn_idx" ON "entradas"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "entradas_monedaPago_monedaAplicacion_idx" ON "entradas"("monedaPago", "monedaAplicacion");

-- CreateIndex
CREATE INDEX "movimientos_clientes_clienteId_moneda_creadoEn_idx" ON "movimientos_clientes"("clienteId", "moneda", "creadoEn");

-- CreateIndex
CREATE INDEX "movimientos_clientes_entradaId_idx" ON "movimientos_clientes"("entradaId");

-- CreateIndex
CREATE INDEX "movimientos_clientes_salidaId_idx" ON "movimientos_clientes"("salidaId");

-- CreateIndex
CREATE INDEX "movimientos_clientes_operacionId_idx" ON "movimientos_clientes"("operacionId");

-- CreateIndex
CREATE INDEX "movimientos_cuentas_cuentaId_creadoEn_idx" ON "movimientos_cuentas"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "movimientos_cuentas_referenciaTipo_referenciaId_idx" ON "movimientos_cuentas"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE INDEX "operaciones_deudorId_fechaOperacion_idx" ON "operaciones"("deudorId", "fechaOperacion");

-- CreateIndex
CREATE INDEX "operaciones_acreedorId_fechaOperacion_idx" ON "operaciones"("acreedorId", "fechaOperacion");

-- CreateIndex
CREATE INDEX "operaciones_monedaDeuda_estado_idx" ON "operaciones"("monedaDeuda", "estado");

-- CreateIndex
CREATE INDEX "salidas_acreedorId_creadoEn_idx" ON "salidas"("acreedorId", "creadoEn");

-- CreateIndex
CREATE INDEX "salidas_cuentaId_creadoEn_idx" ON "salidas"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "salidas_monedaPago_monedaAplicacion_idx" ON "salidas"("monedaPago", "monedaAplicacion");
