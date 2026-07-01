import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RolUsuario } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { successResponse } from 'src/common/responses/api-responses';
import { FilterClienteLedgerDto } from './dto/filter-cliente-ledger';
import { UpdateEstadoClienteDto } from './dto/update-estado-cliente.dto';


@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(@Body() createClienteDto: CreateClienteDto) {
    const data = await this.clientesService.create(createClienteDto);

    return successResponse(data, 'Cliente creado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll() {
    const data = await this.clientesService.findAll();

    return successResponse(data, 'Clientes encontrados correctamente.');
  }

  /**
   * Importante:
   * Estas rutas específicas van antes de @Get(':id')
   */

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/perfil')
  async getPerfil(@Param('id') id: string) {
    const data = await this.clientesService.getPerfil(id);

    return successResponse(data, 'Perfil del cliente encontrado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/ledger')
  async getLedger(
    @Param('id') id: string,
    @Query() filters: FilterClienteLedgerDto,
  ) {
    const data = await this.clientesService.getLedger(id, filters);

    return successResponse(
      data,
      'Libro mayor del cliente encontrado correctamente.',
    );
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/balance')
  async getBalance(@Param('id') id: string) {
    const data = await this.clientesService.getBalance(id);

    return successResponse(data, 'Balance del cliente encontrado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Patch(':id/estado')
  async updateEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoClienteDto,
  ) {
    const data = await this.clientesService.updateEstado(id, dto);

    return successResponse(data, 'Estado del cliente actualizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.clientesService.findOne(id);

    return successResponse(data, 'Cliente encontrado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateClienteDto: UpdateClienteDto,
  ) {
    const data = await this.clientesService.update(id, updateClienteDto);

    return successResponse(data, 'Cliente actualizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const data = await this.clientesService.remove(id);

    return successResponse(data, 'Cliente inactivado correctamente.');
  }
}