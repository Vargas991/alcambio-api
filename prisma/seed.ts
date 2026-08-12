import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL no está definida.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
});

// ======================================================
// Variables de entorno
// ======================================================

const adminName = process.env.SEED_ADMIN_NAME ?? 'Administrador';
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@alcambio.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '123456';

const organizationName =
  process.env.SEED_ORGANIZATION_NAME ?? 'Mi organización';

const organizationTimezone =
  process.env.SEED_ORGANIZATION_TIMEZONE ?? 'America/Caracas';

async function main() {
  console.log('🌱 Ejecutando seed...');

  // ======================================================
  // Usuario administrador
  // ======================================================

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.usuario.upsert({
    where: {
      correo: adminEmail,
    },
    update: {
      nombre: adminName,
      password: passwordHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
    },
    create: {
      nombre: adminName,
      correo: adminEmail,
      password: passwordHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
    },
  });

  console.log('✅ Usuario administrador creado/actualizado:', {
    id: admin.id,
    correo: admin.correo,
    rol: admin.rol,
  });

  // ======================================================
  // Configuración de organización
  // ======================================================

  const configuracionExistente =
    await prisma.configuracionOrganizacion.findFirst();

  if (configuracionExistente) {
    const configuracion =
      await prisma.configuracionOrganizacion.update({
        where: {
          id: configuracionExistente.id,
        },
        data: {
          nombre: organizationName,
          zonaHoraria: organizationTimezone,
        },
      });

    console.log('✅ Configuración de organización actualizada:', {
      id: configuracion.id,
      nombre: configuracion.nombre,
      zonaHoraria: configuracion.zonaHoraria,
    });
  } else {
    const configuracion =
      await prisma.configuracionOrganizacion.create({
        data: {
          nombre: organizationName,
          zonaHoraria: organizationTimezone,
        },
      });

    console.log('✅ Configuración de organización creada:', {
      id: configuracion.id,
      nombre: configuracion.nombre,
      zonaHoraria: configuracion.zonaHoraria,
    });
  }

  console.log('🌱 Seed completado correctamente.');
}

main()
  .catch((error) => {
    console.error('❌ Error ejecutando seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });