import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoriaCuenta,
  EstadoEntidad,
  EstadoOperacion,
  TipoMovimientoCuenta,
  TipoOperacion,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCuentaDto } from './dto/create-cuenta.dto';
import { AjustarSaldoCuentaDto } from './dto/ajustar-saldo-cuenta.dto';
import { UpdateEstadoCuentaDto } from './dto/update-estado-cuenta.dto';
import { CreateGastoCuentaDto } from './dto/create-gasto-cuenta.dto';
import { CreateTrasladoCuentaDto } from './dto/create-traslado-cuenta.dto';
import { UpdateCuentaDto } from './dto/update-cuenta.dto';

@Injectable()
export class CuentasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCuentaDto) {
    this.validarCuentaPorCategoria({
      categoria: dto.categoria,
      moneda: dto.moneda,
      aplica4x1000: dto.aplica4x1000 ?? false,
    });

    const saldoInicial = dto.saldoInicial ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuenta.create({
        data: {
          nombre: dto.nombre,
          moneda: dto.moneda,
          categoria: dto.categoria,
          tipo: dto.tipo,
          saldo: saldoInicial,
          aplica4x1000: dto.aplica4x1000 ?? false,
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
      where: {
        id,
      },
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

  async update(id: string, dto: UpdateCuentaDto) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: {
        id,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    /**
     * En update no estamos permitiendo cambiar moneda ni categoría.
     * Por eso se valida contra los valores reales actuales de la cuenta.
     */
    const aplica4x1000Final =
      dto.aplica4x1000 !== undefined ? dto.aplica4x1000 : cuenta.aplica4x1000;

    this.validarCuentaPorCategoria({
      categoria: cuenta.categoria,
      moneda: cuenta.moneda,
      aplica4x1000: aplica4x1000Final,
    });

    return this.prisma.cuenta.update({
      where: {
        id,
      },
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        notas: dto.notas,
        aplica4x1000: dto.aplica4x1000,
      },
    });
  }

  async updateEstado(id: string, dto: UpdateEstadoCuentaDto) {
    await this.validarCuentaExiste(id);

    return this.prisma.cuenta.update({
      where: {
        id,
      },
      data: {
        estado: dto.estado,
      },
    });
  }

  async ajustarSaldo(id: string, dto: AjustarSaldoCuentaDto) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: {
        id,
      },
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
        where: {
          id,
        },
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
      where: {
        id,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    if (cuenta.estado !== EstadoEntidad.ACTIVO) {
      throw new BadRequestException(
        'No se puede registrar gasto en una cuenta inactiva.',
      );
    }

    if (cuenta.categoria !== CategoriaCuenta.BASE_COP) {
      throw new BadRequestException(
        'Los gastos solo deben registrarse desde cuentas BASE_COP.',
      );
    }

    if (cuenta.moneda !== 'COP') {
      throw new BadRequestException(
        'Los gastos deben registrarse en cuentas COP.',
      );
    }

    const saldoActual = Number(cuenta.saldo);

    const calculoSalida = this.calcularSalidaCuenta({
      monto: dto.monto,
      cuentaAplica4x1000: cuenta.aplica4x1000,
    });

    if (saldoActual < calculoSalida.totalDebitado) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para este gasto.',
      );
    }

    const saldoNuevo = this.redondearDosDecimales(
      saldoActual - calculoSalida.totalDebitado,
    );

    return this.prisma.$transaction(async (tx) => {
      const cuentaActualizada = await tx.cuenta.update({
        where: {
          id,
        },
        data: {
          saldo: saldoNuevo,
        },
      });

      await tx.movimientoCuenta.create({
        data: {
          cuentaId: id,
          tipo: TipoMovimientoCuenta.GASTO,
          monto: calculoSalida.totalDebitado,
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
      throw new BadRequestException(
        'La cuenta origen y destino no pueden ser la misma.',
      );
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

    const calculoSalidaOrigen = this.calcularSalidaCuenta({
      monto: dto.monto,
      cuentaAplica4x1000: cuentaOrigen.aplica4x1000,
    });

    if (saldoOrigenActual < calculoSalidaOrigen.totalDebitado) {
      throw new BadRequestException(
        'La cuenta origen no tiene saldo suficiente.',
      );
    }

    const saldoOrigenNuevo = this.redondearDosDecimales(
      saldoOrigenActual - calculoSalidaOrigen.totalDebitado,
    );

    const saldoDestinoNuevo = this.redondearDosDecimales(
      saldoDestinoActual + dto.monto,
    );

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
          monto: calculoSalidaOrigen.totalDebitado,
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

  private redondearDosDecimales(valor: number) {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  private calcularSalidaCuenta(params: {
    monto: number;
    cuentaAplica4x1000: boolean;
  }) {
    const impuestoCuenta4x1000 = params.cuentaAplica4x1000
      ? this.redondearDosDecimales(params.monto * 0.004)
      : 0;

    const totalDebitado = this.redondearDosDecimales(
      params.monto + impuestoCuenta4x1000,
    );

    return {
      montoBase: params.monto,
      impuestoCuenta4x1000,
      totalDebitado,
    };
  }

  private validarCuentaPorCategoria(params: {
    categoria: CategoriaCuenta;
    moneda: string;
    aplica4x1000: boolean;
  }) {
    if (
      params.categoria === CategoriaCuenta.BASE_COP &&
      params.moneda !== 'COP'
    ) {
      throw new BadRequestException('Las cuentas BASE_COP deben ser en COP.');
    }

    if (
      params.categoria === CategoriaCuenta.OPERATIVA &&
      params.moneda === 'COP'
    ) {
      throw new BadRequestException(
        'Las cuentas OPERATIVAS deben ser BS, USD o USDT.',
      );
    }

    if (params.aplica4x1000 && params.moneda !== 'COP') {
      throw new BadRequestException(
        'El 4x1000 solo puede aplicar en cuentas COP.',
      );
    }

    if (params.aplica4x1000 && params.categoria !== CategoriaCuenta.BASE_COP) {
      throw new BadRequestException(
        'El 4x1000 solo puede aplicar en cuentas BASE_COP.',
      );
    }
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

  async obtenerPromedioCompraCuenta(cuentaId: string) {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: {
        id: cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    if (cuenta.categoria !== CategoriaCuenta.OPERATIVA) {
      return {
        cuentaId: cuenta.id,
        cuenta: cuenta.nombre,
        moneda: cuenta.moneda,
        saldoActual: Number(cuenta.saldo),
        saldoCalculado: 0,
        costoInventarioCop: 0,
        promedioCompra: 0,
        tasaMinimaVenta: 0,
        totalOperacionesAnalizadas: 0,
        aplica: false,
        mensaje: 'El promedio de compra solo aplica para cuentas operativas.',
      };
    }

    const operaciones = await this.prisma.operacion.findMany({
      where: {
        cuentaOperativaId: cuentaId,
        estado: EstadoOperacion.REGISTRADA,
        tipo: {
          in: [TipoOperacion.COMPRA, TipoOperacion.VENTA],
        },
      },
      orderBy: [
        {
          fechaOperacion: 'asc',
        },
        {
          creadoEn: 'asc',
        },
      ],
    });

    let saldoDisponible = 0;
    let costoInventarioCop = 0;

    for (const operacion of operaciones) {
      const monto = Number(operacion.montoTransaccion);
      const totalCompraCop = Number(operacion.totalCompraCop);

      if (operacion.tipo === TipoOperacion.COMPRA) {
        saldoDisponible += monto;
        costoInventarioCop += totalCompraCop;
      }

      if (operacion.tipo === TipoOperacion.VENTA) {
        if (saldoDisponible <= 0) {
          continue;
        }

        const promedioActual = costoInventarioCop / saldoDisponible;
        const montoVendido = Math.min(monto, saldoDisponible);
        const costoSalida = montoVendido * promedioActual;

        saldoDisponible -= montoVendido;
        costoInventarioCop -= costoSalida;

        if (saldoDisponible <= 0) {
          saldoDisponible = 0;
          costoInventarioCop = 0;
        }
      }
    }

    const promedioCompra =
      saldoDisponible > 0 ? costoInventarioCop / saldoDisponible : 0;

    return {
      cuentaId: cuenta.id,
      cuenta: cuenta.nombre,
      moneda: cuenta.moneda,
      saldoActual: Number(cuenta.saldo),
      saldoCalculado: saldoDisponible,
      costoInventarioCop: Math.round(costoInventarioCop),
      promedioCompra,
      tasaMinimaVenta: promedioCompra,
      totalOperacionesAnalizadas: operaciones.length,
      aplica: true,
    };
  }
  private calcularPromedioCompraDeOperaciones(params: {
    cuenta: {
      id: string;
      nombre: string;
      moneda: string;
      saldo: unknown;
    };
    operaciones: Array<{
      tipo: TipoOperacion;
      montoTransaccion: unknown;
      totalCompraCop: unknown;
    }>;
  }) {
    const { cuenta, operaciones } = params;

    let saldoDisponible = 0;
    let costoInventarioCop = 0;

    for (const operacion of operaciones) {
      const monto = Number(operacion.montoTransaccion);
      const totalCompraCop = Number(operacion.totalCompraCop);

      if (operacion.tipo === TipoOperacion.COMPRA) {
        saldoDisponible += monto;
        costoInventarioCop += totalCompraCop;
      }

      if (operacion.tipo === TipoOperacion.VENTA) {
        if (saldoDisponible <= 0) {
          continue;
        }

        const promedioActual = costoInventarioCop / saldoDisponible;
        const montoVendido = Math.min(monto, saldoDisponible);
        const costoSalida = montoVendido * promedioActual;

        saldoDisponible -= montoVendido;
        costoInventarioCop -= costoSalida;

        if (saldoDisponible <= 0) {
          saldoDisponible = 0;
          costoInventarioCop = 0;
        }
      }
    }

    const promedioCompra =
      saldoDisponible > 0 ? costoInventarioCop / saldoDisponible : 0;

    return {
      cuentaId: cuenta.id,
      cuenta: cuenta.nombre,
      moneda: cuenta.moneda,
      saldoActual: Number(cuenta.saldo),
      saldoCalculado: saldoDisponible,
      costoInventarioCop: Math.round(costoInventarioCop),
      promedioCompra,
      tasaMinimaVenta: promedioCompra,
      totalOperacionesAnalizadas: operaciones.length,
    };
  }

  async obtenerPromediosCompraCuentasOperativas() {
    const cuentasOperativas = await this.prisma.cuenta.findMany({
      where: {
        categoria: CategoriaCuenta.OPERATIVA,
        estado: EstadoEntidad.ACTIVO,
      },
      orderBy: {
        nombre: 'asc',
      },
    });

    const operaciones = await this.prisma.operacion.findMany({
      where: {
        estado: EstadoOperacion.REGISTRADA,
        cuentaOperativaId: {
          in: cuentasOperativas.map((cuenta) => cuenta.id),
        },
        tipo: {
          in: [TipoOperacion.COMPRA, TipoOperacion.VENTA],
        },
      },
      orderBy: [
        {
          fechaOperacion: 'asc',
        },
        {
          creadoEn: 'asc',
        },
      ],
    });

    return cuentasOperativas.map((cuenta) => {
      const operacionesCuenta = operaciones.filter(
        (operacion) => operacion.cuentaOperativaId === cuenta.id,
      );

      return this.calcularPromedioCompraDeOperaciones({
        cuenta,
        operaciones: operacionesCuenta,
      });
    });
  }
}
