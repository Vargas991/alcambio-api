import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AplicacionPorcentaje,
  CategoriaCuenta,
  EstadoEntidad,
  EstadoOperacion,
  MetodoCalculoOperacion,
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
import { getUtcDayRange } from '../common/helpers/date-range.helper';

type CalculosOperacion = {
  metodoCalculo: MetodoCalculoOperacion;

  monedaDeuda: Moneda;
  monedaBaseHistorica: Moneda;

  montoDeuda: Prisma.Decimal;

  porcentaje: Prisma.Decimal | null;
  aplicacionPorcentaje: AplicacionPorcentaje | null;
  montoComision: Prisma.Decimal | null;
  montoResultado: Prisma.Decimal | null;

  tasaCompra: Prisma.Decimal;
  tasaVenta: Prisma.Decimal;

  totalCompraCop: Prisma.Decimal;
  totalVentaCop: Prisma.Decimal;
  utilidadCop: Prisma.Decimal;

  tasaConversionBase: Prisma.Decimal | null;
};
@Injectable()
export class OperacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOperacionDto) {
    this.validarDtoPorTipo(dto);

    const configuracion = await this.prisma.configuracionOrganizacion.findFirst(
      {
        select: {
          monedaBase: true,
        },
      },
    );

    if (!configuracion) {
      throw new BadRequestException(
        'Debe configurar la organización antes de registrar operaciones.',
      );
    }

    const calculos = this.calcularOperacion(dto, configuracion.monedaBase);

    const codigo = await this.generarCodigoOperacion();

