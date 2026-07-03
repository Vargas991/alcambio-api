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

  findAll() {
    return this.prisma.operacion.findMany({
      orderBy: {
        creadoEn: 'desc',
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

    if (operacion.estado === EstadoOperacion.CANCELADA) {
      throw new BadRequestException('La operación ya está cancelada.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (
        operacion.tipo === TipoOperacion.VENTA &&
        operacion.cuentaOperativaId
      ) {
        await this.reversarSalidaCuentaPorCancelacion(
          tx,
          operacion.cuentaOperativaId,
          Number(operacion.montoTransaccion),
          operacion.id,
          operacion.codigo,
          dto.motivo,
        );
      }

      if (
        operacion.tipo === TipoOperacion.COMPRA &&
        operacion.cuentaOperativaId
      ) {
        await this.reversarEntradaCuentaPorCancelacion(
          tx,
          operacion.cuentaOperativaId,
          Number(operacion.montoTransaccion),
          operacion.id,
          operacion.codigo,
          dto.motivo,
        );
      }

      for (const movimiento of operacion.movimientosCliente) {
        await tx.movimientoCliente.create({
          data: {
            clienteId: movimiento.clienteId,
            tipo: TipoMovimientoCliente.CANCELACION,
            operacionId: operacion.id,
            monedaTransaccion: movimiento.monedaTransaccion,
            montoTransaccion: movimiento.montoTransaccion,
            debitoCop: movimiento.creditoCop,
            creditoCop: movimiento.debitoCop,
            descripcion: `Cancelación de operación ${operacion.codigo}: ${dto.motivo}`,
          },
        });
      }

      await tx.operacion.update({
        where: {
          id,
        },
        data: {
          estado: EstadoOperacion.CANCELADA,
          notas: operacion.notas
            ? `${operacion.notas}\nCancelada: ${dto.motivo}`
            : `Cancelada: ${dto.motivo}`,
        },
      });

      return tx.operacion.findUnique({
        where: {
          id,
        },
        include: this.operacionInclude(),
      });
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

  private validarDtoPorTipo(dto: CreateOperacionDto) {
    if (!dto.tasaCompra || dto.tasaCompra <= 0) {
      throw new BadRequestException(
        'La operación requiere tasaCompra mayor a 0.',
      );
    }

    if (!dto.tasaVenta || dto.tasaVenta <= 0) {
      throw new BadRequestException(
        'La operación requiere tasaVenta mayor a 0.',
      );
    }

    if (dto.montoTransaccion <= 0) {
      throw new BadRequestException(
        'La operación requiere montoTransaccion mayor a 0.',
      );
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

    if (dto.tipo === TipoOperacion.COMPRA) {
      if (!dto.acreedorId) {
        throw new BadRequestException('La compra requiere acreedorId.');
      }

      if (!dto.cuentaOperativaId) {
        throw new BadRequestException('La compra requiere cuentaOperativaId.');
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
    const totalOperaciones = await this.prisma.operacion.count();
    const siguiente = totalOperaciones + 1;

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
}