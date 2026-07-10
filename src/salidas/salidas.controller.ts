import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('salidas')
export class SalidasController {
  constructor(private readonly salidasService: SalidasService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(@Body() dto: CreateSalidaDto) {
    const data = await this.salidasService.create(dto);
    return successResponse(data, 'Salida registrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll() {
    const data = await this.salidasService.findAll();
    return successResponse(data, 'Salidas encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post(':id/cancelar')
  async cancelar(@Param('id') id: string, @Body() dto: CancelarSalidaDto) {
    const data = await this.salidasService.cancelar(id, dto);
    return successResponse(data, 'Salida cancelada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.salidasService.findOne(id);
    return successResponse(data, 'Salida encontrada correctamente.');
  }

}