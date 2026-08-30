import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ConfigModule } from '@nestjs/config';
import { ClientesModule } from './clientes/clientes.module';
import { OperacionesModule } from './operaciones/operaciones.module';
import { EntradasModule } from './entradas/entradas.module';
import { SalidasModule } from './salidas/salidas.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TenantsModule } from './tenants/tenants.module';

import { join } from 'node:path';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),

      serveRoot: '/uploads',
    }),
    PrismaModule,
    CuentasModule,
    AuthModule,
    UsuariosModule,
    ClientesModule,
    OperacionesModule,
    EntradasModule,
    SalidasModule,
    DashboardModule,
    ConfiguracionModule,
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
