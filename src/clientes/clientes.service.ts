import { BadRequestException, Injectable } from '@nestjs/common';
import { EstadoEntidad, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { FilterClienteLedgerDto } from './dto/filter-cliente-ledger';
import { UpdateEstadoClienteDto } from './dto/update-estado-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClienteDto) {
    return this.prisma.cliente.create({
      data: {
        nombre: dto.nombre,
        documento: dto.documento,
        telefono: dto.telefono,
        notas: dto.notas,
      },
    });
  }

  async findAll() {
    return this.prisma.cliente.findMany({
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    return cliente;
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        documento: dto.documento,
        telefono: dto.telefono,
        notas: dto.notas,
      },
    });
  }

  async updateEstado(id: string, dto: UpdateEstadoClienteDto) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: { id },
      data: {
        estado: dto.estado,
      },
    });
  }

  async remove(id: string) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: { id },
      data: {
        estado: EstadoEntidad.INACTIVO,
      },
    });
  }

  async getBalance(id: string) {
    await this.validarClienteExiste(id);

    const movimientos = await this.prisma.movimientoCliente.findMany({
      where: {
        clienteId: id,
      },
    });

    const totalDebitosCop = movimientos.reduce(
      (acc, mov) => acc + Number(mov.debitoCop),
      0,
    );

    const totalCreditosCop = movimientos.reduce(
      (acc, mov) => acc + Number(mov.creditoCop),
      0,
    );

    const saldoCop = totalDebitosCop - totalCreditosCop;

    return {
      clienteId: id,
      totalDebitosCop,
      totalCreditosCop,
      saldoCop,
      estado: this.obtenerEstadoBalance(saldoCop),
    };
  }

  async getLedger(id: string, filters: FilterClienteLedgerDto) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        documento: true,
        telefono: true,
        estado: true,
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    const where: Prisma.MovimientoClienteWhereInput = {
      clienteId: id,
    };

    if (filters.tipo) {
      where.tipo = filters.tipo;
    }

    if (filters.moneda) {
      where.monedaTransaccion = filters.moneda;
    }

    if (filters.desde || filters.hasta) {
      where.creadoEn = {};

      if (filters.desde) {
        where.creadoEn.gte = new Date(filters.desde);
      }

      if (filters.hasta) {
        const hasta = new Date(filters.hasta);
        hasta.setHours(23, 59, 59, 999);
        where.creadoEn.lte = hasta;
      }
    }

    const movimientos = await this.prisma.movimientoCliente.findMany({
      where,
      orderBy: {
        creadoEn: 'desc',
      },
      include: {
        operacion: {
          include: {
            deudor: {
              select: {
                id: true,
                nombre: true,
              },
            },
            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },
            cuentaOperativa: {
              select: {
                id: true,
                nombre: true,
                moneda: true,
              },
            },
          },
        },
        entrada: {
          include: {
            deudor: {
              select: {
                id: true,
                nombre: true,
              },
            },
            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },
            cuenta: {
              select: {
                id: true,
                nombre: true,
                moneda: true,
              },
            },
          },
        },
      },
    });

    const totalDebitosCop = movimientos.reduce(
      (acc, mov) => acc + Number(mov.debitoCop),
      0,
    );

    const totalCreditosCop = movimientos.reduce(
      (acc, mov) => acc + Number(mov.creditoCop),
      0,
    );

    const saldoFiltradoCop = totalDebitosCop - totalCreditosCop;

    return {
      cliente,
      filtros: {
        desde: filters.desde ?? null,
        hasta: filters.hasta ?? null,
        tipo: filters.tipo ?? null,
        moneda: filters.moneda ?? null,
      },
      resumen: {
        totalDebitosCop,
        totalCreditosCop,
        saldoFiltradoCop,
        estado: this.obtenerEstadoBalance(saldoFiltradoCop),
      },
      movimientos,
    };
  }

  async getPerfil(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        movimientos: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            operacion: true,
            entrada: true,
          },
        },
        operacionesComoDeudor: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            cuentaOperativa: true,
            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        operacionesComoAcreedor: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            cuentaOperativa: true,
            deudor: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        entradasComoDeudor: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            cuenta: true,
            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        entradasComoAcreedor: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            cuenta: true,
            deudor: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    const totalDebitosCop = cliente.movimientos.reduce(
      (acc, mov) => acc + Number(mov.debitoCop),
      0,
    );

    const totalCreditosCop = cliente.movimientos.reduce(
      (acc, mov) => acc + Number(mov.creditoCop),
      0,
    );

    const saldoCop = totalDebitosCop - totalCreditosCop;

    return {
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        documento: cliente.documento,
        telefono: cliente.telefono,
        notas: cliente.notas,
        estado: cliente.estado,
        creadoEn: cliente.creadoEn,
        actualizadoEn: cliente.actualizadoEn,
      },
      balance: {
        totalDebitosCop,
        totalCreditosCop,
        saldoCop,
        estado: this.obtenerEstadoBalance(saldoCop),
      },
      ultimosMovimientos: cliente.movimientos,
      ultimasOperacionesComoDeudor: cliente.operacionesComoDeudor,
      ultimasOperacionesComoAcreedor: cliente.operacionesComoAcreedor,
      ultimasEntradasComoDeudor: cliente.entradasComoDeudor,
      ultimasEntradasComoAcreedor: cliente.entradasComoAcreedor,
    };
  }

  private async validarClienteExiste(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    return cliente;
  }

  private obtenerEstadoBalance(saldoCop: number) {
    if (saldoCop > 0) {
      return 'ME_DEBE';
    }

    if (saldoCop < 0) {
      return 'LE_DEBO';
    }

    return 'SALDADO';
  }
}