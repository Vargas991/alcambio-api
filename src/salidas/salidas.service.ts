import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoEntidad,
  EstadoSalida,
  Moneda,
  Prisma,
  TipoMovimientoCliente,
  TipoMovimientoCuenta,
  TipoSalida,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { CancelarSalidaDto } from './dto/cancelar-salida.dto';
import { UpdateSalidaDto } from './dto/update-salida.dto';

type CalculoSalida = {
  monedaPago: Moneda;

  /**
   * Monto base utilizado para pagar / convertir.
   * No incluye 4x1000.
   */
  montoBase: Prisma.Decimal;

  /**
   * Importe que realmente salió de la cuenta.
   * Incluye 4x1000 cuando corresponde.
   */
  totalDebitado: Prisma.Decimal;

  proveedorCobra4x1000: boolean;
  impuestoProveedor4x1000: Prisma.Decimal;

  cuentaAplica4x1000: boolean;
  impuestoCuenta4x1000: Prisma.Decimal;

  /**
   * Monto enviado antes del 4x1000 propio de la cuenta.
   * En PAGO_ACREEDOR puede incluir 4x1000 del proveedor.
   */
  montoEnviado: Prisma.Decimal;

  monedaAplicacion: Moneda;
  montoAplicado: Prisma.Decimal;
  tasaConversion: Prisma.Decimal | null;
};

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

  /**
   * ==========================================
   * CREAR PAGO A ACREEDOR
   * ==========================================
   *
   * Ejemplo:
   *
   * deuda a reducir = USD
   * cuenta origen = COP
   * monto base = 320.000 COP
   * tasa interna = 3.200 COP por 1 USD
   *
   * monto aplicado = 100 USD
   *
   * La cuenta baja en COP.
   * El balance del acreedor se corrige en USD.
   */
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

    const calculo = this.calcularPagoAcreedor(dto, cuenta);

    const saldoAnterior = new Prisma.Decimal(cuenta.saldo);

    if (saldoAnterior.lt(calculo.totalDebitado)) {
      throw new BadRequestException(
        `La cuenta "${cuenta.nombre}" no tiene saldo suficiente. Disponible: ${saldoAnterior.toString()} ${cuenta.moneda}.`,
      );
    }

    const saldoNuevo = saldoAnterior.sub(calculo.totalDebitado);

    const salida = await tx.salida.create({
      data: {
        tipo: TipoSalida.PAGO_ACREEDOR,

        acreedorId,
        cuentaId: cuenta.id,

        /**
         * ======================================
         * CAMPOS MULTIMONEDA
         * ======================================
         *
         * montoPago representa lo que realmente
         * salió de la cuenta.
         */
        monedaPago: calculo.monedaPago,

        montoPago: calculo.totalDebitado,

        monedaAplicacion: calculo.monedaAplicacion,

        montoAplicado: calculo.montoAplicado,

        tasaConversion: calculo.tasaConversion,

        /**
         * ======================================
         * CAMPOS LEGACY COP
         * ======================================
         *
         * Se mantienen para reportes antiguos.
         */
        montoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoEnviado
            : new Prisma.Decimal(0),

        montoBaseCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoBase
            : new Prisma.Decimal(0),

        proveedorCobra4x1000: calculo.proveedorCobra4x1000,

        impuestoProveedor4x1000Cop:
          calculo.monedaPago === Moneda.COP
            ? calculo.impuestoProveedor4x1000
            : new Prisma.Decimal(0),

        montoEnviadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoEnviado
            : new Prisma.Decimal(0),

        cuentaAplica4x1000: calculo.cuentaAplica4x1000,

        impuestoCuenta4x1000Cop:
          calculo.monedaPago === Moneda.COP
            ? calculo.impuestoCuenta4x1000
            : new Prisma.Decimal(0),

        totalDebitadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.totalDebitado
            : new Prisma.Decimal(0),

        descripcion: dto.descripcion,
        referencia: dto.referencia,
        notas: dto.notas,
      },
    });

    /**
     * CUENTA:
     * baja exactamente por lo que salió
     * físicamente de la cuenta.
     */
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

        monto: calculo.totalDebitado,

        moneda: calculo.monedaPago,

        saldoAnterior,
        saldoNuevo,

        descripcion: dto.descripcion ?? `Pago a acreedor ${acreedor.nombre}`,

        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
    });

    /**
     * CLIENTE / ACREEDOR:
     *
     * El acreedor normalmente tiene saldo
     * negativo (LE_DEBO).
     *
     * Un PAGO genera DÉBITO y lleva ese saldo
     * hacia cero.
     */
    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,

        tipo: TipoMovimientoCliente.PAGO,

        salidaId: salida.id,

        /**
         * Movimiento físico.
         */
        monedaTransaccion: calculo.monedaPago,

        montoTransaccion: calculo.montoBase,

        /**
         * Efecto real sobre la deuda.
         */
        moneda: calculo.monedaAplicacion,

        debito: calculo.montoAplicado,

        credito: new Prisma.Decimal(0),

        /**
         * Compatibilidad histórica COP.
         */
        debitoCop:
          calculo.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicado
            : new Prisma.Decimal(0),

        creditoCop: new Prisma.Decimal(0),

        descripcion:
          dto.descripcion ??
          this.construirDescripcionPago({
            monedaPago: calculo.monedaPago,
            montoPago: calculo.montoBase,
            monedaAplicacion: calculo.monedaAplicacion,
            montoAplicado: calculo.montoAplicado,
            tasaConversion: calculo.tasaConversion,
            acreedorNombre: acreedor.nombre,
          }),
      },
    });

    return tx.salida.findUnique({
      where: {
        id: salida.id,
      },
      include: this.salidaInclude(),
    });
  }

  /**
   * ==========================================
   * GASTO / RETIRO
   * ==========================================
   *
   * No existe deuda de cliente.
   * La moneda siempre es la moneda de la cuenta.
   * No hay conversión.
   */
  private async crearSalidaSimple(
    tx: Prisma.TransactionClient,
    dto: CreateSalidaDto,
  ) {
    const cuenta = await this.validarCuentaParaSalida(tx, dto.cuentaId);

    const calculo = this.calcularSalidaSimple(dto, cuenta);

    const saldoAnterior = new Prisma.Decimal(cuenta.saldo);

    if (saldoAnterior.lt(calculo.totalDebitado)) {
      throw new BadRequestException(
        `La cuenta "${cuenta.nombre}" no tiene saldo suficiente. Disponible: ${saldoAnterior.toString()} ${cuenta.moneda}.`,
      );
    }

    const saldoNuevo = saldoAnterior.sub(calculo.totalDebitado);

    const salida = await tx.salida.create({
      data: {
        tipo: dto.tipo,

        acreedorId: null,
        cuentaId: cuenta.id,

        /**
         * Multimoneda.
         */
        monedaPago: calculo.monedaPago,

        montoPago: calculo.totalDebitado,

        monedaAplicacion: calculo.monedaAplicacion,

        montoAplicado: calculo.montoAplicado,

        tasaConversion: null,

        /**
         * Legacy COP.
         */
        montoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoBase
            : new Prisma.Decimal(0),

        montoBaseCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoBase
            : new Prisma.Decimal(0),

        proveedorCobra4x1000: false,

        impuestoProveedor4x1000Cop: new Prisma.Decimal(0),

        montoEnviadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoEnviado
            : new Prisma.Decimal(0),

        cuentaAplica4x1000: calculo.cuentaAplica4x1000,

        impuestoCuenta4x1000Cop:
          calculo.monedaPago === Moneda.COP
            ? calculo.impuestoCuenta4x1000
            : new Prisma.Decimal(0),

        totalDebitadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.totalDebitado
            : new Prisma.Decimal(0),

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

        monto: calculo.totalDebitado,

        moneda: calculo.monedaPago,

        saldoAnterior,
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

  /**
   * ==========================================
   * CANCELAR
   * ==========================================
   *
   * No usamos totalDebitadoCop para reversar
   * salidas nuevas.
   *
   * La fuente principal es MovimientoCuenta,
   * porque allí está el monto real y la moneda
   * que afectaron a la cuenta.
   */
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
        throw new NotFoundException(
          'La cuenta asociada a la salida no existe.',
        );
      }

      const movimientoOriginal = await tx.movimientoCuenta.findFirst({
        where: {
          referenciaTipo: 'SALIDA',
          referenciaId: salida.id,
        },
        orderBy: {
          creadoEn: 'asc',
        },
      });

      /**
       * Para registros nuevos usamos el movimiento.
       *
       * Para registros antiguos:
       * totalDebitadoCop -> montoCop.
       */
      const montoReversar = movimientoOriginal
        ? new Prisma.Decimal(movimientoOriginal.monto)
        : salida.monedaPago === cuenta.moneda && salida.montoPago
          ? new Prisma.Decimal(salida.montoPago)
          : new Prisma.Decimal(salida.totalDebitadoCop ?? salida.montoCop);

      const saldoAnterior = new Prisma.Decimal(cuenta.saldo);

      const saldoNuevo = saldoAnterior.add(montoReversar);

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

          monto: montoReversar,

          moneda: cuenta.moneda,

          saldoAnterior,
          saldoNuevo,

          descripcion: `Cancelación de salida ${salida.id}: ${dto.motivo}`,

          referenciaTipo: 'CANCELACION_SALIDA',

          referenciaId: salida.id,
        },
      });

      /**
       * Reversa contable del acreedor.
       */
      for (const movimiento of salida.movimientosCliente) {
        await tx.movimientoCliente.create({
          data: {
            clienteId: movimiento.clienteId,

            tipo: TipoMovimientoCliente.CANCELACION,

            salidaId: salida.id,

            monedaTransaccion: movimiento.monedaTransaccion,

            montoTransaccion: movimiento.montoTransaccion,

            moneda: movimiento.moneda,

            /**
             * Invertimos débito/crédito
             * multimoneda.
             */
            debito: movimiento.credito,

            credito: movimiento.debito,

            /**
             * Legacy COP.
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

  /**
   * ==========================================
   * REVERTIR PARA EDITAR / ELIMINAR
   * ==========================================
   */
  private async reversarSalida(
    tx: Prisma.TransactionClient,
    salida: {
      id: string;
      tipo: TipoSalida;
      estado: EstadoSalida;
      cuentaId: string;

      montoCop: Prisma.Decimal;
      totalDebitadoCop: Prisma.Decimal | null;

      monedaPago?: Moneda | null;
      montoPago?: Prisma.Decimal | null;
    },
  ) {
    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: salida.cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta asociada a la salida no existe.');
    }

    const movimientoOriginal = await tx.movimientoCuenta.findFirst({
      where: {
        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
      orderBy: {
        creadoEn: 'asc',
      },
    });

    const montoReversar = movimientoOriginal
      ? new Prisma.Decimal(movimientoOriginal.monto)
      : salida.monedaPago === cuenta.moneda && salida.montoPago
        ? new Prisma.Decimal(salida.montoPago)
        : new Prisma.Decimal(salida.totalDebitadoCop ?? salida.montoCop);

    await tx.cuenta.update({
      where: {
        id: cuenta.id,
      },
      data: {
        saldo: {
          increment: montoReversar,
        },
      },
    });

    /**
     * Al editar/eliminar no generamos
     * CANCELACION: eliminamos el efecto original
     * y luego lo recreamos.
     */
    await tx.movimientoCliente.deleteMany({
      where: {
        salidaId: salida.id,
      },
    });

    await tx.movimientoCuenta.deleteMany({
      where: {
        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
    });
  }

  /**
   * ==========================================
   * EDITAR PAGO A ACREEDOR
   * ==========================================
   */
  private async aplicarPagoAcreedorEditado(
    tx: Prisma.TransactionClient,
    salidaId: string,
    dto: UpdateSalidaDto,
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

    const calculo = this.calcularPagoAcreedor(dto, cuenta);

    const saldoAnterior = new Prisma.Decimal(cuenta.saldo);

    if (saldoAnterior.lt(calculo.totalDebitado)) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para registrar esta salida.',
      );
    }

    const saldoNuevo = saldoAnterior.sub(calculo.totalDebitado);

    const salida = await tx.salida.update({
      where: {
        id: salidaId,
      },
      data: {
        tipo: TipoSalida.PAGO_ACREEDOR,

        acreedorId,
        cuentaId: cuenta.id,

        monedaPago: calculo.monedaPago,

        montoPago: calculo.totalDebitado,

        monedaAplicacion: calculo.monedaAplicacion,

        montoAplicado: calculo.montoAplicado,

        tasaConversion: calculo.tasaConversion,

        montoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoEnviado
            : new Prisma.Decimal(0),

        montoBaseCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoBase
            : new Prisma.Decimal(0),

        proveedorCobra4x1000: calculo.proveedorCobra4x1000,

        impuestoProveedor4x1000Cop:
          calculo.monedaPago === Moneda.COP
            ? calculo.impuestoProveedor4x1000
            : new Prisma.Decimal(0),

        montoEnviadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoEnviado
            : new Prisma.Decimal(0),

        cuentaAplica4x1000: calculo.cuentaAplica4x1000,

        impuestoCuenta4x1000Cop:
          calculo.monedaPago === Moneda.COP
            ? calculo.impuestoCuenta4x1000
            : new Prisma.Decimal(0),

        totalDebitadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.totalDebitado
            : new Prisma.Decimal(0),

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

        monto: calculo.totalDebitado,

        moneda: calculo.monedaPago,

        saldoAnterior,
        saldoNuevo,

        descripcion: dto.descripcion ?? `Pago a acreedor ${acreedor.nombre}`,

        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,

        tipo: TipoMovimientoCliente.PAGO,

        salidaId: salida.id,

        monedaTransaccion: calculo.monedaPago,

        montoTransaccion: calculo.montoBase,

        moneda: calculo.monedaAplicacion,

        debito: calculo.montoAplicado,

        credito: new Prisma.Decimal(0),

        debitoCop:
          calculo.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicado
            : new Prisma.Decimal(0),

        creditoCop: new Prisma.Decimal(0),

        descripcion:
          dto.descripcion ??
          this.construirDescripcionPago({
            monedaPago: calculo.monedaPago,
            montoPago: calculo.montoBase,
            monedaAplicacion: calculo.monedaAplicacion,
            montoAplicado: calculo.montoAplicado,
            tasaConversion: calculo.tasaConversion,
            acreedorNombre: acreedor.nombre,
          }),
      },
    });

    return salida;
  }

  /**
   * ==========================================
   * EDITAR GASTO / RETIRO
   * ==========================================
   */
  private async aplicarSalidaSimpleEditada(
    tx: Prisma.TransactionClient,
    salidaId: string,
    dto: UpdateSalidaDto,
  ) {
    const cuenta = await this.validarCuentaParaSalida(tx, dto.cuentaId);

    const calculo = this.calcularSalidaSimple(dto, cuenta);

    const saldoAnterior = new Prisma.Decimal(cuenta.saldo);

    if (saldoAnterior.lt(calculo.totalDebitado)) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para registrar esta salida.',
      );
    }

    const saldoNuevo = saldoAnterior.sub(calculo.totalDebitado);

    const salida = await tx.salida.update({
      where: {
        id: salidaId,
      },
      data: {
        tipo: dto.tipo,

        acreedorId: null,
        cuentaId: cuenta.id,

        monedaPago: calculo.monedaPago,

        montoPago: calculo.totalDebitado,

        monedaAplicacion: calculo.monedaAplicacion,

        montoAplicado: calculo.montoAplicado,

        tasaConversion: null,

        montoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoBase
            : new Prisma.Decimal(0),

        montoBaseCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoBase
            : new Prisma.Decimal(0),

        proveedorCobra4x1000: false,

        impuestoProveedor4x1000Cop: new Prisma.Decimal(0),

        montoEnviadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.montoEnviado
            : new Prisma.Decimal(0),

        cuentaAplica4x1000: calculo.cuentaAplica4x1000,

        impuestoCuenta4x1000Cop:
          calculo.monedaPago === Moneda.COP
            ? calculo.impuestoCuenta4x1000
            : new Prisma.Decimal(0),

        totalDebitadoCop:
          calculo.monedaPago === Moneda.COP
            ? calculo.totalDebitado
            : new Prisma.Decimal(0),

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

        monto: calculo.totalDebitado,

        moneda: calculo.monedaPago,

        saldoAnterior,
        saldoNuevo,

        descripcion: dto.descripcion ?? `Salida ${salida.id}`,

        referenciaTipo: 'SALIDA',
        referenciaId: salida.id,
      },
    });

    return salida;
  }

  async editar(id: string, dto: UpdateSalidaDto) {
    this.validarDtoPorTipo(dto);

    const salidaActual = await this.prisma.salida.findUnique({
      where: {
        id,
      },
    });

    if (!salidaActual) {
      throw new NotFoundException('La salida no existe.');
    }

    if (salidaActual.estado === EstadoSalida.CANCELADA) {
      throw new BadRequestException('No se puede editar una salida cancelada.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.reversarSalida(tx, salidaActual);

      if (dto.tipo === TipoSalida.PAGO_ACREEDOR) {
        await this.aplicarPagoAcreedorEditado(tx, salidaActual.id, dto);
      } else if (
        dto.tipo === TipoSalida.GASTO ||
        dto.tipo === TipoSalida.RETIRO
      ) {
        await this.aplicarSalidaSimpleEditada(tx, salidaActual.id, dto);
      } else {
        throw new BadRequestException('Tipo de salida no soportado.');
      }

      return tx.salida.findUnique({
        where: {
          id: salidaActual.id,
        },
        include: this.salidaInclude(),
      });
    });
  }

  async eliminar(id: string) {
    const salida = await this.prisma.salida.findUnique({
      where: {
        id,
      },
    });

    if (!salida) {
      throw new NotFoundException('La salida no existe.');
    }

    if (salida.estado === EstadoSalida.CANCELADA) {
      throw new BadRequestException(
        'No se puede eliminar una salida cancelada.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.reversarSalida(tx, salida);

      await tx.salida.delete({
        where: {
          id: salida.id,
        },
      });

      return {
        id: salida.id,
        message: 'Salida eliminada correctamente.',
      };
    });
  }

  /**
   * ==========================================
   * VALIDACIONES
   * ==========================================
   */
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

    /**
     * Ya NO restringimos:
     *
     * categoria BASE_COP
     * moneda COP
     *
     * Las salidas pueden realizarse desde
     * cualquier cuenta activa.
     */
    return cuenta;
  }

  private validarDtoPorTipo(dto: CreateSalidaDto) {
    if (!dto.cuentaId) {
      throw new BadRequestException('La salida requiere cuentaId.');
    }

    if (!dto.montoPago || Number(dto.montoPago) <= 0) {
      throw new BadRequestException('La salida requiere montoPago mayor a 0.');
    }

    if (dto.tipo === TipoSalida.PAGO_ACREEDOR && !dto.acreedorId) {
      throw new BadRequestException('El pago a acreedor requiere acreedorId.');
    }

    if (dto.tipo === TipoSalida.PAGO_ACREEDOR && !dto.monedaAplicacion) {
      throw new BadRequestException(
        'El pago a acreedor requiere monedaAplicacion.',
      );
    }

    if (
      dto.tipo !== TipoSalida.PAGO_ACREEDOR &&
      dto.tipo !== TipoSalida.GASTO &&
      dto.tipo !== TipoSalida.RETIRO
    ) {
      throw new BadRequestException('Tipo de salida no soportado.');
    }
  }

  /**
   * ==========================================
   * CÁLCULO PAGO A ACREEDOR
   * ==========================================
   *
   * IMPORTANTE:
   *
   * tasaConversion ahora representa la tasa
   * COMERCIAL / VISIBLE que introduce el usuario.
   *
   * Ejemplos:
   *
   * 1 BS = 3.5 COP
   * 1 USD = 3200 COP
   * 1 USD = 36 BS
   * 1 USDT = 3150 COP
   *
   * Ya NO guardamos la tasa invertida.
   */
  private calcularPagoAcreedor(
    dto: Pick<
      CreateSalidaDto,
      | 'montoPago'
      | 'monedaAplicacion'
      | 'tasaConversion'
      | 'proveedorCobra4x1000'
    >,
    cuenta: {
      moneda: Moneda;
      aplica4x1000: boolean;
    },
  ): CalculoSalida {
    const monedaPago = cuenta.moneda;

    const monedaAplicacion = dto.monedaAplicacion;

    if (!monedaAplicacion) {
      throw new BadRequestException(
        'Debe indicar la moneda de la deuda a reducir.',
      );
    }

    const montoBase = new Prisma.Decimal(dto.montoPago);

    if (montoBase.lte(0)) {
      throw new BadRequestException('El monto del pago debe ser mayor a 0.');
    }

    const mismaMoneda = monedaPago === monedaAplicacion;

    let tasaConversion: Prisma.Decimal | null = null;

    if (!mismaMoneda) {
      if (
        dto.tasaConversion === undefined ||
        dto.tasaConversion === null ||
        Number(dto.tasaConversion) <= 0
      ) {
        throw new BadRequestException(
          'La tasa de conversión es obligatoria cuando la moneda de la cuenta y la moneda de la deuda son diferentes.',
        );
      }

      /**
       * Se guarda exactamente la tasa comercial
       * recibida desde el frontend.
       *
       * Ej:
       * 1 BS = 3.5 COP
       *
       * tasaConversion = 3.5
       */
      tasaConversion = new Prisma.Decimal(dto.tasaConversion);
    }

    /**
     * 4x1000 SOLO si la cuenta es COP.
     */
    const puede4x1000 = monedaPago === Moneda.COP;

    const proveedorCobra4x1000 =
      puede4x1000 && (dto.proveedorCobra4x1000 ?? false);

    const impuestoProveedor4x1000 = proveedorCobra4x1000
      ? montoBase.mul('0.004')
      : new Prisma.Decimal(0);

    const montoEnviado = montoBase.add(impuestoProveedor4x1000);

    const cuentaAplica4x1000 = puede4x1000 && cuenta.aplica4x1000;

    const impuestoCuenta4x1000 = cuentaAplica4x1000
      ? montoEnviado.mul('0.004')
      : new Prisma.Decimal(0);

    const totalDebitado = montoEnviado.add(impuestoCuenta4x1000);

    /**
     * Los impuestos NO reducen la deuda.
     *
     * Solo convertimos el monto base utilizando
     * la tasa comercial.
     */
    const montoAplicado = mismaMoneda
      ? montoBase
      : this.convertirMontoPorTasaComercial({
          monto: montoBase,
          monedaOrigen: monedaPago,
          monedaDestino: monedaAplicacion,
          tasa: tasaConversion!,
        });

    return {
      monedaPago,
      montoBase,
      totalDebitado,

      proveedorCobra4x1000,
      impuestoProveedor4x1000,

      cuentaAplica4x1000,
      impuestoCuenta4x1000,

      montoEnviado,

      monedaAplicacion,
      montoAplicado,
      tasaConversion,
    };
  }

  /**
   * ==========================================
   * CONVERSIÓN CON TASA COMERCIAL
   * ==========================================
   *
   * Convenciones visuales del sistema:
   *
   * 1 BS   = X COP
   * 1 USD  = X COP
   * 1 USD  = X BS
   * 1 USDT = X COP
   * 1 USDT = X BS
   * 1 USD  = X USDT
   *
   * Si el dinero va BASE -> QUOTE:
   * multiplicamos.
   *
   * Si va QUOTE -> BASE:
   * dividimos.
   */
  private convertirMontoPorTasaComercial(params: {
    monto: Prisma.Decimal;
    monedaOrigen: Moneda;
    monedaDestino: Moneda;
    tasa: Prisma.Decimal;
  }) {
    const { monto, monedaOrigen, monedaDestino, tasa } = params;

    if (tasa.lte(0)) {
      throw new BadRequestException(
        'La tasa de conversión debe ser mayor a 0.',
      );
    }

    const par = this.getParTasa(monedaOrigen, monedaDestino);

    /**
     * Ej:
     * BS -> COP
     *
     * 10.000 BS × 3.5
     * = 35.000 COP
     */
    if (monedaOrigen === par.base && monedaDestino === par.quote) {
      return monto.mul(tasa);
    }

    /**
     * Ej:
     * COP -> BS
     *
     * 35.000 COP ÷ 3.5
     * = 10.000 BS
     */
    return monto.div(tasa);
  }

  private getParTasa(
    monedaA: Moneda,
    monedaB: Moneda,
  ): {
    base: Moneda;
    quote: Moneda;
  } {
    /**
     * 1 BS = X COP
     */
    if (
      (monedaA === Moneda.BS && monedaB === Moneda.COP) ||
      (monedaA === Moneda.COP && monedaB === Moneda.BS)
    ) {
      return {
        base: Moneda.BS,
        quote: Moneda.COP,
      };
    }

    /**
     * 1 USD = X COP
     */
    if (
      (monedaA === Moneda.USD && monedaB === Moneda.COP) ||
      (monedaA === Moneda.COP && monedaB === Moneda.USD)
    ) {
      return {
        base: Moneda.USD,
        quote: Moneda.COP,
      };
    }

    /**
     * 1 USD = X BS
     */
    if (
      (monedaA === Moneda.USD && monedaB === Moneda.BS) ||
      (monedaA === Moneda.BS && monedaB === Moneda.USD)
    ) {
      return {
        base: Moneda.USD,
        quote: Moneda.BS,
      };
    }

    /**
     * 1 USDT = X COP
     */
    if (
      (monedaA === Moneda.USDT && monedaB === Moneda.COP) ||
      (monedaA === Moneda.COP && monedaB === Moneda.USDT)
    ) {
      return {
        base: Moneda.USDT,
        quote: Moneda.COP,
      };
    }

    /**
     * 1 USDT = X BS
     */
    if (
      (monedaA === Moneda.USDT && monedaB === Moneda.BS) ||
      (monedaA === Moneda.BS && monedaB === Moneda.USDT)
    ) {
      return {
        base: Moneda.USDT,
        quote: Moneda.BS,
      };
    }

    /**
     * 1 USD = X USDT
     */
    if (
      (monedaA === Moneda.USD && monedaB === Moneda.USDT) ||
      (monedaA === Moneda.USDT && monedaB === Moneda.USD)
    ) {
      return {
        base: Moneda.USD,
        quote: Moneda.USDT,
      };
    }

    /**
     * Fallback defensivo.
     */
    return {
      base: monedaA,
      quote: monedaB,
    };
  }

  /**
   * ==========================================
   * CÁLCULO GASTO / RETIRO
   * ==========================================
   */
  private calcularSalidaSimple(
    dto: Pick<CreateSalidaDto, 'montoPago'>,
    cuenta: {
      moneda: Moneda;
      aplica4x1000: boolean;
    },
  ): CalculoSalida {
    const monedaPago = cuenta.moneda;

    const montoBase = new Prisma.Decimal(dto.montoPago);

    if (montoBase.lte(0)) {
      throw new BadRequestException('El monto debe ser mayor a 0.');
    }

    const cuentaAplica4x1000 = monedaPago === Moneda.COP && cuenta.aplica4x1000;

    const impuestoCuenta4x1000 = cuentaAplica4x1000
      ? montoBase.mul('0.004')
      : new Prisma.Decimal(0);

    const totalDebitado = montoBase.add(impuestoCuenta4x1000);

    return {
      monedaPago,
      montoBase,
      totalDebitado,

      proveedorCobra4x1000: false,
      impuestoProveedor4x1000: new Prisma.Decimal(0),

      cuentaAplica4x1000,
      impuestoCuenta4x1000,

      montoEnviado: montoBase,

      monedaAplicacion: monedaPago,

      montoAplicado: montoBase,

      tasaConversion: null,
    };
  }

  private construirDescripcionPago(params: {
    monedaPago: Moneda;
    montoPago: Prisma.Decimal;
    monedaAplicacion: Moneda;
    montoAplicado: Prisma.Decimal;
    tasaConversion: Prisma.Decimal | null;
    acreedorNombre: string;
  }) {
    const {
      monedaPago,
      montoPago,
      monedaAplicacion,
      montoAplicado,
      tasaConversion,
      acreedorNombre,
    } = params;

    if (!tasaConversion) {
      return (
        `Pago a ${acreedorNombre}: ` + `${montoPago.toFixed(6)} ${monedaPago}.`
      );
    }

    return [
      `Pago a ${acreedorNombre}: ${montoPago.toFixed(6)} ${monedaPago}.`,
      `Aplicado a deuda: ${montoAplicado.toFixed(6)} ${monedaAplicacion}.`,
      `Tasa aplicada: ${this.getDescripcionTasa(
        monedaPago,
        monedaAplicacion,
        tasaConversion,
      )}.`,
    ].join(' ');
  }

  private getDescripcionTasa(
    monedaPago: Moneda,
    monedaAplicacion: Moneda,
    tasa: Prisma.Decimal,
  ) {
    const par = this.getParTasa(monedaPago, monedaAplicacion);

    return `1 ${par.base} = ${tasa.toString()} ${par.quote}`;
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
          aplica4x1000: true,
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
}
