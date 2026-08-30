import { Module } from '@nestjs/common';

import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [PrismaModule, ConfiguracionModule, UsuariosModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
