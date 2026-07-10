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

import { EntradasService } from './entradas.service';
import { CreateEntradaDto } from './dto/create-entrada.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { successResponse } from '../common/responses/api-responses';
import { CancelarEntradaDto } from './dto/cancelar-entrada.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('entradas')
export class EntradasController {
  constructor(private readonly entradasService: EntradasService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(@Body() dto: CreateEntradaDto) {
    const data = await this.entradasService.create(dto);
    return successResponse(data, 'Entrada registrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll() {
    const data = await this.entradasService.findAll();
    return successResponse(data, 'Entradas encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarEntradaDto,
  ) {
    const data = await this.entradasService.cancelar(id, dto);
    return successResponse(data, 'Entrada cancelada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.entradasService.findOne(id);
    return successResponse(data, 'Entrada encontrada correctamente.');
  }
}