import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CategoriaCuenta,
  EstadoEntidad,
  EstadoSalida,
  Prisma,
  TipoMovimientoCliente,
  TipoMovimientoCuenta,
  TipoSalida,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { CancelarSalidaDto } from './dto/cancelar-salida.dto';

@Injectable()
export class SalidasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSalidaDto) {
    this.validarDtoPorTipo(dto);

    return this.prisma.$transaction(async (tx) => {
      if (dto.tipo === TipoSalida.PAGO_ACREEDOR) {
        return this.crearPagoAcreedor(tx, dto);
      }

      return this.crearSalidaSimple(tx, dto);
    });
  }

  findAll() {
    return this.prisma.salida.findMany({
      orderBy: {
        creadoEn: 'desc',
      },
      include: this.salidaInclude(),
    });
  }

  async findOne(id: string) {
    const salida = await this.prisma.salida.findUnique({
      where: {
        id,
      },
      include: this.salidaInclude(),
    });

    if (!salida) {
      throw new NotFoundException('La salida no existe.');
    }

    return salida;
  }

  private async crearPagoAcreedor(
    tx: Prisma.TransactionClient,
    dto: CreateSalidaDto,
  ) {
    const acreedorId = dto.acreedorId;

    if (!acreedorId) {
      throw new BadRequestException('El pago a acreedor requiere acreedorId.');
    }

    const acreedor = await tx.cliente.findUnique({
      where: {
        id: acreedorId,
      },
    });

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const cuenta = await this.validarCuentaParaSalida(tx, dto.cuentaId);

    const saldoActual = Number(cuenta.saldo);

    if (saldoActual < dto.montoCop) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para registrar esta salida.',
      );
    }

    const saldoNuevo = saldoActual - dto.montoCop;

    const salida = await tx.salida.create({
      data: {
        tipo: TipoSalida.PAGO_ACREEDOR,
        acreedorId,
        cuentaId: dto.cuentaId,
        montoCop: dto.montoCop,
        descripcion: dto.descripcion,
        referencia: dto.referencia,
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
        tipo: TipoMovimientoCuenta.SALIDA,
        monto: dto.montoCop,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: dto.descripcion ?? `Pago a acreedor ${salida.id}`,
        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,
        tipo: TipoMovimientoCliente.PAGO,
        salidaId: salida.id,
        monedaTransaccion: 'COP',
        montoTransaccion: dto.montoCop,
        debitoCop: dto.montoCop,
        creditoCop: 0,
        descripcion: dto.descripcion ?? `Pago a acreedor ${salida.id}`,
      },
    });

    return tx.salida.findUnique({
      where: {
        id: salida.id,
      },
      include: this.salidaInclude(),
    });
  }

  private async crearSalidaSimple(
    tx: Prisma.TransactionClient,
    dto: CreateSalidaDto,
  ) {
    const cuenta = await this.validarCuentaParaSalida(tx, dto.cuentaId);

    const saldoActual = Number(cuenta.saldo);

    if (saldoActual < dto.montoCop) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para registrar esta salida.',
      );
    }

    const saldoNuevo = saldoActual - dto.montoCop;

    const salida = await tx.salida.create({
      data: {
        tipo: dto.tipo,
        acreedorId: null,
        cuentaId: dto.cuentaId,
        montoCop: dto.montoCop,
        descripcion: dto.descripcion,
        referencia: dto.referencia,
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
        tipo:
          dto.tipo === TipoSalida.GASTO
            ? TipoMovimientoCuenta.GASTO
            : TipoMovimientoCuenta.SALIDA,
        monto: dto.montoCop,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: dto.descripcion ?? `Salida ${salida.id}`,
        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
    });

    return tx.salida.findUnique({
      where: {
        id: salida.id,
      },
      include: this.salidaInclude(),
    });
  }

  private async validarCuentaParaSalida(
    tx: Prisma.TransactionClient,
    cuentaId: string,
  ) {
    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    if (cuenta.estado !== EstadoEntidad.ACTIVO) {
      throw new BadRequestException('La cuenta está inactiva.');
    }

    if (cuenta.categoria !== CategoriaCuenta.BASE_COP) {
      throw new BadRequestException(
        'Las salidas deben registrarse desde cuentas BASE_COP.',
      );
    }

    if (cuenta.moneda !== 'COP') {
      throw new BadRequestException(
        'Las salidas deben registrarse desde cuentas COP.',
      );
    }

    return cuenta;
  }

  private validarDtoPorTipo(dto: CreateSalidaDto) {
    if (!dto.cuentaId) {
      throw new BadRequestException('La salida requiere cuentaId.');
    }

    if (!dto.montoCop || dto.montoCop <= 0) {
      throw new BadRequestException('La salida requiere montoCop mayor a 0.');
    }

    if (dto.tipo === TipoSalida.PAGO_ACREEDOR && !dto.acreedorId) {
      throw new BadRequestException('El pago a acreedor requiere acreedorId.');
    }

    if (
      dto.tipo !== TipoSalida.PAGO_ACREEDOR &&
      dto.tipo !== TipoSalida.GASTO &&
      dto.tipo !== TipoSalida.RETIRO
    ) {
      throw new BadRequestException('Tipo de salida no soportado.');
    }
  }

  private salidaInclude() {
    return {
      acreedor: {
        select: {
          id: true,
          nombre: true,
          documento: true,
          telefono: true,
          estado: true,
        },
      },
      cuenta: {
        select: {
          id: true,
          nombre: true,
          moneda: true,
          categoria: true,
          tipo: true,
          saldo: true,
        },
      },
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

  async cancelar(id: string, dto: CancelarSalidaDto) {
  const salida = await this.prisma.salida.findUnique({
    where: {
      id,
    },
    include: {
      cuenta: true,
      movimientosCliente: true,
    },
  });

  if (!salida) {
    throw new NotFoundException('La salida no existe.');
  }

  if (salida.estado === EstadoSalida.CANCELADA) {
    throw new BadRequestException('La salida ya está cancelada.');
  }

  return this.prisma.$transaction(async (tx) => {
    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: salida.cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta asociada a la salida no existe.');
    }

    const saldoActual = Number(cuenta.saldo);
    const montoSalida = Number(salida.montoCop);
    const saldoNuevo = saldoActual + montoSalida;

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
        monto: montoSalida,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Cancelación de salida ${salida.id}: ${dto.motivo}`,
        referenciaTipo: 'CANCELACION_SALIDA',
        referenciaId: salida.id,
      },
    });

    for (const movimiento of salida.movimientosCliente) {
      await tx.movimientoCliente.create({
        data: {
          clienteId: movimiento.clienteId,
          tipo: TipoMovimientoCliente.CANCELACION,
          salidaId: salida.id,
          monedaTransaccion: movimiento.monedaTransaccion,
          montoTransaccion: movimiento.montoTransaccion,

          /**
           * Reversa contable:
           * Si el movimiento original tenía débito, ahora creamos crédito.
           * Si el movimiento original tenía crédito, ahora creamos débito.
           */
          debitoCop: movimiento.creditoCop,
          creditoCop: movimiento.debitoCop,

          descripcion: `Cancelación de salida ${salida.id}: ${dto.motivo}`,
        },
      });
    }

    await tx.salida.update({
      where: {
        id: salida.id,
      },
      data: {
        estado: EstadoSalida.CANCELADA,
        notas: salida.notas
          ? `${salida.notas}\nCancelada: ${dto.motivo}`
          : `Cancelada: ${dto.motivo}`,
      },
    });

    return tx.salida.findUnique({
      where: {
        id: salida.id,
      },
      include: this.salidaInclude(),
    });
  });
}
}