import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../../generated/prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActualizarConfiguracionOrganizacionDto } from '../configuracion/dto/actualizar-configuracion-organizacion.dto';
import { CreateTenantUsuarioDto } from './dto/create-tenant-usuario.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { RegistrarPagoTenantDto } from './dto/registrar-pago-tenant.dto';
import { UpdateTenantUsuarioDto } from './dto/update-tenant-usuario.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPER_ADMIN)
@Controller('super-admin/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Get(':id/configuracion')
  obtenerConfiguracion(@Param('id') id: string) {
    return this.tenantsService.obtenerConfiguracion(id);
  }

  @Patch(':id/configuracion')
  actualizarConfiguracion(
    @Param('id') id: string,
    @Body() dto: ActualizarConfiguracionOrganizacionDto,
  ) {
    return this.tenantsService.actualizarConfiguracion(id, dto);
  }

  @Get(':id/pagos')
  listarPagos(@Param('id') id: string) {
    return this.tenantsService.listarPagos(id);
  }

  @Post(':id/pagos')
  registrarPago(
    @Param('id') id: string,
    @Body() dto: RegistrarPagoTenantDto,
  ) {
    return this.tenantsService.registrarPago(id, dto);
  }

  @Get(':tenantId/usuarios')
  listarUsuarios(@Param('tenantId') tenantId: string) {
    return this.tenantsService.listarUsuarios(tenantId);
  }

  @Post(':tenantId/usuarios')
  crearUsuario(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTenantUsuarioDto,
  ) {
    return this.tenantsService.crearUsuario(tenantId, dto);
  }

  @Patch(':tenantId/usuarios/:userId')
  actualizarUsuario(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTenantUsuarioDto,
  ) {
    return this.tenantsService.actualizarUsuario(tenantId, userId, dto);
  }
}
