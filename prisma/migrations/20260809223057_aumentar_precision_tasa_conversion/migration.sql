-- AlterTable
ALTER TABLE "entradas" ALTER COLUMN "tasaConversion" SET DATA TYPE DECIMAL(30,16);

-- AlterTable
ALTER TABLE "operaciones" ALTER COLUMN "tasaConversionBase" SET DATA TYPE DECIMAL(30,16);

-- AlterTable
ALTER TABLE "salidas" ALTER COLUMN "tasaConversion" SET DATA TYPE DECIMAL(30,16);
