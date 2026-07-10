-- CreateEnum
CREATE TYPE "TipoSalida" AS ENUM ('PAGO_ACREEDOR', 'GASTO', 'RETIRO');

-- AlterTable
ALTER TABLE "movimientos_clientes" ADD COLUMN     "salidaId" TEXT;

-- CreateTable
CREATE TABLE "salidas" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSalida" NOT NULL,
    "acreedorId" TEXT,
    "cuentaId" TEXT NOT NULL,
    "montoCop" DECIMAL(65,30) NOT NULL,
    "descripcion" TEXT,
    "referencia" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salidas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "salidas" ADD CONSTRAINT "salidas_acreedorId_fkey" FOREIGN KEY ("acreedorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salidas" ADD CONSTRAINT "salidas_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_clientes" ADD CONSTRAINT "movimientos_clientes_salidaId_fkey" FOREIGN KEY ("salidaId") REFERENCES "salidas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
