import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('resumen')
  obtenerResumen(
    @Query('fecha') fecha?: string,
  ) {
    return this.dashboardService.obtenerResumen(
      fecha,
    );
  }
}