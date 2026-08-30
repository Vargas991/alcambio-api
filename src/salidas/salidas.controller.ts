import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { RolUsuario } from '../../generated/prisma/client';

import { SalidasService } from './salidas.service';
import { CreateSalidaDto } from './dto/create-salida.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { successResponse } from '../common/responses/api-responses';
import { CancelarSalidaDto } from './dto/cancelar-salida.dto';
import { UpdateSalidaDto } from './dto/update-salida.dto';
import {
  requireTenantId,
  TenantContext,
  type TenantContextValue,
} from '../common/tenant/tenant-context.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('salidas')
export class SalidasController {
  constructor(private readonly salidasService: SalidasService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(
    @Body() dto: CreateSalidaDto,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.salidasService.create(dto, requireTenantId(context));
    return successResponse(data, 'Salida registrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll(@TenantContext() context: TenantContextValue) {
    const data = await this.salidasService.findAll(requireTenantId(context));
    return successResponse(data, 'Salidas encontradas correctamente.');
  }

  @Put(':id')
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateSalidaDto,
    @TenantContext() context: TenantContextValue,
  ) {
   const data = await this.salidasService.editar(id, dto, requireTenantId(context));
    return successResponse(data, "Salida editada Correctamente.")
  }

  @Delete(':id')
  async eliminar(
    @Param('id') id: string,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.salidasService.eliminar(id, requireTenantId(context));
    return successResponse(data, "Salidad eliminada correctamente.")
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarSalidaDto,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.salidasService.cancelar(
      id,
      dto,
      requireTenantId(context),
    );
    return successResponse(data, 'Salida cancelada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.salidasService.findOne(id, requireTenantId(context));
    return successResponse(data, 'Salida encontrada correctamente.');
  }
}
