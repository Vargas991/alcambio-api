import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolUsuario } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  requireTenantId,
  TenantContext,
  type TenantContextValue,
} from '../common/tenant/tenant-context.decorator';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('resumen')
  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  obtenerResumen(
    @Query('fecha') fecha: string | undefined,
    @TenantContext() context: TenantContextValue,
  ) {
    return this.dashboardService.obtenerResumen(
      fecha,
      requireTenantId(context),
    );
  }
}
