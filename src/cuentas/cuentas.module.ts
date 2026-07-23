import { Module } from '@nestjs/common';
import { CuentasService } from './cuentas.service';
import { CuentasController } from './cuentas.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CuentasController],
  providers: [CuentasService],
  exports: [
    CuentasService,
  ],
})
export class CuentasModule {} 
