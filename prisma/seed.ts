import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL no esta definida.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
});

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} no esta definida.`);
  }

  return value;
}

async function main() {
  const tenantNombre = process.env.SEED_TENANT_NAME?.trim() || 'AlCambio';
  const tenantSlug = process.env.SEED_TENANT_SLUG?.trim() || 'default';
  const adminNombre = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';
  const adminEmail = requiredEnv('SEED_ADMIN_EMAIL');
  const adminPassword = requiredEnv('SEED_ADMIN_PASSWORD');
  const superAdminNombre =
    process.env.SEED_SUPER_ADMIN_NAME?.trim() || 'Super Administrador';
  const superAdminEmail = requiredEnv('SEED_SUPER_ADMIN_EMAIL');
  const superAdminPassword = requiredEnv('SEED_SUPER_ADMIN_PASSWORD');

  const tenant = await prisma.tenant.upsert({
    where: {
      slug: tenantSlug,
    },
    update: {
      nombre: tenantNombre,
      activo: true,
    },
    create: {
      nombre: tenantNombre,
      slug: tenantSlug,
      activo: true,
    },
  });

  await prisma.configuracionOrganizacion.upsert({
    where: {
      tenantId: tenant.id,
    },
    update: {
      nombre: tenantNombre,
    },
    create: {
      tenantId: tenant.id,
      nombre: tenantNombre,
      monedaBase: 'COP',
      zonaHoraria: 'America/Caracas',
    },
  });

  const admin = await prisma.usuario.upsert({
    where: {
      correo: adminEmail,
    },
    update: {
      nombre: adminNombre,
      password: await bcrypt.hash(adminPassword, 10),
      rol: 'ADMIN',
      estado: 'ACTIVO',
      tenantId: tenant.id,
    },
    create: {
      nombre: adminNombre,
      correo: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      rol: 'ADMIN',
      estado: 'ACTIVO',
      tenantId: tenant.id,
    },
  });

  const superAdmin = await prisma.usuario.upsert({
    where: {
      correo: superAdminEmail,
    },
    update: {
      nombre: superAdminNombre,
      password: await bcrypt.hash(superAdminPassword, 10),
      rol: 'SUPER_ADMIN',
      estado: 'ACTIVO',
      tenantId: null,
    },
    create: {
      nombre: superAdminNombre,
      correo: superAdminEmail,
      password: await bcrypt.hash(superAdminPassword, 10),
      rol: 'SUPER_ADMIN',
      estado: 'ACTIVO',
      tenantId: null,
    },
  });

  console.log('Seed tenant/configuracion/usuarios listo:', {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
    },
    admin: {
      id: admin.id,
      correo: admin.correo,
      rol: admin.rol,
      tenantId: admin.tenantId,
    },
    superAdmin: {
      id: superAdmin.id,
      correo: superAdmin.correo,
      rol: superAdmin.rol,
      tenantId: superAdmin.tenantId,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
