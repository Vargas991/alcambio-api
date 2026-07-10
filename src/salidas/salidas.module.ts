import { Module } from '@nestjs/common';
import { SalidasService } from './salidas.service';
import { SalidasController } from './salidas.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalidasController],
  providers: [SalidasService],
})
export class SalidasModule {}
