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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule, CuentasModule, AuthModule, UsuariosModule, ClientesModule, OperacionesModule, EntradasModule, SalidasModule, DashboardModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
