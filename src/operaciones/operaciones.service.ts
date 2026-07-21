import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CategoriaCuenta,
  EstadoEntidad,
  EstadoOperacion,
  Moneda,
  Prisma,
  TipoMovimientoCliente,
  TipoMovimientoCuenta,
  TipoOperacion,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateOperacionDto } from './dto/create-operacion.dto';
import { CancelarOperacionDto } from './dto/cancelar-operacion.dto';
import { FilterOperacionesDto } from './dto/filter-operaciones.dto';
import { UpdateOperacionDto } from './dto/update-operacione.dto';

@Injectable()
export class OperacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOperacionDto) {
    this.validarDtoPorTipo(dto);

    const totalCompraCop = this.calcularTotalCompra(dto);
    const totalVentaCop = this.calcularTotalVenta(dto);
    const utilidadCop = totalVentaCop - totalCompraCop;

    const codigo = await this.generarCodigoOperacion();

    return this.prisma.$transaction(async (tx) => {
      let operacionId: string;

      if (dto.tipo === TipoOperacion.VENTA) {
        const operacion = await this.crearVenta(tx, dto, {
          codigo,
          totalCompraCop,
          totalVentaCop,
          utilidadCop,
        });

        operacionId = operacion.id;
      } else if (dto.tipo === TipoOperacion.COMPRA) {
        const operacion = await this.crearCompra(tx, dto, {
          codigo,
          totalCompraCop,
          totalVentaCop,
          utilidadCop,
        });

        operacionId = operacion.id;
      } else {
        const operacion = await this.crearOperacionDirecta(tx, dto, {
          codigo,
          totalCompraCop,
          totalVentaCop,
          utilidadCop,
        });

        operacionId = operacion.id;
      }

      return tx.operacion.findUnique({
        where: {
          id: operacionId,
        },
        include: this.operacionInclude(),
      });
    });
  }

  findAll(filters: FilterOperacionesDto) {
    const where: Prisma.OperacionWhereInput = {};
    const andConditions: Prisma.OperacionWhereInput[] = [];

    if (filters.tipo) {
      where.tipo = filters.tipo;
    }

    if (filters.estado) {
      where.estado = filters.estado;
    }

    if (filters.moneda) {
      where.monedaTransaccion = filters.moneda;
    }

    if (filters.deudorId) {
      where.deudorId = filters.deudorId;
    }

    if (filters.acreedorId) {
      where.acreedorId = filters.acreedorId;
    }

    if (filters.clienteId) {
      andConditions.push({
        OR: [
          { deudorId: filters.clienteId },
          { acreedorId: filters.clienteId },
        ],
      });
    }

    if (filters.cuentaOperativaId) {
      where.cuentaOperativaId = filters.cuentaOperativaId;
    }

    if (filters.desde || filters.hasta) {
      const fechaOperacion: Prisma.DateTimeFilter = {};

      if (filters.desde) {
        fechaOperacion.gte = this.buildStartOfDayUtcFromLocal(filters.desde);
      }

      if (filters.hasta) {
        fechaOperacion.lte = this.buildEndOfDayUtcFromLocal(filters.hasta);
      }

      where.fechaOperacion = fechaOperacion;
    }

    if (filters.buscar) {
      where.OR = [
        {
          codigo: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          nombre: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          destinatario: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          notas: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          deudor: {
            nombre: {
              contains: filters.buscar,
              mode: 'insensitive',
            },
          },
        },
        {
          acreedor: {
            nombre: {
              contains: filters.buscar,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }


    console.log({
      desdeInput: filters.desde,
      hastaInput: filters.hasta,
      desdeFinal: filters.desde
        ? this.buildStartOfDayUtcFromLocal(filters.desde).toISOString()
        : null,
      hastaFinal: filters.hasta
        ? this.buildEndOfDayUtcFromLocal(filters.hasta).toISOString()
        : null,
    });

    return this.prisma.operacion.findMany({
      where,
      orderBy: {
        fechaOperacion: 'desc',
      },
      include: this.operacionInclude(),
    });
  }

  async findOne(id: string) {
    const operacion = await this.prisma.operacion.findUnique({
      where: {
        id,
      },
      include: this.operacionInclude(),
    });

    if (!operacion) {
      throw new NotFoundException('La operación no existe.');
    }

    return operacion;
  }

  async cancelar(id: string, dto: CancelarOperacionDto) {
  const operacion = await this.prisma.operacion.findUnique({
    where: {
      id,
    },
    include: {
      cuentaOperativa: true,
      movimientosCliente: true,
    },
  });

  if (!operacion) {
    throw new NotFoundException('La operación no existe.');
  }

  return this.prisma.$transaction(async (tx) => {
    /**
     * VENTA:
     * Originalmente salió moneda de la cuenta operativa.
     * Al eliminar la operación, esa moneda debe regresar a la cuenta.
     */
    if (
      operacion.tipo === TipoOperacion.VENTA &&
      operacion.cuentaOperativaId
    ) {
      await tx.cuenta.update({
        where: {
          id: operacion.cuentaOperativaId,
        },
        data: {
          saldo: {
            increment: operacion.montoTransaccion,
          },
        },
      });
    }

    /**
     * COMPRA:
     * Originalmente entró moneda a la cuenta operativa.
     * Al eliminar la operación, esa moneda debe salir de la cuenta.
     */
    if (
      operacion.tipo === TipoOperacion.COMPRA &&
      operacion.cuentaOperativaId
    ) {
      await tx.cuenta.update({
        where: {
          id: operacion.cuentaOperativaId,
        },
        data: {
          saldo: {
            decrement: operacion.montoTransaccion,
          },
        },
      });
    }

    /**
     * OPERACION_DIRECTA:
     * No mueve cuenta operativa, así que no se revierte cuenta.
     * Solo se eliminan los movimientos de cliente.
     */

    /**
     * Eliminar movimientos de cliente asociados a la operación.
     *
     * En tu schema Cliente no tiene saldoCop ni saldo.
     * El balance del cliente se obtiene desde movimientos_clientes,
     * por eso eliminar estos movimientos ya limpia el ledger y el balance.
     */
    await tx.movimientoCliente.deleteMany({
      where: {
        operacionId: operacion.id,
      },
    });

    /**
     * Eliminar movimientos de cuenta asociados a la operación.
     *
     * Esto depende de cómo los estés creando.
     * Si al crear operaciones usas:
     * referenciaTipo: 'OPERACION'
     * referenciaId: operacion.id
     *
     * entonces esto los borra correctamente.
     */
    await tx.movimientoCuenta.deleteMany({
      where: {
        referenciaTipo: 'OPERACION',
        referenciaId: operacion.id,
      },
    });

    /**
     * Eliminar operación.
     */
    await tx.operacion.delete({
      where: {
        id: operacion.id,
      },
    });

    return {
      message: `Operación ${operacion.codigo} eliminada correctamente.`,
      codigo: operacion.codigo,
      motivo: dto.motivo,
    };
  });
}

  private async crearVenta(
    tx: Prisma.TransactionClient,
    dto: CreateOperacionDto,
    calculos: {
      codigo: string;
      totalCompraCop: number;
      totalVentaCop: number;
      utilidadCop: number;
    },
  ) {
    const deudorId = dto.deudorId;
    const cuentaOperativaId = dto.cuentaOperativaId;

    if (!deudorId) {
      throw new BadRequestException('La venta requiere deudorId.');
    }

    if (!cuentaOperativaId) {
      throw new BadRequestException('La venta requiere cuentaOperativaId.');
    }

    const deudor = await tx.cliente.findUnique({
      where: {
        id: deudorId,
      },
    });

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: cuentaOperativaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta operativa no existe.');
    }

    this.validarCuentaOperativaActiva(cuenta);
    this.validarMonedaCuenta(cuenta.moneda, dto.monedaTransaccion);

    const saldoActual = Number(cuenta.saldo);

    if (saldoActual < dto.montoTransaccion) {
      throw new BadRequestException(
        'La cuenta operativa no tiene saldo suficiente para esta venta.',
      );
    }

    const saldoNuevo = saldoActual - dto.montoTransaccion;

    const operacion = await tx.operacion.create({
      data: {
        codigo: calculos.codigo,
        nombre: dto.nombre,
        tipo: TipoOperacion.VENTA,
        estado: EstadoOperacion.REGISTRADA,

        deudorId,
        acreedorId: null,

        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,

        tasaCompra: dto.tasaCompra,
        tasaVenta: dto.tasaVenta,

        totalCompraCop: calculos.totalCompraCop,
        totalVentaCop: calculos.totalVentaCop,
        utilidadCop: calculos.utilidadCop,

        cuentaOperativaId,

        destinatario: dto.destinatario,
        notas: dto.notas,
      },
    });

    await tx.cuenta.update({
      where: {
        id: cuenta.id,
      },
      data: {
        saldo: saldoNuevo,
      },
    });

    await tx.movimientoCuenta.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoCuenta.OPERACION_SALIDA,
        monto: dto.montoTransaccion,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Venta ${operacion.codigo}`,
        referenciaTipo: 'OPERACION',
        referenciaId: operacion.id,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: deudorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId: operacion.id,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,
        debitoCop: calculos.totalVentaCop,
        creditoCop: 0,
        descripcion: `Venta ${operacion.codigo}`,
      },
    });

    return operacion;
  }

  private async crearCompra(
    tx: Prisma.TransactionClient,
    dto: CreateOperacionDto,
    calculos: {
      codigo: string;
      totalCompraCop: number;
      totalVentaCop: number;
      utilidadCop: number;
    },
  ) {
    const acreedorId = dto.acreedorId;
    const cuentaOperativaId = dto.cuentaOperativaId;

    if (!acreedorId) {
      throw new BadRequestException('La compra requiere acreedorId.');
    }

    if (!cuentaOperativaId) {
      throw new BadRequestException('La compra requiere cuentaOperativaId.');
    }

    const acreedor = await tx.cliente.findUnique({
      where: {
        id: acreedorId,
      },
    });

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: cuentaOperativaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta operativa no existe.');
    }

    this.validarCuentaOperativaActiva(cuenta);
    this.validarMonedaCuenta(cuenta.moneda, dto.monedaTransaccion);

    const saldoActual = Number(cuenta.saldo);
    const saldoNuevo = saldoActual + dto.montoTransaccion;

    const operacion = await tx.operacion.create({
      data: {
        codigo: calculos.codigo,
        nombre: dto.nombre,
        tipo: TipoOperacion.COMPRA,
        estado: EstadoOperacion.REGISTRADA,

        deudorId: null,
        acreedorId,

        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,

        tasaCompra: dto.tasaCompra,
        tasaVenta: dto.tasaVenta,

        totalCompraCop: calculos.totalCompraCop,
        totalVentaCop: calculos.totalVentaCop,
        utilidadCop: calculos.utilidadCop,

        cuentaOperativaId,

        destinatario: dto.destinatario,
        notas: dto.notas,
      },
    });

    await tx.cuenta.update({
      where: {
        id: cuenta.id,
      },
      data: {
        saldo: saldoNuevo,
      },
    });

    await tx.movimientoCuenta.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoCuenta.OPERACION_ENTRADA,
        monto: dto.montoTransaccion,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Compra ${operacion.codigo}`,
        referenciaTipo: 'OPERACION',
        referenciaId: operacion.id,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId: operacion.id,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,
        debitoCop: 0,
        creditoCop: calculos.totalCompraCop,
        descripcion: `Compra ${operacion.codigo}`,
      },
    });

    return operacion;
  }

  private async crearOperacionDirecta(
    tx: Prisma.TransactionClient,
    dto: CreateOperacionDto,
    calculos: {
      codigo: string;
      totalCompraCop: number;
      totalVentaCop: number;
      utilidadCop: number;
    },
  ) {
    const deudorId = dto.deudorId;
    const acreedorId = dto.acreedorId;

    if (!deudorId) {
      throw new BadRequestException('La operación directa requiere deudorId.');
    }

    if (!acreedorId) {
      throw new BadRequestException(
        'La operación directa requiere acreedorId.',
      );
    }

    if (deudorId === acreedorId) {
      throw new BadRequestException(
        'El deudor y el acreedor no pueden ser la misma persona.',
      );
    }

    const deudor = await tx.cliente.findUnique({
      where: {
        id: deudorId,
      },
    });

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    const acreedor = await tx.cliente.findUnique({
      where: {
        id: acreedorId,
      },
    });

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const operacion = await tx.operacion.create({
      data: {
        codigo: calculos.codigo,
        nombre: dto.nombre,
        tipo: TipoOperacion.OPERACION_DIRECTA,
        estado: EstadoOperacion.REGISTRADA,

        deudorId,
        acreedorId,

        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,

        tasaCompra: dto.tasaCompra,
        tasaVenta: dto.tasaVenta,

        totalCompraCop: calculos.totalCompraCop,
        totalVentaCop: calculos.totalVentaCop,
        utilidadCop: calculos.utilidadCop,

        cuentaOperativaId: null,

        destinatario: dto.destinatario,
        notas: dto.notas,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: deudorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId: operacion.id,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,
        debitoCop: calculos.totalVentaCop,
        creditoCop: 0,
        descripcion: `Operación directa ${operacion.codigo}`,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId: operacion.id,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,
        debitoCop: 0,
        creditoCop: calculos.totalCompraCop,
        descripcion: `Operación directa ${operacion.codigo}`,
      },
    });

    return operacion;
  }

  private async reversarSalidaCuentaPorCancelacion(
    tx: Prisma.TransactionClient,
    cuentaId: string,
    monto: number,
    operacionId: string,
    codigoOperacion: string,
    motivo: string,
  ) {
    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta operativa no existe.');
    }

    const saldoActual = Number(cuenta.saldo);
    const saldoNuevo = saldoActual + monto;

    await tx.cuenta.update({
      where: {
        id: cuenta.id,
      },
      data: {
        saldo: saldoNuevo,
      },
    });

    await tx.movimientoCuenta.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoCuenta.AJUSTE_ENTRADA,
        monto,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Cancelación de operación ${codigoOperacion}: ${motivo}`,
        referenciaTipo: 'CANCELACION_OPERACION',
        referenciaId: operacionId,
      },
    });
  }

  private async reversarEntradaCuentaPorCancelacion(
    tx: Prisma.TransactionClient,
    cuentaId: string,
    monto: number,
    operacionId: string,
    codigoOperacion: string,
    motivo: string,
  ) {
    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta operativa no existe.');
    }

    const saldoActual = Number(cuenta.saldo);

    if (saldoActual < monto) {
      throw new BadRequestException(
        'No se puede cancelar la compra porque la cuenta operativa no tiene saldo suficiente para reversar la entrada.',
      );
    }

    const saldoNuevo = saldoActual - monto;

    await tx.cuenta.update({
      where: {
        id: cuenta.id,
      },
      data: {
        saldo: saldoNuevo,
      },
    });

    await tx.movimientoCuenta.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoCuenta.AJUSTE_SALIDA,
        monto,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Cancelación de operación ${codigoOperacion}: ${motivo}`,
        referenciaTipo: 'CANCELACION_OPERACION',
        referenciaId: operacionId,
      },
    });
  }

  private buildStartOfDayUtcFromLocal(date: string) {
    const [year, month, day] = date.split('-').map(Number);

    // Venezuela UTC-4:
    // 2026-07-13 00:00 local = 2026-07-13T04:00:00.000Z
    return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
  }

  private buildEndOfDayUtcFromLocal(date: string) {
    const [year, month, day] = date.split('-').map(Number);

    // Venezuela UTC-4:
    // 2026-07-13 23:59 local = 2026-07-14T03:59:59.999Z
    return new Date(Date.UTC(year, month - 1, day + 1, 3, 59, 59, 999));
  }

  private validarDtoPorTipo(dto: CreateOperacionDto | UpdateOperacionDto) {
  if (!dto.tasaCompra || dto.tasaCompra <= 0) {
    throw new BadRequestException(
      'La operación requiere tasaCompra mayor a 0.',
    );
  }

  if (dto.montoTransaccion <= 0) {
    throw new BadRequestException(
      'La operación requiere montoTransaccion mayor a 0.',
    );
  }

  if (
    dto.tipo === TipoOperacion.VENTA ||
    dto.tipo === TipoOperacion.OPERACION_DIRECTA
  ) {
    if (!dto.tasaVenta || dto.tasaVenta <= 0) {
      throw new BadRequestException(
        'La operación requiere tasaVenta mayor a 0.',
      );
    }
  }

  if (dto.tipo === TipoOperacion.COMPRA) {
    if (!dto.acreedorId) {
      throw new BadRequestException('La compra requiere acreedorId.');
    }

    if (!dto.cuentaOperativaId) {
      throw new BadRequestException('La compra requiere cuentaOperativaId.');
    }

    return;
  }

  if (dto.tipo === TipoOperacion.VENTA) {
    if (!dto.deudorId) {
      throw new BadRequestException('La venta requiere deudorId.');
    }

    if (!dto.cuentaOperativaId) {
      throw new BadRequestException('La venta requiere cuentaOperativaId.');
    }

    return;
  }

  if (dto.tipo === TipoOperacion.OPERACION_DIRECTA) {
    if (!dto.deudorId) {
      throw new BadRequestException(
        'La operación directa requiere deudorId.',
      );
    }

    if (!dto.acreedorId) {
      throw new BadRequestException(
        'La operación directa requiere acreedorId.',
      );
    }

    if (dto.deudorId === dto.acreedorId) {
      throw new BadRequestException(
        'El deudor y el acreedor no pueden ser la misma persona.',
      );
    }

    return;
  }

  throw new BadRequestException('Tipo de operación no soportado.');
}

  private calcularTotalCompra(dto: CreateOperacionDto) {
    return this.redondearCop(dto.montoTransaccion * dto.tasaCompra);
  }

  private calcularTotalVenta(dto: CreateOperacionDto) {
    return this.redondearCop(dto.montoTransaccion * dto.tasaVenta);
  }

  private redondearCop(valor: number) {
    return Math.round(valor);
  }

  private validarCuentaOperativaActiva(cuenta: {
    categoria: CategoriaCuenta;
    estado: EstadoEntidad;
  }) {
    if (cuenta.estado !== EstadoEntidad.ACTIVO) {
      throw new BadRequestException('La cuenta operativa está inactiva.');
    }

    if (cuenta.categoria !== CategoriaCuenta.OPERATIVA) {
      throw new BadRequestException('La cuenta debe ser OPERATIVA.');
    }
  }

  private validarMonedaCuenta(monedaCuenta: Moneda, monedaTransaccion: Moneda) {
    if (monedaCuenta !== monedaTransaccion) {
      throw new BadRequestException(
        'La moneda de la cuenta operativa no coincide con la moneda de la operación.',
      );
    }
  }

  private async generarCodigoOperacion() {
  const operaciones = await this.prisma.operacion.findMany({
    select: {
      codigo: true,
    },
    orderBy: {
      creadoEn: 'desc',
    },
    take: 100,
  });

  const ultimoNumero = operaciones.reduce((max, operacion) => {
    const match = operacion.codigo.match(/OP-(\d+)/);

    if (!match) {
      return max;
    }

    const numero = Number(match[1]);

    return Number.isFinite(numero) && numero > max ? numero : max;
  }, 0);

  const siguiente = ultimoNumero + 1;

  return `OP-${String(siguiente).padStart(6, '0')}`;
}

  private operacionInclude() {
    return {
      deudor: {
        select: {
          id: true,
          nombre: true,
          documento: true,
          telefono: true,
          estado: true,
        },
      },
      acreedor: {
        select: {
          id: true,
          nombre: true,
          documento: true,
          telefono: true,
          estado: true,
        },
      },
      cuentaOperativa: true,
      movimientosCliente: {
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              documento: true,
              telefono: true,
            },
          },
        },
      },
    };
  }

  private async reversarImpactoOperacionExistente(
  tx: Prisma.TransactionClient,
  operacion: {
    id: string;
    codigo: string;
    tipo: TipoOperacion;
    cuentaOperativaId: string | null;
    montoTransaccion: Prisma.Decimal;
  },
) {
  if (
    operacion.tipo === TipoOperacion.VENTA &&
    operacion.cuentaOperativaId
  ) {
    await tx.cuenta.update({
      where: {
        id: operacion.cuentaOperativaId,
      },
      data: {
        saldo: {
          increment: operacion.montoTransaccion,
        },
      },
    });
  }

  if (
    operacion.tipo === TipoOperacion.COMPRA &&
    operacion.cuentaOperativaId
  ) {
    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: operacion.cuentaOperativaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta operativa anterior no existe.');
    }

    if (Number(cuenta.saldo) < Number(operacion.montoTransaccion)) {
      throw new BadRequestException(
        `No se puede editar la operación ${operacion.codigo} porque la cuenta no tiene saldo suficiente para reversar la compra anterior.`,
      );
    }

    await tx.cuenta.update({
      where: {
        id: operacion.cuentaOperativaId,
      },
      data: {
        saldo: {
          decrement: operacion.montoTransaccion,
        },
      },
    });
  }
}

