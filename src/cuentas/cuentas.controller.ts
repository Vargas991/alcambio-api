import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CuentasService } from './cuentas.service';
import { CreateCuentaDto } from './dto/create-cuenta.dto';
import { AjustarSaldoCuentaDto } from './dto/ajustar-saldo-cuenta.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { RolUsuario } from 'generated/prisma/enums';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { successResponse } from 'src/common/responses/api-responses';

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
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.cuentasService.findOne(id);
    return successResponse(data, 'Cuenta encontrada correctamente.');
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
}