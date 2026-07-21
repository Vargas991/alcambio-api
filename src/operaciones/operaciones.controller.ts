import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
import { FilterOperacionesDto } from './dto/filter-operaciones.dto';
import { UpdateOperacionDto } from './dto/update-operacione.dto';

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
  async findAll( @Query() filters: FilterOperacionesDto) {
    const data = await this.operacionesService.findAll(filters);
    return successResponse(data, 'Operaciones encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.operacionesService.findOne(id);
    return successResponse(data, 'Operación encontrada correctamente.');
  }

  @Put(':id')
  async editar(
    @Param('id') id: string,
    @Body() dto: UpdateOperacionDto,
  ) {
    const data = await this.operacionesService.editar(id, dto);
    return successResponse(data, "Operacion Editada exitosamente")
  }

  @Roles(RolUsuario.ADMIN)
  @Delete(':id')
  eliminar(@Param('id') id: string) {
  return this.operacionesService.cancelar(id, {
    motivo: 'Eliminación de operación',
  });
}
}