private async aplicarVentaEditada(
  tx: Prisma.TransactionClient,
  operacionId: string,
  dto: UpdateOperacionDto,
  calculos: {
    codigo: string;
    totalCompraCop: number;
    totalVentaCop: number;
  },
) {
  if (!dto.deudorId) {
    throw new BadRequestException('La venta requiere deudorId.');
  }

  if (!dto.cuentaOperativaId) {
    throw new BadRequestException('La venta requiere cuentaOperativaId.');
  }

  const deudor = await tx.cliente.findUnique({
    where: {
      id: dto.deudorId,
    },
  });

  if (!deudor) {
    throw new NotFoundException('El deudor no existe.');
  }

  const cuenta = await tx.cuenta.findUnique({
    where: {
      id: dto.cuentaOperativaId,
    },
  });

  if (!cuenta) {
    throw new NotFoundException('La cuenta operativa no existe.');
  }

  this.validarCuentaOperativaActiva(cuenta);
  this.validarMonedaCuenta(cuenta.moneda, dto.monedaTransaccion);

  const saldoActual = Number(cuenta.saldo);

  if (saldoActual < dto.montoTransaccion) {
    throw new BadRequestException(
      'La cuenta operativa no tiene saldo suficiente para esta venta.',
    );
  }

  const saldoNuevo = saldoActual - dto.montoTransaccion;

  await tx.cuenta.update({
    where: {
      id: cuenta.id,
    },
    data: {
      saldo: saldoNuevo,
    },
  });

  await tx.movimientoCuenta.create({
    data: {
      cuentaId: cuenta.id,
      tipo: TipoMovimientoCuenta.OPERACION_SALIDA,
      monto: dto.montoTransaccion,
      moneda: cuenta.moneda,
      saldoAnterior: saldoActual,
      saldoNuevo,
      descripcion: `Edición venta ${calculos.codigo}`,
      referenciaTipo: 'OPERACION',
      referenciaId: operacionId,
    },
  });

  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.deudorId,
      tipo: TipoMovimientoCliente.OPERACION,
      operacionId,
      monedaTransaccion: dto.monedaTransaccion,
      montoTransaccion: dto.montoTransaccion,
      debitoCop: calculos.totalVentaCop,
      creditoCop: 0,
      descripcion: `Venta ${calculos.codigo}`,
    },
  });
}

