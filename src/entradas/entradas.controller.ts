import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { RolUsuario } from '../../generated/prisma/client';

import { EntradasService } from './entradas.service';
import { CreateEntradaDto } from './dto/create-entrada.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { successResponse } from '../common/responses/api-responses';
import { CancelarEntradaDto } from './dto/cancelar-entrada.dto';
import { UpdateEntradaDto } from './dto/update-entrada.dto';
import {
  requireTenantId,
  TenantContext,
  type TenantContextValue,
} from '../common/tenant/tenant-context.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('entradas')
export class EntradasController {
  constructor(private readonly entradasService: EntradasService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(
    @Body() dto: CreateEntradaDto,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.entradasService.create(dto, requireTenantId(context));
    return successResponse(data, 'Entrada registrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll(@TenantContext() context: TenantContextValue) {
    const data = await this.entradasService.findAll(requireTenantId(context));
    return successResponse(data, 'Entradas encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarEntradaDto,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.entradasService.cancelar(
      id,
      dto,
      requireTenantId(context),
    );
    return successResponse(data, 'Entrada cancelada correctamente.');
  }

  @Put(':id')
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateEntradaDto,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await  this.entradasService.editar(
      id,
      dto,
      requireTenantId(context),
    );
    return successResponse(data, "Entrada editada con Exito.")
  }

  @Delete(':id')
  async eliminar(
    @Param('id') id: string,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.entradasService.eliminar(id, requireTenantId(context));
    return successResponse(data, "Entrada Eliminada con Exito.")
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @TenantContext() context: TenantContextValue,
  ) {
    const data = await this.entradasService.findOne(id, requireTenantId(context));
    return successResponse(data, 'Entrada encontrada correctamente.');
  }
}
