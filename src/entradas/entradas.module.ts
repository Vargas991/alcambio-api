import { Module } from '@nestjs/common';
import { EntradasService } from './entradas.service';
import { EntradasController } from './entradas.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EntradasController],
  providers: [EntradasService],
})
export class EntradasModule {}
