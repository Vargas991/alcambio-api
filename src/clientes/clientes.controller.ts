import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { RolUsuario } from '../../generated/prisma/client';

import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { UpdateEstadoClienteDto } from './dto/update-estado-cliente.dto';
import { FilterClienteLedgerDto } from './dto/filter-cliente-ledger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { successResponse } from '../common/responses/api-responses';
import { ClienteLedgerPdfService } from './pdf/cliente-ledger-pdf.service';
import { FilterClientesCarteraDto } from './dto/filter-clientes-cartera.dto';
import { AjustarSaldoClienteDto } from './dto/ajustar-saldo-cliente.dto';
import {
  TenantContext,
  requireTenantId,
} from '../common/tenant/tenant-context.decorator';
import type { TenantContextValue } from '../common/tenant/tenant-context.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly clientesLedgerPdfService: ClienteLedgerPdfService,
  ) {}

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Post()
  async create(
    @TenantContext() context: TenantContextValue,
    @Body() dto: CreateClienteDto,
  ) {
    const data = await this.clientesService.create(dto, requireTenantId(context));
    return successResponse(data, 'Cliente creado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get()
  async findAll(
    @TenantContext() context: TenantContextValue,
    @Query('nombre') nombre?: string
  ) {
    const data = await this.clientesService.findAll(
      nombre,
      requireTenantId(context),
    );
    return successResponse(data, 'Clientes encontrados correctamente.');
  }
  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get('cartera')
  async getCartera(
    @TenantContext() context: TenantContextValue,
    @Query() filters: FilterClientesCarteraDto,
  ) {
    const data = await this.clientesService.getCartera(
      filters,
      requireTenantId(context),
    );

    return successResponse(
      data,
      'Cartera de clientes consultada correctamente.',
    );
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Patch(':id/estado')
  async updateEstado(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateEstadoClienteDto,
  ) {
    const data = await this.clientesService.updateEstado(
      id,
      dto,
      requireTenantId(context),
    );
    return successResponse(
      data,
      'Estado del cliente actualizado correctamente.',
    );
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/balance')
  async getBalance(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
  ) {
    const data = await this.clientesService.getBalance(
      id,
      requireTenantId(context),
    );
    return successResponse(
      data,
      'Balance del cliente encontrado correctamente.',
    );
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/ledger')
  async getLedger(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
    @Query() filters: FilterClienteLedgerDto,
  ) {
    const data = await this.clientesService.getLedger(
      id,
      filters,
      requireTenantId(context),
    );
    return successResponse(
      data,
      'Libro mayor del cliente encontrado correctamente.',
    );
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/perfil')
  async getPerfil(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
  ) {
    const data = await this.clientesService.getPerfil(
      id,
      requireTenantId(context),
    );
    return successResponse(
      data,
      'Perfil del cliente encontrado correctamente.',
    );
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id/ledger/pdf')
  async getLedgerPdf(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
    @Query() filters: FilterClienteLedgerDto,
    @Res() res: Response,
  ) {
    const ledger = await this.clientesService.getLedger(
      id,
      filters,
      requireTenantId(context),
    );
    const pdfBuffer = await this.clientesLedgerPdfService.generate(ledger);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ledger-cliente-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Patch(':id/ajustar-saldo')
  async ajustarSaldo(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
    @Body() dto: AjustarSaldoClienteDto,
  ) {
    const data = await this.clientesService.ajustarSaldo(
      id,
      dto,
      requireTenantId(context),
    );
    return successResponse(data, "Ajuste realizado satisfactoriamente.")
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  @Patch(':id')
  async update(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    const data = await this.clientesService.update(
      id,
      dto,
      requireTenantId(context),
    );
    return successResponse(data, 'Cliente actualizado correctamente.');
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR, RolUsuario.VISOR)
  @Get(':id')
  async findOne(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
  ) {
    const data = await this.clientesService.findOne(
      id,
      requireTenantId(context),
    );
    return successResponse(data, 'Cliente encontrado correctamente.');
  }

  @Roles(RolUsuario.ADMIN)
  @Delete(':id')
  async remove(
    @TenantContext() context: TenantContextValue,
    @Param('id') id: string,
  ) {
    const data = await this.clientesService.remove(id, requireTenantId(context));
    return successResponse(data, 'Cliente inactivado correctamente.');
  }
}
