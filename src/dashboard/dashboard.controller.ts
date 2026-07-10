import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RolUsuario } from '../../generated/prisma/client';

import { DashboardService } from './dashboard.service';
import { FilterDashboardDto } from './dto/filter-dashboard.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { successResponse } from '../common/responses/api-responses';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async getResumen(@Query() filters: FilterDashboardDto) {
    const data = await this.dashboardService.getResumen(filters);

    return successResponse(
      data,
      'Dashboard consultado correctamente.',
    );
  }
}