import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RolUsuario } from '../../generated/prisma/client';

import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateEstadoUsuarioDto } from './dto/update-estado-usuario.dto';
import { UpdatePasswordUsuarioDto } from './dto/update-password-usuario.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { successResponse } from '../common/responses/api-responses';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Roles(RolUsuario.ADMIN)
  @Post()
  async create(@Body() dto: CreateUsuarioDto) {
    const data = await this.usuariosService.create(dto);
    return successResponse(data, 'Usuario creado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Get()
  async findAll() {
    const data = await this.usuariosService.findAll();
    return successResponse(data, 'Usuarios encontrados correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.usuariosService.findOne(id);
    return successResponse(data, 'Usuario encontrado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    const data = await this.usuariosService.update(id, dto);
    return successResponse(data, 'Usuario actualizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/estado')
  async updateEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoUsuarioDto,
  ) {
    const data = await this.usuariosService.updateEstado(id, dto);
    return successResponse(data, 'Estado del usuario actualizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Patch(':id/password')
  async updatePassword(
    @Param('id') id: string,
    @Body() dto: UpdatePasswordUsuarioDto,
  ) {
    const data = await this.usuariosService.updatePassword(id, dto);
    return successResponse(data, 'Contraseña del usuario actualizada correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const data = await this.usuariosService.remove(id);
    return successResponse(data, 'Usuario inactivado correctamente.');
  }
}