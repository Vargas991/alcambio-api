import { BadRequestException, Injectable } from '@nestjs/common';

import {
  EstadoEntidad,
  Prisma,
  TipoOperacion,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { FilterClienteLedgerDto } from './dto/filter-cliente-ledger';
import { UpdateEstadoClienteDto } from './dto/update-estado-cliente.dto';
import { FilterClientesCarteraDto } from './dto/filter-clientes-cartera.dto';
import {
  buildEndOfDayUtcFromLocal,
  buildStartOfDayUtcFromLocal,
} from 'src/common/helpers/date-range.helper';

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
      where: {
        id,
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    return cliente;
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: {
        id,
      },
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
      where: {
        id,
      },
      data: {
        estado: dto.estado,
      },
    });
  }

  async remove(id: string) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: {
        id,
      },
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
    where: {
      id,
    },
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

  const andConditions: Prisma.MovimientoClienteWhereInput[] = [
    {
      clienteId: id,
    },
  ];

  if (filters.tipoMov) {
    andConditions.push({
      tipo: filters.tipoMov,
    });
  }

  const puedeFiltrarPorOperacion =
    !filters.tipoMov || filters.tipoMov === 'OPERACION';

  if (puedeFiltrarPorOperacion && (filters.tipo || filters.estado)) {
    andConditions.push({
      operacion: {
        ...(filters.tipo && {
          tipo: filters.tipo,
        }),
        ...(filters.estado && {
          estado: filters.estado,
        }),
      },
    });
  }

  if (filters.moneda) {
    andConditions.push({
      monedaTransaccion: filters.moneda,
    });
  }

  if (filters.desde || filters.hasta) {
    const creadoEn: Prisma.DateTimeFilter = {};

    if (filters.desde) {
      creadoEn.gte = buildStartOfDayUtcFromLocal(filters.desde);
    }

    if (filters.hasta) {
      creadoEn.lte = buildEndOfDayUtcFromLocal(filters.hasta);
    }

    andConditions.push({
      creadoEn,
    });
  }

  const where: Prisma.MovimientoClienteWhereInput = {
    AND: andConditions,
  };

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
      salida: {
        include: {
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

  const movimientosTotales = await this.prisma.movimientoCliente.findMany({
    where: {
      clienteId: id,
    },
    select: {
      debitoCop: true,
      creditoCop: true,
    },
  });

  const totalDebitosGlobalCop = movimientosTotales.reduce(
    (acc, mov) => acc + Number(mov.debitoCop),
    0,
  );

  const totalCreditosGlobalCop = movimientosTotales.reduce(
    (acc, mov) => acc + Number(mov.creditoCop),
    0,
  );

  const saldoTotalCop = totalDebitosGlobalCop - totalCreditosGlobalCop;

  const totalUtilidadRealCop = movimientos.reduce((acc, mov) => {
    if (!mov.operacion) {
      return acc;
    }

    const generaUtilidadReal = this.operacionGeneraUtilidadReal(
      mov.operacion.tipo,
    );

    if (!generaUtilidadReal) {
      return acc;
    }

    return acc + Number(mov.operacion.utilidadCop ?? 0);
  }, 0);

  const utilidadPorDiaMap = new Map<string, number>();

  for (const mov of movimientos) {
    if (!mov.operacion) {
      continue;
    }

    const generaUtilidadReal = this.operacionGeneraUtilidadReal(
      mov.operacion.tipo,
    );

    if (!generaUtilidadReal) {
      continue;
    }

    const fecha = mov.creadoEn.toISOString().slice(0, 10);
    const utilidadCop = Number(mov.operacion.utilidadCop ?? 0);

    utilidadPorDiaMap.set(
      fecha,
      (utilidadPorDiaMap.get(fecha) ?? 0) + utilidadCop,
    );
  }

  const utilidadPorDia = Array.from(utilidadPorDiaMap.entries())
    .map(([fecha, utilidadCop]) => ({
      fecha,
      utilidadCop,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const movimientosOrdenadosAsc = [...movimientos].sort(
    (a, b) => a.creadoEn.getTime() - b.creadoEn.getTime(),
  );

  let saldoAcumuladoCop = 0;

  const movimientosConSaldo = movimientosOrdenadosAsc.map((mov) => {
    const debitoCop = Number(mov.debitoCop);
    const creditoCop = Number(mov.creditoCop);

    saldoAcumuladoCop += debitoCop - creditoCop;

    const utilidadRealCop =
      mov.operacion && this.operacionGeneraUtilidadReal(mov.operacion.tipo)
        ? Number(mov.operacion.utilidadCop ?? 0)
        : 0;

    return {
      ...mov,
      utilidadRealCop,
      saldoAcumuladoCop,
    };
  });

  const movimientosRespuesta = movimientosConSaldo.sort(
    (a, b) => b.creadoEn.getTime() - a.creadoEn.getTime(),
  );

  return {
    cliente,
    filtros: {
      desde: filters.desde ?? null,
      hasta: filters.hasta ?? null,
      tipo: filters.tipo ?? null,
      estado: filters.estado ?? null,
      tipoMov: filters.tipoMov ?? null,
      moneda: filters.moneda ?? null,
    },
    resumen: {
      totalDebitosCop,
      totalCreditosCop,
      saldoFiltradoCop,
      estado: this.obtenerEstadoBalance(saldoFiltradoCop),

      totalDebitosGlobalCop,
      totalCreditosGlobalCop,
      saldoTotalCop,
      estadoTotal: this.obtenerEstadoBalance(saldoTotalCop),

      totalUtilidadRealCop,
      utilidadPorDia,
    },
    movimientos: movimientosRespuesta,
  };
}

  async getCartera(filters: FilterClientesCarteraDto) {
    const where: Prisma.ClienteWhereInput = {};

    if (filters.buscar) {
      where.OR = [
        {
          nombre: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          documento: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          telefono: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
      ];
    }

    const clientes = await this.prisma.cliente.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        documento: true,
        telefono: true,
        estado: true,
        movimientos: {
          select: {
            debitoCop: true,
            creditoCop: true,
          },
        },
      },
      orderBy: {
        nombre: 'asc',
      },
    });

    const cartera = clientes
      .map((cliente) => {
        const totalDebitosCop = cliente.movimientos.reduce(
          (total, movimiento) => total + Number(movimiento.debitoCop),
          0,
        );

        const totalCreditosCop = cliente.movimientos.reduce(
          (total, movimiento) => total + Number(movimiento.creditoCop),
          0,
        );

        const saldoCop = totalDebitosCop - totalCreditosCop;

        return {
          cliente: {
            id: cliente.id,
            nombre: cliente.nombre,
            documento: cliente.documento,
            telefono: cliente.telefono,
            estado: cliente.estado,
          },
          totalDebitosCop,
          totalCreditosCop,
          saldoCop,
          estadoCartera: this.obtenerEstadoBalance(saldoCop),
        };
      })
      .filter((item) => item.saldoCop !== 0);

    const meDeben = cartera
      .filter((item) => item.saldoCop > 0)
      .sort((a, b) => b.saldoCop - a.saldoCop);

    const lesDebo = cartera
      .filter((item) => item.saldoCop < 0)
      .sort((a, b) => Math.abs(b.saldoCop) - Math.abs(a.saldoCop));

    const totalPorCobrarCop = meDeben.reduce(
      (total, item) => total + item.saldoCop,
      0,
    );

    const totalPorPagarCop = lesDebo.reduce(
      (total, item) => total + Math.abs(item.saldoCop),
      0,
    );

    return {
      resumen: {
        totalPorCobrarCop,
        totalPorPagarCop,
        balanceNetoCop: totalPorCobrarCop - totalPorPagarCop,
        cantidadMeDeben: meDeben.length,
        cantidadLesDebo: lesDebo.length,
      },
      meDeben,
      lesDebo,
    };
  }

  async getPerfil(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
      include: {
        movimientos: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            operacion: true,
            entrada: true,
            salida: true,
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
        salidasComoAcreedor: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,
          include: {
            cuenta: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    const movimientosBalance = await this.prisma.movimientoCliente.findMany({
      where: {
        clienteId: id,
      },
      select: {
        debitoCop: true,
        creditoCop: true,
        operacion: {
          select: {
            tipo: true,
            utilidadCop: true,
          },
        },
      },
    });

    const totalDebitosCop = movimientosBalance.reduce(
      (acc, mov) => acc + Number(mov.debitoCop),
      0,
    );

    const totalCreditosCop = movimientosBalance.reduce(
      (acc, mov) => acc + Number(mov.creditoCop),
      0,
    );

    const saldoCop = totalDebitosCop - totalCreditosCop;

    const totalUtilidadRealCop = movimientosBalance.reduce((acc, mov) => {
      if (!mov.operacion) {
        return acc;
      }

      const generaUtilidadReal = this.operacionGeneraUtilidadReal(
        mov.operacion.tipo,
      );

      if (!generaUtilidadReal) {
        return acc;
      }

      return acc + Number(mov.operacion.utilidadCop ?? 0);
    }, 0);

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
        totalUtilidadRealCop,
      },
      // ultimosMovimientos: cliente.movimientos,
      // ultimasOperacionesComoDeudor: cliente.operacionesComoDeudor,
      // ultimasOperacionesComoAcreedor: cliente.operacionesComoAcreedor,
      // ultimasEntradasComoDeudor: cliente.entradasComoDeudor,
      // ultimasEntradasComoAcreedor: cliente.entradasComoAcreedor,
      // ultimasSalidasComoAcreedor: cliente.salidasComoAcreedor,
    };
  }

  private async validarClienteExiste(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
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

  private operacionGeneraUtilidadReal(tipoOperacion: TipoOperacion) {
    return (
      tipoOperacion === TipoOperacion.VENTA ||
      tipoOperacion === TipoOperacion.OPERACION_DIRECTA
    );
  }
}
