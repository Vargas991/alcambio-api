import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoriaCuenta,
  EstadoEntidad,
  TipoMovimientoCuenta,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCuentaDto } from './dto/create-cuenta.dto';
import { AjustarSaldoCuentaDto } from './dto/ajustar-saldo-cuenta.dto';
import { UpdateEstadoCuentaDto } from './dto/update-estado-cuenta.dto';
import { CreateGastoCuentaDto } from './dto/create-gasto-cuenta.dto';
import { CreateTrasladoCuentaDto } from './dto/create-traslado-cuenta.dto';

@Injectable()
export class CuentasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCuentaDto) {
    if (dto.categoria === CategoriaCuenta.BASE_COP && dto.moneda !== 'COP') {
      throw new BadRequestException('Las cuentas BASE_COP deben ser en COP.');
    }

    if (dto.categoria === CategoriaCuenta.OPERATIVA && dto.moneda === 'COP') {
      throw new BadRequestException(
        'Las cuentas OPERATIVAS deben ser BS, USD o USDT.',
      );
    }

    const saldoInicial = dto.saldoInicial ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuenta.create({
        data: {
          nombre: dto.nombre,
          moneda: dto.moneda,
          categoria: dto.categoria,
          tipo: dto.tipo,
          saldo: saldoInicial,
          notas: dto.notas,
        },
      });

      if (saldoInicial > 0) {
        await tx.movimientoCuenta.create({
          data: {
            cuentaId: cuenta.id,
            tipo: TipoMovimientoCuenta.AJUSTE_ENTRADA,
            monto: saldoInicial,
            moneda: dto.moneda,
            saldoAnterior: 0,
            saldoNuevo: saldoInicial,
            descripcion: 'Saldo inicial de apertura',
            referenciaTipo: 'CUENTA',
            referenciaId: cuenta.id,
          },
        });
      }