private async aplicarCompraEditada(
  tx: Prisma.TransactionClient,
  operacionId: string,
  dto: UpdateOperacionDto,
  calculos: {
    codigo: string;
    totalCompraCop: number;
  },
) {
  if (!dto.acreedorId) {
    throw new BadRequestException('La compra requiere acreedorId.');
  }

  if (!dto.cuentaOperativaId) {
    throw new BadRequestException('La compra requiere cuentaOperativaId.');
  }

  const acreedor = await tx.cliente.findUnique({
    where: {
      id: dto.acreedorId,
    },
  });

  if (!acreedor) {
    throw new NotFoundException('El acreedor no existe.');
  }

  const cuenta = await tx.cuenta.findUnique({
    where: {
      id: dto.cuentaOperativaId,
    },
  });

  if (!cuenta) {
    throw new NotFoundException('La cuenta operativa no existe.');
  }

  this.validarCuentaOperativaActiva(cuenta);
  this.validarMonedaCuenta(cuenta.moneda, dto.monedaTransaccion);

  const saldoActual = Number(cuenta.saldo);
  const saldoNuevo = saldoActual + dto.montoTransaccion;

  await tx.cuenta.update({
    where: {
      id: cuenta.id,
    },
    data: {
      saldo: saldoNuevo,
    },
  });

  await tx.movimientoCuenta.create({
    data: {
      cuentaId: cuenta.id,
      tipo: TipoMovimientoCuenta.OPERACION_ENTRADA,
      monto: dto.montoTransaccion,
      moneda: cuenta.moneda,
      saldoAnterior: saldoActual,
      saldoNuevo,
      descripcion: `Edición compra ${calculos.codigo}`,
      referenciaTipo: 'OPERACION',
      referenciaId: operacionId,
    },
  });

  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.acreedorId,
      tipo: TipoMovimientoCliente.OPERACION,
      operacionId,
      monedaTransaccion: dto.monedaTransaccion,
      montoTransaccion: dto.montoTransaccion,
      debitoCop: 0,
      creditoCop: calculos.totalCompraCop,
      descripcion: `Compra ${calculos.codigo}`,
    },
  });
}

