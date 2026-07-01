import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CategoriaCuenta,
  TipoMovimientoCuenta,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCuentaDto } from './dto/create-cuenta.dto';
import { AjustarSaldoCuentaDto } from './dto/ajustar-saldo-cuenta.dto';

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

  findOne(id: string) {
    return this.prisma.cuenta.findUnique({
      where: { id },
      include: {
        movimientos: {
          orderBy: {
            creadoEn: 'desc',
          },
        },
      },
    });
  }

  async ajustarSaldo(id: string, dto: AjustarSaldoCuentaDto) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: { id },
    });

    if (!cuenta) {
      throw new BadRequestException('La cuenta no existe.');
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
}