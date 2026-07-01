-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('COP', 'BS', 'USD', 'USDT');

-- CreateEnum
CREATE TYPE "CategoriaCuenta" AS ENUM ('BASE_COP', 'OPERATIVA');

-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('CAJA', 'OFICINA', 'BANCO', 'ZELLE', 'BINANCE', 'BILLETERA_BS', 'OTRA');

-- CreateEnum
CREATE TYPE "EstadoEntidad" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "TipoOperacion" AS ENUM ('COMPRA', 'VENTA', 'OPERACION_DIRECTA');

-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('REGISTRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoEntrada" AS ENUM ('ABONO_CUENTA_PROPIA', 'ABONO_DIRECTO_PROVEEDOR');

-- CreateEnum
CREATE TYPE "TipoMovimientoCuenta" AS ENUM ('ENTRADA', 'SALIDA', 'GASTO', 'TRASLADO_ENTRADA', 'TRASLADO_SALIDA', 'OPERACION_ENTRADA', 'OPERACION_SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA');

-- CreateEnum
CREATE TYPE "TipoMovimientoCliente" AS ENUM ('OPERACION', 'ABONO', 'ABONO_DIRECTO', 'AJUSTE', 'CANCELACION');

-- CreateEnum
CREATE TYPE "TipoMovimientoProveedor" AS ENUM ('OPERACION', 'PAGO', 'ABONO_DIRECTO', 'AJUSTE', 'CANCELACION');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'OPERADOR', 'VISOR');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'OPERADOR',
    "estado" "EstadoEntidad" NOT NULL DEFAULT 'ACTIVO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "notas" TEXT,
    "estado" "EstadoEntidad" NOT NULL DEFAULT 'ACTIVO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "notas" TEXT,
    "estado" "EstadoEntidad" NOT NULL DEFAULT 'ACTIVO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "categoria" "CategoriaCuenta" NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "saldo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estado" "EstadoEntidad" NOT NULL DEFAULT 'ACTIVO',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operaciones" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoOperacion" NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'REGISTRADA',
    "clienteId" TEXT,
    "proveedorId" TEXT,
    "monedaTransaccion" "Moneda" NOT NULL,
    "montoTransaccion" DECIMAL(65,30) NOT NULL,
    "tasaCompra" DECIMAL(65,30) NOT NULL,
    "tasaVenta" DECIMAL(65,30) NOT NULL,
    "totalCompraCop" DECIMAL(65,30) NOT NULL,
    "totalVentaCop" DECIMAL(65,30) NOT NULL,
    "utilidadCop" DECIMAL(65,30) NOT NULL,
    "cuentaOperativaId" TEXT,
    "destinatario" TEXT,
    "fechaOperacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEntrada" NOT NULL,
    "clienteId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "cuentaId" TEXT,
    "montoCop" DECIMAL(65,30) NOT NULL,
    "descripcion" TEXT,
    "referencia" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entradas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_cuentas" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCuenta" NOT NULL,
    "monto" DECIMAL(65,30) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "saldoAnterior" DECIMAL(65,30),
    "saldoNuevo" DECIMAL(65,30),
    "descripcion" TEXT,
    "referenciaTipo" TEXT,
    "referenciaId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_clientes" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCliente" NOT NULL,
    "operacionId" TEXT,
    "entradaId" TEXT,
    "monedaTransaccion" "Moneda",
    "montoTransaccion" DECIMAL(65,30),
    "debitoCop" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditoCop" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "descripcion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_proveedores" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "tipo" "TipoMovimientoProveedor" NOT NULL,
    "operacionId" TEXT,
    "entradaId" TEXT,
    "monedaTransaccion" "Moneda",
    "montoTransaccion" DECIMAL(65,30),
    "debitoCop" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditoCop" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "descripcion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_codigo_key" ON "operaciones"("codigo");

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_cuentaOperativaId_fkey" FOREIGN KEY ("cuentaOperativaId") REFERENCES "cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas" ADD CONSTRAINT "entradas_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuentas" ADD CONSTRAINT "movimientos_cuentas_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_clientes" ADD CONSTRAINT "movimientos_clientes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_clientes" ADD CONSTRAINT "movimientos_clientes_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_clientes" ADD CONSTRAINT "movimientos_clientes_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "entradas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_proveedores" ADD CONSTRAINT "movimientos_proveedores_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_proveedores" ADD CONSTRAINT "movimientos_proveedores_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_proveedores" ADD CONSTRAINT "movimientos_proveedores_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "entradas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