private async aplicarOperacionDirectaEditada(
  tx: Prisma.TransactionClient,
  operacionId: string,
  dto: UpdateOperacionDto,
  calculos: {
    codigo: string;
    totalCompraCop: number;
    totalVentaCop: number;
  },
) {
  if (!dto.deudorId) {
    throw new BadRequestException(
      'La operación directa requiere deudorId.',
    );
  }

  if (!dto.acreedorId) {
    throw new BadRequestException(
      'La operación directa requiere acreedorId.',
    );
  }

  if (dto.deudorId === dto.acreedorId) {
    throw new BadRequestException(
      'El deudor y el acreedor no pueden ser la misma persona.',
    );
  }

  const deudor = await tx.cliente.findUnique({
    where: {
      id: dto.deudorId,
    },
  });

  if (!deudor) {
    throw new NotFoundException('El deudor no existe.');
  }

  const acreedor = await tx.cliente.findUnique({
    where: {
      id: dto.acreedorId,
    },
  });

  if (!acreedor) {
    throw new NotFoundException('El acreedor no existe.');
  }

  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.deudorId,
      tipo: TipoMovimientoCliente.OPERACION,
      operacionId,
      monedaTransaccion: dto.monedaTransaccion,
      montoTransaccion: dto.montoTransaccion,
      debitoCop: calculos.totalVentaCop,
      creditoCop: 0,
      descripcion: `Operación directa ${calculos.codigo}`,
    },
  });

  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.acreedorId,
      tipo: TipoMovimientoCliente.OPERACION,
      operacionId,
      monedaTransaccion: dto.monedaTransaccion,
      montoTransaccion: dto.montoTransaccion,
      debitoCop: 0,
      creditoCop: calculos.totalCompraCop,
      descripcion: `Operación directa ${calculos.codigo}`,
    },
  });
}

  async editar(id: string, dto: UpdateOperacionDto) {
  this.validarDtoPorTipo(dto);

  const operacionActual = await this.prisma.operacion.findUnique({
    where: {
      id,
    },
    include: {
      cuentaOperativa: true,
      movimientosCliente: true,
    },
  });

  if (!operacionActual) {
    throw new NotFoundException('La operación no existe.');
  }

  const totalCompraCop = this.calcularTotalCompra(dto);
  const totalVentaCop = this.calcularTotalVenta(dto);
  const utilidadCop = totalVentaCop - totalCompraCop;

  return this.prisma.$transaction(async (tx) => {
    /**
     * 1. Reversar impacto anterior en cuenta operativa.
     */
    await this.reversarImpactoOperacionExistente(tx, operacionActual);

    /**
     * 2. Eliminar movimientos anteriores.
     */
    await tx.movimientoCliente.deleteMany({
      where: {
        operacionId: operacionActual.id,
      },
    });

    await tx.movimientoCuenta.deleteMany({
      where: {
        referenciaTipo: 'OPERACION',
        referenciaId: operacionActual.id,
      },
    });

    /**
     * 3. Actualizar operación base.
     */
    const operacionEditada = await tx.operacion.update({
      where: {
        id: operacionActual.id,
      },
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        estado: EstadoOperacion.REGISTRADA,

        deudorId:
          dto.tipo === TipoOperacion.VENTA ||
          dto.tipo === TipoOperacion.OPERACION_DIRECTA
            ? dto.deudorId
            : null,

        acreedorId:
          dto.tipo === TipoOperacion.COMPRA ||
          dto.tipo === TipoOperacion.OPERACION_DIRECTA
            ? dto.acreedorId
            : null,

        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: dto.montoTransaccion,

        tasaCompra: dto.tasaCompra,
        tasaVenta: dto.tasaVenta,

        totalCompraCop,
        totalVentaCop,
        utilidadCop,

        cuentaOperativaId:
          dto.tipo === TipoOperacion.VENTA || dto.tipo === TipoOperacion.COMPRA
            ? dto.cuentaOperativaId
            : null,

        destinatario: dto.destinatario,
        notas: dto.notas,
      },
    });

    /**
     * 4. Aplicar nuevo impacto según el nuevo tipo.
     */
    if (dto.tipo === TipoOperacion.VENTA) {
      await this.aplicarVentaEditada(tx, operacionEditada.id, dto, {
        codigo: operacionActual.codigo,
        totalCompraCop,
        totalVentaCop,
      });
    }

    if (dto.tipo === TipoOperacion.COMPRA) {
      await this.aplicarCompraEditada(tx, operacionEditada.id, dto, {
        codigo: operacionActual.codigo,
        totalCompraCop,
      });
    }

    if (dto.tipo === TipoOperacion.OPERACION_DIRECTA) {
      await this.aplicarOperacionDirectaEditada(tx, operacionEditada.id, dto, {
        codigo: operacionActual.codigo,
        totalCompraCop,
        totalVentaCop,
      });
    }

    return tx.operacion.findUnique({
      where: {
        id: operacionActual.id,
      },
      include: this.operacionInclude(),
    });
  });
}


}
