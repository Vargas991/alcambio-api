import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RolUsuario } from '../../generated/prisma/client';

import { OperacionesService } from './operaciones.service';
import { CreateOperacionDto } from './dto/create-operacion.dto';
import { CancelarOperacionDto } from './dto/cancelar-operacion.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { successResponse } from '../common/responses/api-responses';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operaciones')
export class OperacionesController {
  constructor(private readonly operacionesService: OperacionesService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(@Body() dto: CreateOperacionDto) {
    const data = await this.operacionesService.create(dto);
    return successResponse(data, 'Operación registrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll() {
    const data = await this.operacionesService.findAll();
    return successResponse(data, 'Operaciones encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.operacionesService.findOne(id);
    return successResponse(data, 'Operación encontrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarOperacionDto,
  ) {
    const data = await this.operacionesService.cancelar(id, dto);
    return successResponse(data, 'Operación cancelada correctamente.');
  }
}