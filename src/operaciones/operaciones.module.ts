import { Module } from '@nestjs/common';
import { OperacionesService } from './operaciones.service';
import { OperacionesController } from './operaciones.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OperacionesController],
  providers: [OperacionesService],
})
export class OperacionesModule {}
