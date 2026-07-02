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

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  const admin = await prisma.usuario.upsert({
    where: {
      correo: 'admin@alcambio.com',
    },
    update: {
      nombre: 'Administrador',
      password: passwordHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
    },
    create: {
      nombre: 'Administrador',
      correo: 'admin@alcambio.com',
      password: passwordHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
    },
  });

  console.log('Usuario admin creado/actualizado:', {
    id: admin.id,
    correo: admin.correo,
    rol: admin.rol,
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