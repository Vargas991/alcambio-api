-- CreateTable
CREATE TABLE "ConfiguracionOrganizacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "logoUrl" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "direccion" TEXT,
    "monedaBase" "Moneda" NOT NULL DEFAULT 'COP',
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Caracas',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionOrganizacion_pkey" PRIMARY KEY ("id")
);
