import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CuentasModule } from 'src/cuentas/cuentas.module';

@Module({
  imports: [PrismaModule, CuentasModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
