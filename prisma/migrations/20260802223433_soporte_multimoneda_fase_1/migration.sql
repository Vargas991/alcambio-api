-- CreateEnum
CREATE TYPE "MetodoCalculoOperacion" AS ENUM ('TASA', 'PORCENTAJE');

-- CreateEnum
CREATE TYPE "AplicacionPorcentaje" AS ENUM ('SUMAR', 'DESCONTAR');

-- AlterTable
ALTER TABLE "entradas" ADD COLUMN     "monedaAplicacion" "Moneda" NOT NULL DEFAULT 'COP',
ADD COLUMN     "monedaPago" "Moneda" NOT NULL DEFAULT 'COP',
ADD COLUMN     "montoAplicado" DECIMAL(18,6),
ADD COLUMN     "montoPago" DECIMAL(18,6),
ADD COLUMN     "tasaConversion" DECIMAL(18,8);

-- AlterTable
ALTER TABLE "movimientos_clientes" ADD COLUMN     "credito" DECIMAL(18,6),
ADD COLUMN     "debito" DECIMAL(18,6),
ADD COLUMN     "moneda" "Moneda" NOT NULL DEFAULT 'COP';

-- AlterTable
ALTER TABLE "operaciones" ADD COLUMN     "aplicacionPorcentaje" "AplicacionPorcentaje",
ADD COLUMN     "metodoCalculo" "MetodoCalculoOperacion" NOT NULL DEFAULT 'TASA',
ADD COLUMN     "monedaBaseHistorica" "Moneda" NOT NULL DEFAULT 'COP',
ADD COLUMN     "monedaDeuda" "Moneda" NOT NULL DEFAULT 'COP',
ADD COLUMN     "montoComision" DECIMAL(18,6),
ADD COLUMN     "montoDeuda" DECIMAL(18,6),
ADD COLUMN     "montoResultado" DECIMAL(18,6),
ADD COLUMN     "porcentaje" DECIMAL(8,4),
ADD COLUMN     "tasaConversionBase" DECIMAL(18,8);

-- AlterTable
ALTER TABLE "salidas" ADD COLUMN     "monedaAplicacion" "Moneda" NOT NULL DEFAULT 'COP',
ADD COLUMN     "monedaPago" "Moneda" NOT NULL DEFAULT 'COP',
ADD COLUMN     "montoAplicado" DECIMAL(18,6),
ADD COLUMN     "montoPago" DECIMAL(18,6),
ADD COLUMN     "tasaConversion" DECIMAL(18,8);
