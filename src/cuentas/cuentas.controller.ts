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

import { CuentasService } from './cuentas.service';
import { CreateCuentaDto } from './dto/create-cuenta.dto';
import { AjustarSaldoCuentaDto } from './dto/ajustar-saldo-cuenta.dto';
import { UpdateEstadoCuentaDto } from './dto/update-estado-cuenta.dto';
import { CreateGastoCuentaDto } from './dto/create-gasto-cuenta.dto';
import { CreateTrasladoCuentaDto } from './dto/create-traslado-cuenta.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { successResponse } from '../common/responses/api-responses';
import { UpdateCuentaDto } from './dto/update-cuenta.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cuentas')
export class CuentasController {
  constructor(private readonly cuentasService: CuentasService) {}

  @Roles(RolUsuario.ADMIN)
  @Post()
  async create(@Body() createCuentaDto: CreateCuentaDto) {
    const data = await this.cuentasService.create(createCuentaDto);
    return successResponse(data, 'Cuenta creada correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll() {
    const data = await this.cuentasService.findAll();
    return successResponse(data, 'Cuentas encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get('base')
  async findBase() {
    const data = await this.cuentasService.findBase();
    return successResponse(data, 'Cuentas base encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get('operativas')
  async findOperativas() {
    const data = await this.cuentasService.findOperativas();
    return successResponse(data, 'Cuentas operativas encontradas correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/movimientos')
  async getMovimientos(@Param('id') id: string) {
    const data = await this.cuentasService.getMovimientos(id);
    return successResponse(data, 'Movimientos de cuenta encontrados correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.cuentasService.findOne(id);
    return successResponse(data, 'Cuenta encontrada correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/estado')
  async updateEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoCuentaDto,
  ) {
    const data = await this.cuentasService.updateEstado(id, dto);
    return successResponse(data, 'Estado de la cuenta actualizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/ajustar-saldo')
  async ajustarSaldo(
    @Param('id') id: string,
    @Body() dto: AjustarSaldoCuentaDto,
  ) {
    const data = await this.cuentasService.ajustarSaldo(id, dto);
    return successResponse(data, 'Saldo de la cuenta ajustado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post(':id/gasto')
  async registrarGasto(
    @Param('id') id: string,
    @Body() dto: CreateGastoCuentaDto,
  ) {
    const data = await this.cuentasService.registrarGasto(id, dto);
    return successResponse(data, 'Gasto registrado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post('traslado')
  async trasladar(@Body() dto: CreateTrasladoCuentaDto) {
    const data = await this.cuentasService.trasladar(dto);
    return successResponse(data, 'Traslado realizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCuentaDto) {
    const data = await this.cuentasService.update(id, dto);
    return successResponse(data, 'Cuenta actualizada correctamente.');
  }
}