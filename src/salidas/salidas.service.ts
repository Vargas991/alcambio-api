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
import { UpdateSalidaDto } from './dto/update-salida.dto';

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
    throw new BadRequestException(
      'El pago a acreedor requiere acreedorId.',
    );
  }

  const acreedor = await tx.cliente.findUnique({
    where: {
      id: acreedorId,
    },
  });

  if (!acreedor) {
    throw new NotFoundException(
      'El acreedor no existe.',
    );
  }

  const cuenta =
    await this.validarCuentaParaSalida(
      tx,
      dto.cuentaId,
    );

  const calculoSalida =
    this.calcularSalidaCon4x1000({
      montoBaseCop: dto.montoCop,

      proveedorCobra4x1000:
        dto.proveedorCobra4x1000 ?? false,

      modo4x1000Proveedor:
        dto.modo4x1000Proveedor ?? 'SUMAR',

      cuentaAplica4x1000:
        cuenta.aplica4x1000,
    });

  const saldoActual =
    Number(cuenta.saldo);

  if (
    saldoActual <
    calculoSalida.totalDebitadoCop
  ) {
    throw new BadRequestException(
      'La cuenta no tiene saldo suficiente para registrar esta salida.',
    );
  }

  const saldoNuevo =
    saldoActual -
    calculoSalida.totalDebitadoCop;

  const salida =
    await tx.salida.create({
      data: {
        tipo:
          TipoSalida.PAGO_ACREEDOR,

        acreedorId,

        cuentaId:
          dto.cuentaId,

        /**
         * Lo que efectivamente reduce
         * la deuda del acreedor.
         *
         * SUMAR:
         * montoBaseCop
         *
         * RESTAR:
         * montoBaseCop - 4x1000 proveedor
         */
        montoCop:
          calculoSalida.montoAbonadoCop,

        montoBaseCop:
          calculoSalida.montoBaseCop,

        proveedorCobra4x1000:
          calculoSalida.proveedorCobra4x1000,

        /**
         * Guardamos el modo solamente cuando
         * el proveedor realmente cobra 4x1000.
         */
        modo4x1000Proveedor:
          calculoSalida.proveedorCobra4x1000
            ? calculoSalida.modo4x1000Proveedor
            : null,

        impuestoProveedor4x1000Cop:
          calculoSalida
            .impuestoProveedor4x1000Cop,

        /**
         * Dinero realmente enviado
         * hacia el proveedor.
         */
        montoEnviadoCop:
          calculoSalida.montoEnviadoCop,

        cuentaAplica4x1000:
          calculoSalida.cuentaAplica4x1000,

        impuestoCuenta4x1000Cop:
          calculoSalida
            .impuestoCuenta4x1000Cop,

        /**
         * Todo lo debitado de nuestra cuenta.
         *
         * Incluye:
         * - monto enviado
         * - 4x1000 propio de la cuenta
         */
        totalDebitadoCop:
          calculoSalida.totalDebitadoCop,

        descripcion:
          dto.descripcion,

        referencia:
          dto.referencia,

        notas:
          dto.notas,
      },
    });

  /**
   * Actualizamos saldo de nuestra cuenta.
   */
  await tx.cuenta.update({
    where: {
      id: cuenta.id,
    },

    data: {
      saldo: saldoNuevo,
    },
  });

  /**
   * Ledger de nuestra cuenta.
   *
   * Aquí debe registrarse TODO lo
   * que realmente salió de la cuenta.
   */
  await tx.movimientoCuenta.create({
    data: {
      cuentaId:
        cuenta.id,

      tipo:
        TipoMovimientoCuenta.SALIDA,

      monto:
        calculoSalida.totalDebitadoCop,

      moneda:
        cuenta.moneda,

      saldoAnterior:
        saldoActual,

      saldoNuevo,

      descripcion:
        dto.descripcion ??
        `Pago a acreedor ${acreedor.nombre}`,

      referenciaTipo:
        'SALIDA',

      referenciaId:
        salida.id,
    },
  });

  /**
   * Ledger del acreedor.
   *
   * Solo debe reducirse la deuda por
   * el monto efectivamente abonado.
   *
   * SUMAR:
   * 1.000.000
   *
   * RESTAR:
   * 996.000
   */
  await tx.movimientoCliente.create({
    data: {
      clienteId:
        acreedorId,

      tipo:
        TipoMovimientoCliente.PAGO,

      salidaId:
        salida.id,

      monedaTransaccion:
        'COP',

      montoTransaccion:
        calculoSalida.montoAbonadoCop,

      debitoCop:
        calculoSalida.montoAbonadoCop,

      creditoCop:
        0,

      descripcion:
        dto.descripcion ??
        `Pago a acreedor ${acreedor.nombre}`,
    },
  });

  return tx.salida.findUnique({
    where: {
      id: salida.id,
    },

    include:
      this.salidaInclude(),
  });
}

  private async crearSalidaSimple(
    tx: Prisma.TransactionClient,
    dto: CreateSalidaDto,
  ) {
    const cuenta = await this.validarCuentaParaSalida(tx, dto.cuentaId);

    /**
     * En GASTO y RETIRO no hay proveedor cobrando 4x1000.
     * Pero sí puede aplicar el 4x1000 de la cuenta propia
     * si la cuenta tiene aplica4x1000 = true.
     */
    const calculoSalida = this.calcularSalidaCon4x1000({
      montoBaseCop: dto.montoCop,
      proveedorCobra4x1000: false,
      cuentaAplica4x1000: cuenta.aplica4x1000,
    });

    const saldoActual = Number(cuenta.saldo);

    if (saldoActual < calculoSalida.totalDebitadoCop) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para registrar esta salida.',
      );
    }

    const saldoNuevo = saldoActual - calculoSalida.totalDebitadoCop;

    const salida = await tx.salida.create({
      data: {
        tipo: dto.tipo,
        acreedorId: null,
        cuentaId: dto.cuentaId,

        /**
         * En gasto/retiro, montoCop representa el monto base.
         */
        montoCop: calculoSalida.montoBaseCop,

        /**
         * Trazabilidad 4x1000.
         */
        montoBaseCop: calculoSalida.montoBaseCop,
        proveedorCobra4x1000: false,
        impuestoProveedor4x1000Cop: 0,
        montoEnviadoCop: calculoSalida.montoEnviadoCop,
        cuentaAplica4x1000: calculoSalida.cuentaAplica4x1000,
        impuestoCuenta4x1000Cop: calculoSalida.impuestoCuenta4x1000Cop,
        totalDebitadoCop: calculoSalida.totalDebitadoCop,

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
        monto: calculoSalida.totalDebitadoCop,
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

      const saldoActual = Number(cuenta.saldo);

      /**
       * Para reversar la cuenta, se devuelve exactamente
       * lo que realmente salió de la cuenta.
       *
       * Fallback a montoCop para salidas antiguas anteriores
       * a los campos de 4x1000.
       */
      const montoSalida = Number(salida.totalDebitadoCop || salida.montoCop);
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

  private async reversarSalida(
  tx: Prisma.TransactionClient,
  salida: {
    id: string;
    tipo: TipoSalida;
    estado: EstadoSalida;
    cuentaId: string;
    montoCop: Prisma.Decimal;
    totalDebitadoCop: Prisma.Decimal | null;
  },
) {
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

  /**
   * Debemos devolver EXACTAMENTE lo que salió
   * originalmente de la cuenta.
   *
   * Para registros antiguos hacemos fallback
   * a montoCop.
   */
  const montoReversar = Number(
    salida.totalDebitadoCop ?? salida.montoCop,
  );

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
   * Eliminamos cualquier movimiento del cliente
   * generado por la salida.
   *
   * Esto automáticamente revierte el efecto
   * sobre su balance.
   */
  await tx.movimientoCliente.deleteMany({
    where: {
      salidaId: salida.id,
    },
  });

  /**
   * Eliminamos el movimiento original de cuenta.
   */
  await tx.movimientoCuenta.deleteMany({
    where: {
      referenciaTipo: 'SALIDA',
      referenciaId: salida.id,
    },
  });
}

private async aplicarPagoAcreedorEditado(
  tx: Prisma.TransactionClient,
  salidaId: string,
  dto: UpdateSalidaDto,
) {
  const acreedorId = dto.acreedorId;

  if (!acreedorId) {
    throw new BadRequestException(
      'El pago a acreedor requiere acreedorId.',
    );
  }

  const acreedor = await tx.cliente.findUnique({
    where: {
      id: acreedorId,
    },
  });

  if (!acreedor) {
    throw new NotFoundException(
      'El acreedor no existe.',
    );
  }

  const cuenta = await this.validarCuentaParaSalida(
    tx,
    dto.cuentaId,
  );

  /**
   * Calculamos nuevamente:
   *
   * montoBase
   * + 4x1000 proveedor
   * = montoEnviado
   *
   * montoEnviado
   * + 4x1000 cuenta
   * = totalDebitado
   */
  const calculo = this.calcularSalidaCon4x1000({
    montoBaseCop: dto.montoCop,
    proveedorCobra4x1000:
      dto.proveedorCobra4x1000 ?? false,
    modo4x1000Proveedor:
      dto.modo4x1000Proveedor ?? 'SUMAR',
    cuentaAplica4x1000:
      cuenta.aplica4x1000,
  });

  const saldoAnterior = Number(cuenta.saldo);

  if (
    saldoAnterior <
    calculo.totalDebitadoCop
  ) {
    throw new BadRequestException(
      'La cuenta no tiene saldo suficiente para registrar esta salida.',
    );
  }

  const saldoNuevo =
    saldoAnterior -
    calculo.totalDebitadoCop;

  const salida = await tx.salida.update({
    where: {
      id: salidaId,
    },
    data: {
      tipo: TipoSalida.PAGO_ACREEDOR,

      acreedorId,
      cuentaId: cuenta.id,

      /**
       * montoCop representa lo que efectivamente
       * reduce la deuda del acreedor.
       *
       * SUMAR  -> montoBaseCop
       * RESTAR -> montoBaseCop - 4x1000 proveedor
       */
      montoCop: calculo.montoAbonadoCop,

      montoBaseCop:
        calculo.montoBaseCop,

      proveedorCobra4x1000:
        calculo.proveedorCobra4x1000,

      impuestoProveedor4x1000Cop:
        calculo.impuestoProveedor4x1000Cop,

      montoEnviadoCop:
        calculo.montoEnviadoCop,

      cuentaAplica4x1000:
        calculo.cuentaAplica4x1000,

      impuestoCuenta4x1000Cop:
        calculo.impuestoCuenta4x1000Cop,

      totalDebitadoCop:
        calculo.totalDebitadoCop,

      descripcion: dto.descripcion,
      referencia: dto.referencia,
      notas: dto.notas,
    },
  });

  /**
   * Descontar nuevamente de la cuenta.
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

      tipo:
        TipoMovimientoCuenta.SALIDA,

      monto:
        calculo.totalDebitadoCop,

      moneda: cuenta.moneda,

      saldoAnterior,
      saldoNuevo,

      descripcion:
        dto.descripcion ??
        `Pago a acreedor ${salida.id}`,

      referenciaTipo: 'SALIDA',
      referenciaId: salida.id,
    },
  });

  /**
   * La deuda del acreedor se reduce por el monto
   * efectivamente abonado.
   *
   * SUMAR:
   * montoAbonadoCop = montoBaseCop
   *
   * RESTAR:
   * montoAbonadoCop =
   * montoBaseCop - 4x1000 proveedor
   */
  await tx.movimientoCliente.create({
    data: {
      clienteId: acreedorId,

      tipo:
        TipoMovimientoCliente.PAGO,

      salidaId: salida.id,

      monedaTransaccion: 'COP',

      montoTransaccion:
        calculo.montoAbonadoCop,

      debitoCop:
        calculo.montoAbonadoCop,

      creditoCop: 0,

      descripcion:
        dto.descripcion ??
        `Pago a acreedor ${salida.id}`,
    },
  });

  return salida;
}

private async aplicarSalidaSimpleEditada(
  tx: Prisma.TransactionClient,
  salidaId: string,
  dto: UpdateSalidaDto,
) {
  const cuenta = await this.validarCuentaParaSalida(
    tx,
    dto.cuentaId,
  );

  const calculo =
    this.calcularSalidaCon4x1000({
      montoBaseCop: dto.montoCop,

      /**
       * GASTO / RETIRO nunca llevan
       * 4x1000 de proveedor.
       */
      proveedorCobra4x1000: false,

      /**
       * Pero la cuenta sí puede cobrar
       * automáticamente su propio 4x1000.
       */
      cuentaAplica4x1000:
        cuenta.aplica4x1000,
    });

  const saldoAnterior =
    Number(cuenta.saldo);

  if (
    saldoAnterior <
    calculo.totalDebitadoCop
  ) {
    throw new BadRequestException(
      'La cuenta no tiene saldo suficiente para registrar esta salida.',
    );
  }

  const saldoNuevo =
    saldoAnterior -
    calculo.totalDebitadoCop;

  const salida =
    await tx.salida.update({
      where: {
        id: salidaId,
      },
      data: {
        tipo: dto.tipo,

        acreedorId: null,
        cuentaId: cuenta.id,

        montoCop:
          calculo.montoBaseCop,

        montoBaseCop:
          calculo.montoBaseCop,

        /**
         * Limpiamos cualquier dato que
         * pudiera venir de un PAGO_ACREEDOR
         * anterior.
         */
        proveedorCobra4x1000: false,

        impuestoProveedor4x1000Cop: 0,

        montoEnviadoCop:
          calculo.montoEnviadoCop,

        cuentaAplica4x1000:
          calculo.cuentaAplica4x1000,

        impuestoCuenta4x1000Cop:
          calculo.impuestoCuenta4x1000Cop,

        totalDebitadoCop:
          calculo.totalDebitadoCop,

        descripcion:
          dto.descripcion,

        referencia:
          dto.referencia,

        notas:
          dto.notas,
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
        dto.tipo ===
        TipoSalida.GASTO
          ? TipoMovimientoCuenta.GASTO
          : TipoMovimientoCuenta.SALIDA,

      monto:
        calculo.totalDebitadoCop,

      moneda: cuenta.moneda,

      saldoAnterior,
      saldoNuevo,

      descripcion:
        dto.descripcion ??
        `Salida ${salida.id}`,

      referenciaTipo: 'SALIDA',
      referenciaId: salida.id,
    },
  });

  return salida;
}

async editar(
  id: string,
  dto: UpdateSalidaDto,
) {
  this.validarDtoPorTipo(dto);

  const salidaActual =
    await this.prisma.salida.findUnique({
      where: {
        id,
      },
    });

  if (!salidaActual) {
    throw new NotFoundException(
      'La salida no existe.',
    );
  }

  if (
    salidaActual.estado ===
    EstadoSalida.CANCELADA
  ) {
    throw new BadRequestException(
      'No se puede editar una salida cancelada.',
    );
  }

  return this.prisma.$transaction(
    async (tx) => {
      /**
       * 1. Revertir completamente la salida
       * anterior.
       */
      await this.reversarSalida(
        tx,
        salidaActual,
      );

      /**
       * 2. Aplicar los nuevos datos.
       */
      if (
        dto.tipo ===
        TipoSalida.PAGO_ACREEDOR
      ) {
        await this.aplicarPagoAcreedorEditado(
          tx,
          salidaActual.id,
          dto,
        );
      } else if (
        dto.tipo === TipoSalida.GASTO ||
        dto.tipo === TipoSalida.RETIRO
      ) {
        await this.aplicarSalidaSimpleEditada(
          tx,
          salidaActual.id,
          dto,
        );
      } else {
        throw new BadRequestException(
          'Tipo de salida no soportado.',
        );
      }

      return tx.salida.findUnique({
        where: {
          id: salidaActual.id,
        },
        include:
          this.salidaInclude(),
      });
    },
  );
}

async eliminar(id: string) {
  const salida =
    await this.prisma.salida.findUnique({
      where: {
        id,
      },
    });

  if (!salida) {
    throw new NotFoundException(
      'La salida no existe.',
    );
  }

  if (
    salida.estado ===
    EstadoSalida.CANCELADA
  ) {
    throw new BadRequestException(
      'No se puede eliminar una salida cancelada.',
    );
  }

  return this.prisma.$transaction(
    async (tx) => {
      /**
       * 1. Revertir cuenta y ledger.
       */
      await this.reversarSalida(
        tx,
        salida,
      );

      /**
       * 2. Eliminar físicamente.
       */
      await tx.salida.delete({
        where: {
          id: salida.id,
        },
      });

      return {
        id: salida.id,
        message:
          'Salida eliminada correctamente.',
      };
    },
  );
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

  private calcularSalidaCon4x1000(params: {
  montoBaseCop: number;
  proveedorCobra4x1000: boolean;
  modo4x1000Proveedor?: 'SUMAR' | 'RESTAR';
  cuentaAplica4x1000: boolean;
}) {
  const montoBaseCop =
    this.redondearDosDecimales(
      params.montoBaseCop,
    );

  const modo4x1000Proveedor =
    params.modo4x1000Proveedor ?? 'SUMAR';

  const impuestoProveedor4x1000Cop =
    params.proveedorCobra4x1000
      ? this.redondearDosDecimales(
          montoBaseCop * 0.004,
        )
      : 0;

  let montoEnviadoCop = montoBaseCop;
  let montoAbonadoCop = montoBaseCop;

  /**
   * SUMAR:
   * El proveedor debe recibir el monto base completo.
   * Su 4x1000 se agrega al dinero enviado.
   */
  if (
    params.proveedorCobra4x1000 &&
    modo4x1000Proveedor === 'SUMAR'
  ) {
    montoEnviadoCop =
      this.redondearDosDecimales(
        montoBaseCop +
          impuestoProveedor4x1000Cop,
      );

    montoAbonadoCop = montoBaseCop;
  }

  /**
   * RESTAR:
   * El dinero enviado sigue siendo el monto base,
   * pero el proveedor descuenta su 4x1000.
   */
  if (
    params.proveedorCobra4x1000 &&
    modo4x1000Proveedor === 'RESTAR'
  ) {
    montoEnviadoCop = montoBaseCop;

    montoAbonadoCop =
      this.redondearDosDecimales(
        montoBaseCop -
          impuestoProveedor4x1000Cop,
      );
  }

  /**
   * El 4x1000 propio de la cuenta se calcula
   * sobre lo que realmente se debita/envía
   * desde la cuenta.
   */
  const impuestoCuenta4x1000Cop =
    params.cuentaAplica4x1000
      ? this.redondearDosDecimales(
          montoEnviadoCop * 0.004,
        )
      : 0;

  const totalDebitadoCop =
    this.redondearDosDecimales(
      montoEnviadoCop +
        impuestoCuenta4x1000Cop,
    );

  return {
    montoBaseCop,

    proveedorCobra4x1000:
      params.proveedorCobra4x1000,

    modo4x1000Proveedor,

    impuestoProveedor4x1000Cop,

    montoEnviadoCop,

    montoAbonadoCop,

    cuentaAplica4x1000:
      params.cuentaAplica4x1000,

    impuestoCuenta4x1000Cop,

    totalDebitadoCop,
  };
}

  private redondearDosDecimales(valor: number) {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
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