      return cuenta;
    });
  }

  findAll() {
    return this.prisma.cuenta.findMany({
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  findBase() {
    return this.prisma.cuenta.findMany({
      where: {
        categoria: CategoriaCuenta.BASE_COP,
      },
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  findOperativas() {
    return this.prisma.cuenta.findMany({
      where: {
        categoria: CategoriaCuenta.OPERATIVA,
      },
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: { id },
      include: {
        movimientos: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 20,
        },
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    return cuenta;
  }

  async getMovimientos(id: string) {
    await this.validarCuentaExiste(id);

    return this.prisma.movimientoCuenta.findMany({
      where: {
        cuentaId: id,
      },
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async updateEstado(id: string, dto: UpdateEstadoCuentaDto) {
    await this.validarCuentaExiste(id);

    return this.prisma.cuenta.update({
      where: { id },
      data: {
        estado: dto.estado,
      },
    });
  }

  async ajustarSaldo(id: string, dto: AjustarSaldoCuentaDto) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: { id },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    const saldoActual = Number(cuenta.saldo);
    const saldoReal = dto.saldoReal;
    const diferencia = saldoReal - saldoActual;

    if (diferencia === 0) {
      throw new BadRequestException('El saldo real es igual al saldo actual.');
    }

    const tipoMovimiento =
      diferencia > 0
        ? TipoMovimientoCuenta.AJUSTE_ENTRADA
        : TipoMovimientoCuenta.AJUSTE_SALIDA;

    const montoMovimiento = Math.abs(diferencia);

    return this.prisma.$transaction(async (tx) => {
      const cuentaActualizada = await tx.cuenta.update({
        where: { id },
        data: {
          saldo: saldoReal,
        },
      });

      await tx.movimientoCuenta.create({
        data: {
          cuentaId: id,
          tipo: tipoMovimiento,
          monto: montoMovimiento,
          moneda: cuenta.moneda,
          saldoAnterior: saldoActual,
          saldoNuevo: saldoReal,
          descripcion: dto.descripcion,
          referenciaTipo: 'AJUSTE_CUENTA',
          referenciaId: id,
        },
      });

      return cuentaActualizada;
    });
  }

  async registrarGasto(id: string, dto: CreateGastoCuentaDto) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: { id },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    if (cuenta.estado !== EstadoEntidad.ACTIVO) {
      throw new BadRequestException('No se puede registrar gasto en una cuenta inactiva.');
    }

    if (cuenta.categoria !== CategoriaCuenta.BASE_COP) {
      throw new BadRequestException(
        'Los gastos solo deben registrarse desde cuentas BASE_COP.',
      );
    }

    if (cuenta.moneda !== 'COP') {
      throw new BadRequestException('Los gastos deben registrarse en cuentas COP.');
    }

    const saldoActual = Number(cuenta.saldo);

    if (saldoActual < dto.monto) {
      throw new BadRequestException('La cuenta no tiene saldo suficiente para este gasto.');
    }

    const saldoNuevo = saldoActual - dto.monto;

    return this.prisma.$transaction(async (tx) => {
      const cuentaActualizada = await tx.cuenta.update({
        where: { id },
        data: {
          saldo: saldoNuevo,
        },
      });

      await tx.movimientoCuenta.create({
        data: {
          cuentaId: id,
          tipo: TipoMovimientoCuenta.GASTO,
          monto: dto.monto,
          moneda: cuenta.moneda,
          saldoAnterior: saldoActual,
          saldoNuevo,
          descripcion: dto.descripcion,
          referenciaTipo: 'GASTO',
          referenciaId: dto.referencia,
        },
      });

      return cuentaActualizada;
    });
  }

  async trasladar(dto: CreateTrasladoCuentaDto) {
    if (dto.cuentaOrigenId === dto.cuentaDestinoId) {
      throw new BadRequestException('La cuenta origen y destino no pueden ser la misma.');
    }

    const cuentaOrigen = await this.prisma.cuenta.findUnique({
      where: {
        id: dto.cuentaOrigenId,
      },
    });

    if (!cuentaOrigen) {
      throw new NotFoundException('La cuenta origen no existe.');
    }

    const cuentaDestino = await this.prisma.cuenta.findUnique({
      where: {
        id: dto.cuentaDestinoId,
      },
    });

    if (!cuentaDestino) {
      throw new NotFoundException('La cuenta destino no existe.');
    }

    if (
      cuentaOrigen.estado !== EstadoEntidad.ACTIVO ||
      cuentaDestino.estado !== EstadoEntidad.ACTIVO
    ) {
      throw new BadRequestException('Ambas cuentas deben estar activas.');
    }

    if (cuentaOrigen.moneda !== cuentaDestino.moneda) {
      throw new BadRequestException(
        'Solo se permiten traslados entre cuentas de la misma moneda.',
      );
    }

    const saldoOrigenActual = Number(cuentaOrigen.saldo);
    const saldoDestinoActual = Number(cuentaDestino.saldo);

    if (saldoOrigenActual < dto.monto) {
      throw new BadRequestException('La cuenta origen no tiene saldo suficiente.');
    }

    const saldoOrigenNuevo = saldoOrigenActual - dto.monto;
    const saldoDestinoNuevo = saldoDestinoActual + dto.monto;

    return this.prisma.$transaction(async (tx) => {
      const origenActualizada = await tx.cuenta.update({
        where: {
          id: cuentaOrigen.id,
        },
        data: {
          saldo: saldoOrigenNuevo,
        },
      });

      const destinoActualizada = await tx.cuenta.update({
        where: {
          id: cuentaDestino.id,
        },
        data: {
          saldo: saldoDestinoNuevo,
        },
      });

      await tx.movimientoCuenta.create({
        data: {
          cuentaId: cuentaOrigen.id,
          tipo: TipoMovimientoCuenta.TRASLADO_SALIDA,
          monto: dto.monto,
          moneda: cuentaOrigen.moneda,
          saldoAnterior: saldoOrigenActual,
          saldoNuevo: saldoOrigenNuevo,
          descripcion: dto.descripcion,
          referenciaTipo: 'TRASLADO',
          referenciaId: cuentaDestino.id,
        },
      });

      await tx.movimientoCuenta.create({
        data: {
          cuentaId: cuentaDestino.id,
          tipo: TipoMovimientoCuenta.TRASLADO_ENTRADA,
          monto: dto.monto,
          moneda: cuentaDestino.moneda,
          saldoAnterior: saldoDestinoActual,
          saldoNuevo: saldoDestinoNuevo,
          descripcion: dto.descripcion,
          referenciaTipo: 'TRASLADO',
          referenciaId: cuentaOrigen.id,
        },
      });

      return {
        cuentaOrigen: origenActualizada,
        cuentaDestino: destinoActualizada,
      };
    });
  }

  private async validarCuentaExiste(id: string) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    return cuenta;
  }
}