    return this.prisma.$transaction(async (tx) => {
      let operacionId: string;

      if (dto.tipo === TipoOperacion.VENTA) {
        const operacion = await this.crearVenta(tx, dto, {
          codigo,
          ...calculos,
        });

        operacionId = operacion.id;
      } else if (dto.tipo === TipoOperacion.COMPRA) {
        const operacion = await this.crearCompra(tx, dto, {
          codigo,
          ...calculos,
        });

        operacionId = operacion.id;
      } else {
        const operacion = await this.crearOperacionDirecta(tx, dto, {
          codigo,
          ...calculos,
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

  private calcularOperacion(
    dto: CreateOperacionDto,
    monedaBase: Moneda,
  ): CalculosOperacion {
    const metodoCalculo = dto.metodoCalculo ?? MetodoCalculoOperacion.TASA;

    if (metodoCalculo === MetodoCalculoOperacion.PORCENTAJE) {
      return this.calcularOperacionPorPorcentaje(dto, monedaBase);
    }

    return this.calcularOperacionPorTasa(dto, monedaBase);
  }

  private calcularOperacionPorTasa(
    dto: CreateOperacionDto,
    monedaBase: Moneda,
  ): CalculosOperacion {
    if (dto.tasaCompra === undefined || dto.tasaVenta === undefined) {
      throw new BadRequestException(
        'Las operaciones por tasa requieren tasaCompra y tasaVenta.',
      );
    }

    const monto = new Prisma.Decimal(dto.montoTransaccion);

    const tasaCompra = new Prisma.Decimal(dto.tasaCompra);

    const tasaVenta = new Prisma.Decimal(dto.tasaVenta);

    const totalCompraCop = monto.mul(tasaCompra).toDecimalPlaces(0);

    const totalVentaCop = monto.mul(tasaVenta).toDecimalPlaces(0);

    const utilidadCop = totalVentaCop.sub(totalCompraCop);

    const monedaDeuda = dto.monedaDeuda ?? Moneda.COP;

    const montoDeuda =
      dto.tipo === TipoOperacion.COMPRA ? totalCompraCop : totalVentaCop;

    return {
      metodoCalculo: MetodoCalculoOperacion.TASA,

      monedaDeuda,
      monedaBaseHistorica: monedaBase,
      montoDeuda,

      porcentaje: null,
      aplicacionPorcentaje: null,
      montoComision: null,
      montoResultado: null,

      tasaCompra,
      tasaVenta,

      totalCompraCop,
      totalVentaCop,
      utilidadCop,

      tasaConversionBase: null,
    };
  }

  private calcularOperacionPorPorcentaje(
    dto: CreateOperacionDto,
    monedaBase: Moneda,
  ): CalculosOperacion {
    if (dto.tipo !== TipoOperacion.VENTA) {
      throw new BadRequestException(
        'En esta fase, las operaciones por porcentaje solo están habilitadas para VENTA.',
      );
    }

    if (
      dto.aplicacionPorcentaje !== AplicacionPorcentaje.SUMAR &&
      dto.aplicacionPorcentaje !== AplicacionPorcentaje.DESCONTAR
    ) {
      throw new BadRequestException(
        'La aplicación del porcentaje debe ser SUMAR o DESCONTAR.',
      );
    }

    if (dto.porcentaje === undefined || dto.porcentaje <= 0) {
      throw new BadRequestException(
        'La operación por porcentaje requiere un porcentaje mayor a cero.',
      );
    }

    const monto = new Prisma.Decimal(dto.montoTransaccion);

    const porcentaje = new Prisma.Decimal(dto.porcentaje);

    const montoComision = monto.mul(porcentaje).div(100).toDecimalPlaces(6);

    /*
     * montoResultado representa el monto que realmente sale de la cuenta:
     *
     * SUMAR:
     * - se entregan los fondos completos;
     * - la comisión se agrega a la deuda.
     *
     * DESCONTAR:
     * - la comisión se descuenta de los fondos entregados;
     * - la deuda conserva el monto solicitado.
     */
    const montoResultado =
      dto.aplicacionPorcentaje === AplicacionPorcentaje.DESCONTAR
        ? monto.sub(montoComision).toDecimalPlaces(6)
        : monto.toDecimalPlaces(6);

    const montoDeuda =
      dto.aplicacionPorcentaje === AplicacionPorcentaje.SUMAR
        ? monto.add(montoComision).toDecimalPlaces(6)
        : monto.toDecimalPlaces(6);

    if (montoResultado.lte(0)) {
      throw new BadRequestException(
        'El porcentaje descontado no puede dejar el monto entregado en cero o negativo.',
      );
    }

    const monedaDeuda = dto.monedaDeuda ?? dto.monedaTransaccion ?? monedaBase;

    if (monedaDeuda !== dto.monedaTransaccion) {
      throw new BadRequestException(
        'En esta fase, la deuda por porcentaje debe generarse en la misma moneda de la transacción.',
      );
    }

    /*
     * Los campos COP antiguos son obligatorios.
     * Para operaciones por porcentaje no representan el saldo real.
     * Se guardan en cero y el saldo se registra en los campos nuevos.
     */
    const cero = new Prisma.Decimal(0);
    const uno = new Prisma.Decimal(1);

    return {
      metodoCalculo: MetodoCalculoOperacion.PORCENTAJE,

      monedaDeuda,
      monedaBaseHistorica: monedaBase,
      montoDeuda,

      porcentaje,
      aplicacionPorcentaje: dto.aplicacionPorcentaje,
      montoComision,
      montoResultado,

      tasaCompra: uno,
      tasaVenta: uno,

      totalCompraCop: cero,
      totalVentaCop: cero,
      utilidadCop: cero,

      tasaConversionBase: null,
    };
  }

  async findAll(filters: FilterOperacionesDto) {
    const where: Prisma.OperacionWhereInput = {};
    const andConditions: Prisma.OperacionWhereInput[] = [];
    const zonaHoraria = await this.obtenerZonaHorariaOrganizacion();

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
        const { inicio } = getUtcDayRange(filters.desde, zonaHoraria);

        fechaOperacion.gte = inicio;
      }

      if (filters.hasta) {
        const { fin } = getUtcDayRange(filters.hasta, zonaHoraria);

        fechaOperacion.lt = fin;
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
        const montoSalidaCuenta =
          operacion.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE &&
          operacion.montoResultado
            ? operacion.montoResultado
            : operacion.montoTransaccion;

        await tx.cuenta.update({
          where: {
            id: operacion.cuentaOperativaId,
          },
          data: {
            saldo: {
              increment: montoSalidaCuenta,
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
    calculos: CalculosOperacion & {
      codigo: string;
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

    const montoSalidaCuenta =
      calculos.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE
        ? calculos.montoResultado
        : new Prisma.Decimal(dto.montoTransaccion);

    if (!montoSalidaCuenta || montoSalidaCuenta.lte(0)) {
      throw new BadRequestException(
        'El monto que saldrá de la cuenta debe ser mayor a cero.',
      );
    }

    const saldoActual = new Prisma.Decimal(cuenta.saldo);

    if (saldoActual.lt(montoSalidaCuenta)) {
      throw new BadRequestException(
        'La cuenta operativa no tiene saldo suficiente para esta venta.',
      );
    }

    const saldoNuevo = saldoActual.sub(montoSalidaCuenta);

    const operacion = await tx.operacion.create({
      data: {
        codigo: calculos.codigo,
        nombre: dto.nombre,
        tipo: TipoOperacion.VENTA,
        estado: EstadoOperacion.REGISTRADA,

        deudorId,
        acreedorId: null,

        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),

        metodoCalculo: calculos.metodoCalculo,

        porcentaje: calculos.porcentaje,

        aplicacionPorcentaje: calculos.aplicacionPorcentaje,

        montoComision: calculos.montoComision,
        montoResultado: calculos.montoResultado,

        monedaDeuda: calculos.monedaDeuda,
        montoDeuda: calculos.montoDeuda,

        monedaBaseHistorica: calculos.monedaBaseHistorica,

        tasaConversionBase: calculos.tasaConversionBase,

        tasaCompra: calculos.tasaCompra,
        tasaVenta: calculos.tasaVenta,

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
        monto: montoSalidaCuenta,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Venta ${operacion.codigo}`,
        referenciaTipo: 'OPERACION',
        referenciaId: operacion.id,
      },
    });
    const deudaEsCop = calculos.monedaDeuda === Moneda.COP;

    await tx.movimientoCliente.create({
      data: {
        clienteId: deudorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId: operacion.id,

        monedaTransaccion: dto.monedaTransaccion,

        montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),

        // Compatibilidad con reportes anteriores.
        debitoCop: deudaEsCop ? calculos.montoDeuda : new Prisma.Decimal(0),

        creditoCop: new Prisma.Decimal(0),

        // Nuevo ledger multimoneda.
        moneda: calculos.monedaDeuda,
        debito: calculos.montoDeuda,
        credito: new Prisma.Decimal(0),

        descripcion: `Venta ${operacion.codigo}`,
      },
    });

    return operacion;
  }

  private async crearCompra(
    tx: Prisma.TransactionClient,
    dto: CreateOperacionDto,
    calculos: CalculosOperacion & {
      codigo: string;
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
        montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),

        metodoCalculo: calculos.metodoCalculo,
        porcentaje: calculos.porcentaje,
        aplicacionPorcentaje: calculos.aplicacionPorcentaje,
        montoComision: calculos.montoComision,
        montoResultado: calculos.montoResultado,
        monedaDeuda: calculos.monedaDeuda,
        montoDeuda: calculos.montoDeuda,
        monedaBaseHistorica: calculos.monedaBaseHistorica,
        tasaConversionBase: calculos.tasaConversionBase,

        tasaCompra: calculos.tasaCompra,
        tasaVenta: calculos.tasaVenta,
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
        debitoCop:
          calculos.monedaDeuda === Moneda.COP
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(0),
        creditoCop:
          calculos.monedaDeuda === Moneda.COP
            ? calculos.montoDeuda
            : new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: new Prisma.Decimal(0),
        credito: calculos.montoDeuda,
        descripcion: `Compra ${operacion.codigo}`,
      },
    });

    return operacion;
  }

  private async crearOperacionDirecta(
    tx: Prisma.TransactionClient,
    dto: CreateOperacionDto,
    calculos: CalculosOperacion & {
      codigo: string;
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

        tasaCompra: calculos.tasaCompra,
        tasaVenta: calculos.tasaVenta,

        totalCompraCop: calculos.totalCompraCop,
        totalVentaCop: calculos.totalVentaCop,
        utilidadCop: calculos.utilidadCop,

        cuentaOperativaId: null,
        metodoCalculo: calculos.metodoCalculo,
        porcentaje: calculos.porcentaje,
        aplicacionPorcentaje: calculos.aplicacionPorcentaje,
        montoComision: calculos.montoComision,
        montoResultado: calculos.montoResultado,
        monedaDeuda: calculos.monedaDeuda,
        montoDeuda: calculos.montoDeuda,
        monedaBaseHistorica: calculos.monedaBaseHistorica,
        tasaConversionBase: calculos.tasaConversionBase,

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
        debitoCop:
          calculos.monedaDeuda === Moneda.COP
            ? calculos.montoDeuda
            : new Prisma.Decimal(0),
        creditoCop: new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: calculos.montoDeuda,
        credito: new Prisma.Decimal(0),
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
        debitoCop: new Prisma.Decimal(0),
        creditoCop:
          calculos.monedaDeuda === Moneda.COP
            ? calculos.montoDeuda
            : new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: new Prisma.Decimal(0),
        credito: calculos.montoDeuda,
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

  private validarDtoPorTipo(dto: CreateOperacionDto | UpdateOperacionDto) {
    const metodoCalculo = dto.metodoCalculo ?? MetodoCalculoOperacion.TASA;

    if (dto.montoTransaccion === undefined || dto.montoTransaccion <= 0) {
      throw new BadRequestException(
        'La operación requiere montoTransaccion mayor a 0.',
      );
    }

    if (metodoCalculo === MetodoCalculoOperacion.TASA) {
      if (dto.tasaCompra === undefined || dto.tasaCompra <= 0) {
        throw new BadRequestException(
          'La operación por tasa requiere tasaCompra mayor a 0.',
        );
      }

      if (
        (dto.tipo === TipoOperacion.VENTA ||
          dto.tipo === TipoOperacion.OPERACION_DIRECTA) &&
        (dto.tasaVenta === undefined || dto.tasaVenta <= 0)
      ) {
        throw new BadRequestException(
          'La operación por tasa requiere tasaVenta mayor a 0.',
        );
      }
    }

    if (metodoCalculo === MetodoCalculoOperacion.PORCENTAJE) {
      if (dto.porcentaje === undefined || dto.porcentaje <= 0) {
        throw new BadRequestException(
          'La operación por porcentaje requiere porcentaje mayor a 0.',
        );
      }

      if (!dto.aplicacionPorcentaje) {
        throw new BadRequestException(
          'La operación por porcentaje requiere aplicacionPorcentaje.',
        );
      }

      if (dto.tipo !== TipoOperacion.VENTA) {
        throw new BadRequestException(
          'En esta fase, el porcentaje solo está habilitado para ventas.',
        );
      }

      if (
        dto.aplicacionPorcentaje !== AplicacionPorcentaje.SUMAR &&
        dto.aplicacionPorcentaje !== AplicacionPorcentaje.DESCONTAR
      ) {
        throw new BadRequestException(
          'La aplicación del porcentaje debe ser SUMAR o DESCONTAR.',
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

  private calcularTotalCompra(dto: CreateOperacionDto | UpdateOperacionDto) {
    if (dto.tasaCompra === undefined) {
      throw new BadRequestException('La operación requiere tasaCompra.');
    }

    return this.redondearCop(dto.montoTransaccion * dto.tasaCompra);
  }

  private calcularTotalVenta(dto: CreateOperacionDto | UpdateOperacionDto) {
    if (dto.tasaVenta === undefined) {
      throw new BadRequestException('La operación requiere tasaVenta.');
    }

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

  private async obtenerZonaHorariaOrganizacion() {
    const configuracion = await this.prisma.configuracionOrganizacion.findFirst(
      {
        select: {
          zonaHoraria: true,
        },
      },
    );

    if (!configuracion) {
      throw new BadRequestException(
        'Debe configurar la organizacion antes de consultar operaciones.',
      );
    }

    return configuracion.zonaHoraria;
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
      metodoCalculo: MetodoCalculoOperacion;
      cuentaOperativaId: string | null;
      montoTransaccion: Prisma.Decimal;
      montoResultado: Prisma.Decimal | null;
    },
  ) {
    const montoMovimientoCuenta =
      operacion.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE &&
      operacion.montoResultado
        ? operacion.montoResultado
        : operacion.montoTransaccion;

    if (operacion.tipo === TipoOperacion.VENTA && operacion.cuentaOperativaId) {
      await tx.cuenta.update({
        where: {
          id: operacion.cuentaOperativaId,
        },
        data: {
          saldo: {
            increment: montoMovimientoCuenta,
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

      if (new Prisma.Decimal(cuenta.saldo).lt(montoMovimientoCuenta)) {
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
            decrement: montoMovimientoCuenta,
          },
        },
      });
    }
  }

  private async aplicarVentaEditada(
    tx: Prisma.TransactionClient,
    operacionId: string,
    dto: UpdateOperacionDto,
    calculos: CalculosOperacion & {
      codigo: string;
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

    const montoSalidaCuenta =
      calculos.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE
        ? calculos.montoResultado
        : new Prisma.Decimal(dto.montoTransaccion);

    if (!montoSalidaCuenta || montoSalidaCuenta.lte(0)) {
      throw new BadRequestException(
        'El monto que saldrá de la cuenta debe ser mayor a cero.',
      );
    }

    const saldoActual = new Prisma.Decimal(cuenta.saldo);

    if (saldoActual.lt(montoSalidaCuenta)) {
      throw new BadRequestException(
        'La cuenta operativa no tiene saldo suficiente para esta venta.',
      );
    }

    const saldoNuevo = saldoActual.sub(montoSalidaCuenta);

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
        monto: montoSalidaCuenta,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Edición venta ${calculos.codigo}`,
        referenciaTipo: 'OPERACION',
        referenciaId: operacionId,
      },
    });

    const deudaEsCop = calculos.monedaDeuda === Moneda.COP;

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.deudorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),
        debitoCop: deudaEsCop ? calculos.montoDeuda : new Prisma.Decimal(0),
        creditoCop: new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: calculos.montoDeuda,
        credito: new Prisma.Decimal(0),
        descripcion: `Venta ${calculos.codigo}`,
      },
    });
  }

  private async aplicarCompraEditada(
    tx: Prisma.TransactionClient,
    operacionId: string,
    dto: UpdateOperacionDto,
    calculos: CalculosOperacion & {
      codigo: string;
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

    const montoEntradaCuenta = new Prisma.Decimal(dto.montoTransaccion);

    const saldoActual = new Prisma.Decimal(cuenta.saldo);
    const saldoNuevo = saldoActual.add(montoEntradaCuenta);

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
        monto: montoEntradaCuenta,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Edición compra ${calculos.codigo}`,
        referenciaTipo: 'OPERACION',
        referenciaId: operacionId,
      },
    });

    const deudaEsCop = calculos.monedaDeuda === Moneda.COP;

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.acreedorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: montoEntradaCuenta,
        debitoCop: new Prisma.Decimal(0),
        creditoCop: deudaEsCop ? calculos.montoDeuda : new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: new Prisma.Decimal(0),
        credito: calculos.montoDeuda,
        descripcion: `Compra ${calculos.codigo}`,
      },
    });
  }

  private async aplicarOperacionDirectaEditada(
    tx: Prisma.TransactionClient,
    operacionId: string,
    dto: UpdateOperacionDto,
    calculos: CalculosOperacion & {
      codigo: string;
    },
  ) {
    if (!dto.deudorId) {
      throw new BadRequestException('La operación directa requiere deudorId.');
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

    const [deudor, acreedor] = await Promise.all([
      tx.cliente.findUnique({
        where: {
          id: dto.deudorId,
        },
      }),
      tx.cliente.findUnique({
        where: {
          id: dto.acreedorId,
        },
      }),
    ]);

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const deudaEsCop = calculos.monedaDeuda === Moneda.COP;

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.deudorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),
        debitoCop: deudaEsCop ? calculos.montoDeuda : new Prisma.Decimal(0),
        creditoCop: new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: calculos.montoDeuda,
        credito: new Prisma.Decimal(0),
        descripcion: `Operación directa ${calculos.codigo}`,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.acreedorId,
        tipo: TipoMovimientoCliente.OPERACION,
        operacionId,
        monedaTransaccion: dto.monedaTransaccion,
        montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),
        debitoCop: new Prisma.Decimal(0),
        creditoCop: deudaEsCop ? calculos.montoDeuda : new Prisma.Decimal(0),
        moneda: calculos.monedaDeuda,
        debito: new Prisma.Decimal(0),
        credito: calculos.montoDeuda,
        descripcion: `Operación directa ${calculos.codigo}`,
      },
    });
  }

  async editar(id: string, dto: UpdateOperacionDto) {
    this.validarDtoPorTipo(dto);

    const [operacionActual, configuracion] = await Promise.all([
      this.prisma.operacion.findUnique({
        where: {
          id,
        },
        include: {
          cuentaOperativa: true,
          movimientosCliente: true,
        },
      }),
      this.prisma.configuracionOrganizacion.findFirst({
        select: {
          monedaBase: true,
        },
      }),
    ]);

    if (!operacionActual) {
      throw new NotFoundException('La operación no existe.');
    }

    if (!configuracion) {
      throw new BadRequestException(
        'Debe configurar la organización antes de editar operaciones.',
      );
    }

    const calculos = this.calcularOperacion(dto, configuracion.monedaBase);

    return this.prisma.$transaction(async (tx) => {
      await this.reversarImpactoOperacionExistente(tx, operacionActual);

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
          montoTransaccion: new Prisma.Decimal(dto.montoTransaccion),

          metodoCalculo: calculos.metodoCalculo,
          porcentaje: calculos.porcentaje,
          aplicacionPorcentaje: calculos.aplicacionPorcentaje,
          montoComision: calculos.montoComision,
          montoResultado: calculos.montoResultado,

          monedaDeuda: calculos.monedaDeuda,
          montoDeuda: calculos.montoDeuda,
          monedaBaseHistorica: calculos.monedaBaseHistorica,
          tasaConversionBase: calculos.tasaConversionBase,

          tasaCompra: calculos.tasaCompra,
          tasaVenta: calculos.tasaVenta,
          totalCompraCop: calculos.totalCompraCop,
          totalVentaCop: calculos.totalVentaCop,
          utilidadCop: calculos.utilidadCop,

          cuentaOperativaId:
            dto.tipo === TipoOperacion.VENTA ||
            dto.tipo === TipoOperacion.COMPRA
              ? dto.cuentaOperativaId
              : null,

          destinatario: dto.destinatario,
          notas: dto.notas,
        },
      });

      const calculosConCodigo = {
        codigo: operacionActual.codigo,
        ...calculos,
      };

      if (dto.tipo === TipoOperacion.VENTA) {
        await this.aplicarVentaEditada(
          tx,
          operacionEditada.id,
          dto,
          calculosConCodigo,
        );
      }

      if (dto.tipo === TipoOperacion.COMPRA) {
        await this.aplicarCompraEditada(
          tx,
          operacionEditada.id,
          dto,
          calculosConCodigo,
        );
      }

      if (dto.tipo === TipoOperacion.OPERACION_DIRECTA) {
        await this.aplicarOperacionDirectaEditada(
          tx,
          operacionEditada.id,
          dto,
          calculosConCodigo,
        );
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
