import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CategoriaCuenta,
  EstadoEntidad,
  EstadoEntrada,
  Moneda,
  Prisma,
  TipoEntrada,
  TipoMovimientoCliente,
  TipoMovimientoCuenta,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateEntradaDto } from './dto/create-entrada.dto';
import { CancelarEntradaDto } from './dto/cancelar-entrada.dto';
import { UpdateEntradaDto } from './dto/update-entrada.dto';

@Injectable()
export class EntradasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEntradaDto) {
    this.validarDtoPorTipo(dto);

    return this.prisma.$transaction(async (tx) => {
      if (dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
        return this.crearAbonoCuentaPropia(tx, dto);
      }

      return this.crearAbonoDirectoProveedor(tx, dto);
    });
  }

  findAll() {
    return this.prisma.entrada.findMany({
      orderBy: {
        creadoEn: 'desc',
      },
      include: this.entradaInclude(),
    });
  }

  async findOne(id: string) {
    const entrada = await this.prisma.entrada.findUnique({
      where: {
        id,
      },
      include: this.entradaInclude(),
    });

    if (!entrada) {
      throw new NotFoundException('La entrada no existe.');
    }

    return entrada;
  }

  private async crearAbonoCuentaPropia(
  tx: Prisma.TransactionClient,
  dto: CreateEntradaDto,
) {
  const cuentaId = dto.cuentaId;

  if (!cuentaId) {
    throw new BadRequestException(
      'El abono a cuenta propia requiere cuentaId.',
    );
  }

  const deudor = await tx.cliente.findUnique({
    where: {
      id: dto.deudorId,
    },
  });

  if (!deudor) {
    throw new NotFoundException(
      'El deudor no existe.',
    );
  }

  const cuenta = await tx.cuenta.findUnique({
    where: {
      id: cuentaId,
    },
  });

  if (!cuenta) {
    throw new NotFoundException(
      'La cuenta no existe.',
    );
  }

  if (cuenta.estado !== EstadoEntidad.ACTIVO) {
    throw new BadRequestException(
      'La cuenta está inactiva.',
    );
  }

  if (cuenta.categoria !== CategoriaCuenta.BASE_COP) {
    throw new BadRequestException(
      'Los abonos a cuenta propia deben registrarse en cuentas BASE_COP.',
    );
  }

  if (cuenta.moneda !== Moneda.COP) {
    throw new BadRequestException(
      'Los abonos a cuenta propia deben registrarse en cuentas COP.',
    );
  }

  const calculo = this.calcularAbonoCuentaPropia({
    montoCop: dto.montoCop,
    aplica4x1000: dto.aplica4x1000,
  });

  const saldoActual = Number(cuenta.saldo);

  /**
   * A la cuenta entra el monto completo.
   */
  const saldoNuevo =
    saldoActual + calculo.montoCop;

  const entrada = await tx.entrada.create({
    data: {
      tipo: TipoEntrada.ABONO_CUENTA_PROPIA,

      deudorId: dto.deudorId,
      acreedorId: null,
      cuentaId,

      /**
       * Lo que realmente entró a la cuenta.
       */
      montoCop: calculo.montoCop,

      aplica4x1000: calculo.aplica4x1000,

      impuesto4x1000Cop:
        calculo.impuesto4x1000Cop,

      /**
       * Lo que realmente se descuenta
       * de la deuda del cliente.
       */
      montoAplicadoDeudaCop:
        calculo.montoAplicadoDeudaCop,

      descripcion: dto.descripcion,
      referencia: dto.referencia,
      notas: dto.notas,
    },
  });

  /**
   * CUENTA
   *
   * Recibe el monto completo.
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

      tipo: TipoMovimientoCuenta.ENTRADA,

      /**
       * Movimiento real:
       * entraron 100.000.
       */
      monto: calculo.montoCop,

      moneda: cuenta.moneda,

      saldoAnterior: saldoActual,
      saldoNuevo,

      descripcion:
        dto.descripcion ??
        `Abono recibido ${entrada.id}`,

      referenciaTipo: 'ENTRADA',
      referenciaId: entrada.id,
    },
  });

  /**
   * CLIENTE
   *
   * Si cobra 4x1000, su deuda disminuye
   * solamente por el neto.
   */
  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.deudorId,

      tipo: TipoMovimientoCliente.ABONO,

      entradaId: entrada.id,

      monedaTransaccion: Moneda.COP,

      /**
       * Es mejor guardar aquí también el monto
       * aplicado a deuda.
       */
      montoTransaccion:
        calculo.montoAplicadoDeudaCop,

      debitoCop: 0,

      creditoCop:
        calculo.montoAplicadoDeudaCop,

      descripcion:
        dto.descripcion ??
        `Abono a cuenta propia ${entrada.id}`,
    },
  });

  return tx.entrada.findUnique({
    where: {
      id: entrada.id,
    },

    include: this.entradaInclude(),
  });
}


private async reversarEntrada(
  tx: Prisma.TransactionClient,
  entrada: {
    id: string;
    tipo: TipoEntrada;
    estado: EstadoEntrada;
    cuentaId: string | null;
    montoCop: Prisma.Decimal;
  },
) {
  /**
   * ABONO A CUENTA PROPIA
   *
   * Al crear:
   * cuenta += montoCop
   *
   * Al reversar:
   * cuenta -= montoCop
   *
   * IMPORTANTE:
   * aunque exista 4x1000, a la cuenta entró
   * el monto completo.
   */
  if (entrada.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
    if (!entrada.cuentaId) {
      throw new BadRequestException(
        'La entrada no tiene una cuenta asociada.',
      );
    }

    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: entrada.cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException(
        'La cuenta asociada a la entrada no existe.',
      );
    }

    const saldoActual = Number(cuenta.saldo);
    const montoEntrada = Number(entrada.montoCop);

    if (saldoActual < montoEntrada) {
      throw new BadRequestException(
        `La cuenta "${cuenta.nombre}" no tiene saldo suficiente para reversar esta entrada.`,
      );
    }

    await tx.cuenta.update({
      where: {
        id: cuenta.id,
      },
      data: {
        saldo: {
          decrement: montoEntrada,
        },
      },
    });
  }

  /**
   * Eliminamos los movimientos generados
   * originalmente por esta entrada.
   *
   * Esto revierte el efecto sobre el saldo
   * calculado de los clientes.
   */
  await tx.movimientoCliente.deleteMany({
    where: {
      entradaId: entrada.id,
    },
  });

  /**
   * Solo ABONO_CUENTA_PROPIA genera
   * MovimientoCuenta actualmente.
   */
  await tx.movimientoCuenta.deleteMany({
    where: {
      referenciaTipo: 'ENTRADA',
      referenciaId: entrada.id,
    },
  });
}

private async aplicarAbonoCuentaPropiaEditado(
  tx: Prisma.TransactionClient,
  entradaId: string,
  dto: UpdateEntradaDto,
) {
  const cuentaId = dto.cuentaId;

  if (!cuentaId) {
    throw new BadRequestException(
      'El abono a cuenta propia requiere cuentaId.',
    );
  }

  const deudor = await tx.cliente.findUnique({
    where: {
      id: dto.deudorId,
    },
  });

  if (!deudor) {
    throw new NotFoundException(
      'El deudor no existe.',
    );
  }

  const cuenta = await tx.cuenta.findUnique({
    where: {
      id: cuentaId,
    },
  });

  if (!cuenta) {
    throw new NotFoundException(
      'La cuenta no existe.',
    );
  }

  if (cuenta.estado !== EstadoEntidad.ACTIVO) {
    throw new BadRequestException(
      'La cuenta está inactiva.',
    );
  }

  if (cuenta.categoria !== CategoriaCuenta.BASE_COP) {
    throw new BadRequestException(
      'Los abonos a cuenta propia deben registrarse en cuentas BASE_COP.',
    );
  }

  if (cuenta.moneda !== Moneda.COP) {
    throw new BadRequestException(
      'Los abonos a cuenta propia deben registrarse en cuentas COP.',
    );
  }

  const calculo = this.calcularAbonoCuentaPropia({
    montoCop: dto.montoCop,
    aplica4x1000: dto.aplica4x1000,
  });

  const saldoAnterior = Number(cuenta.saldo);

  /**
   * Entra el monto completo a la cuenta.
   */
  const saldoNuevo =
    saldoAnterior + calculo.montoCop;

  const entrada = await tx.entrada.update({
    where: {
      id: entradaId,
    },
    data: {
      tipo: TipoEntrada.ABONO_CUENTA_PROPIA,

      deudorId: dto.deudorId,
      acreedorId: null,
      cuentaId,

      montoCop: calculo.montoCop,

      aplica4x1000:
        calculo.aplica4x1000,

      impuesto4x1000Cop:
        calculo.impuesto4x1000Cop,

      montoAplicadoDeudaCop:
        calculo.montoAplicadoDeudaCop,

      /**
       * Limpiamos campos del otro tipo de entrada.
       */
      proveedorCobra4x1000: false,
      impuestoProveedor4x1000Cop: 0,
      montoNetoAcreedorCop: 0,

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

      tipo: TipoMovimientoCuenta.ENTRADA,

      /**
       * Lo que entró realmente.
       */
      monto: calculo.montoCop,

      moneda: cuenta.moneda,

      saldoAnterior,
      saldoNuevo,

      descripcion:
        dto.descripcion ??
        `Abono recibido ${entrada.id}`,

      referenciaTipo: 'ENTRADA',
      referenciaId: entrada.id,
    },
  });

  /**
   * La deuda baja únicamente por el monto
   * reconocido después del 4x1000.
   */
  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.deudorId,

      tipo: TipoMovimientoCliente.ABONO,

      entradaId: entrada.id,

      monedaTransaccion: Moneda.COP,

      montoTransaccion:
        calculo.montoAplicadoDeudaCop,

      debitoCop: 0,

      creditoCop:
        calculo.montoAplicadoDeudaCop,

      descripcion:
        dto.descripcion ??
        `Abono a cuenta propia ${entrada.id}`,
    },
  });

  return entrada;
}


private async aplicarAbonoDirectoProveedorEditado(
  tx: Prisma.TransactionClient,
  entradaId: string,
  dto: UpdateEntradaDto,
) {
  const acreedorId = dto.acreedorId;

  if (!acreedorId) {
    throw new BadRequestException(
      'El abono directo requiere acreedorId.',
    );
  }

  if (dto.deudorId === acreedorId) {
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
    throw new NotFoundException(
      'El deudor no existe.',
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

  const calculo =
    this.calcularAbonoDirectoProveedor({
      montoCop: dto.montoCop,
      proveedorCobra4x1000:
        dto.proveedorCobra4x1000,
    });

  const entrada = await tx.entrada.update({
    where: {
      id: entradaId,
    },
    data: {
      tipo:
        TipoEntrada.ABONO_DIRECTO_PROVEEDOR,

      deudorId: dto.deudorId,
      acreedorId,
      cuentaId: null,

      montoCop: calculo.montoCop,

      proveedorCobra4x1000:
        calculo.proveedorCobra4x1000,

      impuestoProveedor4x1000Cop:
        calculo.impuestoProveedor4x1000Cop,

      montoNetoAcreedorCop:
        calculo.montoNetoAcreedorCop,

      /**
       * Limpiar campos de cuenta propia.
       */
      aplica4x1000: false,
      impuesto4x1000Cop: 0,
      montoAplicadoDeudaCop: null,

      descripcion: dto.descripcion,
      referencia: dto.referencia,
      notas: dto.notas,
    },
  });

  /**
   * DEUDOR:
   * reconoce monto completo.
   */
  await tx.movimientoCliente.create({
    data: {
      clienteId: dto.deudorId,

      tipo:
        TipoMovimientoCliente.ABONO_DIRECTO,

      entradaId: entrada.id,

      monedaTransaccion: Moneda.COP,

      montoTransaccion:
        calculo.montoCop,

      debitoCop: 0,
      creditoCop: calculo.montoCop,

      descripcion:
        dto.descripcion ??
        `Abono directo del deudor ${entrada.id}`,
    },
  });

  /**
   * ACREEDOR:
   * solamente reconoce el neto.
   */
  await tx.movimientoCliente.create({
    data: {
      clienteId: acreedorId,

      tipo:
        TipoMovimientoCliente.ABONO_DIRECTO,

      entradaId: entrada.id,

      monedaTransaccion: Moneda.COP,

      montoTransaccion:
        calculo.montoNetoAcreedorCop,

      debitoCop:
        calculo.montoNetoAcreedorCop,

      creditoCop: 0,

      descripcion:
        dto.descripcion ??
        `Abono directo al acreedor ${entrada.id}`,
    },
  });

  return entrada;
}

async editar(
  id: string,
  dto: UpdateEntradaDto,
) {
  this.validarDtoPorTipo(dto);

  const entradaActual =
    await this.prisma.entrada.findUnique({
      where: {
        id,
      },
    });

  if (!entradaActual) {
    throw new NotFoundException(
      'La entrada no existe.',
    );
  }

  if (
    entradaActual.estado ===
    EstadoEntrada.CANCELADA
  ) {
    throw new BadRequestException(
      'No se puede editar una entrada cancelada.',
    );
  }

  return this.prisma.$transaction(
    async (tx) => {
      /**
       * 1. Revertir completamente
       * la entrada original.
       */
      await this.reversarEntrada(
        tx,
        entradaActual,
      );

      /**
       * 2. Aplicar nuevamente según el
       * nuevo tipo.
       *
       * La transacción garantiza que si
       * algo falla todo vuelve atrás.
       */
      if (
        dto.tipo ===
        TipoEntrada.ABONO_CUENTA_PROPIA
      ) {
        await this.aplicarAbonoCuentaPropiaEditado(
          tx,
          entradaActual.id,
          dto,
        );
      } else if (
        dto.tipo ===
        TipoEntrada.ABONO_DIRECTO_PROVEEDOR
      ) {
        await this.aplicarAbonoDirectoProveedorEditado(
          tx,
          entradaActual.id,
          dto,
        );
      } else {
        throw new BadRequestException(
          'Tipo de entrada no soportado.',
        );
      }

      return tx.entrada.findUnique({
        where: {
          id: entradaActual.id,
        },
        include: this.entradaInclude(),
      });
    },
  );
}

async eliminar(id: string) {
  const entrada =
    await this.prisma.entrada.findUnique({
      where: {
        id,
      },
    });

  if (!entrada) {
    throw new NotFoundException(
      'La entrada no existe.',
    );
  }

  if (
    entrada.estado ===
    EstadoEntrada.CANCELADA
  ) {
    throw new BadRequestException(
      'No se puede eliminar una entrada que ya fue cancelada.',
    );
  }

  return this.prisma.$transaction(
    async (tx) => {
      /**
       * 1. Revertir sus efectos.
       */
      await this.reversarEntrada(
        tx,
        entrada,
      );

      /**
       * 2. Eliminar físicamente la entrada.
       */
      await tx.entrada.delete({
        where: {
          id: entrada.id,
        },
      });

      return {
        id: entrada.id,
        message:
          'Entrada eliminada correctamente.',
      };
    },
  );
}

  private async crearAbonoDirectoProveedor(
    tx: Prisma.TransactionClient,
    dto: CreateEntradaDto,
  ) {
    const acreedorId = dto.acreedorId;

    if (!acreedorId) {
      throw new BadRequestException('El abono directo requiere acreedorId.');
    }

    if (dto.deudorId === acreedorId) {
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
        id: acreedorId,
      },
    });

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const calculoAbono = this.calcularAbonoDirectoProveedor({
      montoCop: dto.montoCop,
      proveedorCobra4x1000: dto.proveedorCobra4x1000,
    });

    const entrada = await tx.entrada.create({
      data: {
        tipo: TipoEntrada.ABONO_DIRECTO_PROVEEDOR,
        deudorId: dto.deudorId,
        acreedorId,
        cuentaId: null,
        montoCop: calculoAbono.montoCop,
        proveedorCobra4x1000: calculoAbono.proveedorCobra4x1000,
        impuestoProveedor4x1000Cop: calculoAbono.impuestoProveedor4x1000Cop,
        montoNetoAcreedorCop: calculoAbono.montoNetoAcreedorCop,
        descripcion: dto.descripcion,
        referencia: dto.referencia,
        notas: dto.notas,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.deudorId,
        tipo: TipoMovimientoCliente.ABONO_DIRECTO,
        entradaId: entrada.id,
        monedaTransaccion: 'COP',
        montoTransaccion: calculoAbono.montoCop,
        debitoCop: 0,
        creditoCop: calculoAbono.montoCop,
        descripcion:
          dto.descripcion ?? `Abono directo del deudor ${entrada.id}`,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,
        tipo: TipoMovimientoCliente.ABONO_DIRECTO,
        entradaId: entrada.id,
        monedaTransaccion: 'COP',
        montoTransaccion: calculoAbono.montoNetoAcreedorCop,
        debitoCop: calculoAbono.montoNetoAcreedorCop,
        creditoCop: 0,
        descripcion:
          dto.descripcion ?? `Abono directo al acreedor ${entrada.id}`,
      },
    });

    return tx.entrada.findUnique({
      where: {
        id: entrada.id,
      },
      include: this.entradaInclude(),
    });
  }

  private redondearDosDecimales(valor: number) {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  private calcularAbonoDirectoProveedor(params: {
    montoCop: number;
    proveedorCobra4x1000?: boolean;
  }) {
    const impuestoProveedor4x1000Cop = params.proveedorCobra4x1000
      ? this.redondearDosDecimales(params.montoCop * 0.004)
      : 0;

    const montoNetoAcreedorCop = this.redondearDosDecimales(
      params.montoCop - impuestoProveedor4x1000Cop,
    );

    return {
      montoCop: params.montoCop,
      proveedorCobra4x1000: params.proveedorCobra4x1000 ?? false,
      impuestoProveedor4x1000Cop,
      montoNetoAcreedorCop,
    };
  }

  private calcularAbonoCuentaPropia(params: {
    montoCop: number;
    aplica4x1000?: boolean;
  }) {
    const montoCop = this.redondearDosDecimales(params.montoCop);

    const aplica4x1000 = params.aplica4x1000 ?? false;

    const impuesto4x1000Cop = aplica4x1000
      ? this.redondearDosDecimales(montoCop * 0.004)
      : 0;

    const montoAplicadoDeudaCop = this.redondearDosDecimales(
      montoCop - impuesto4x1000Cop,
    );

    return {
      montoCop,
      aplica4x1000,
      impuesto4x1000Cop,
      montoAplicadoDeudaCop,
    };
  }

  private validarDtoPorTipo(dto: CreateEntradaDto) {
    if (!dto.deudorId) {
      throw new BadRequestException('La entrada requiere deudorId.');
    }

    if (!dto.montoCop || dto.montoCop <= 0) {
      throw new BadRequestException('La entrada requiere montoCop mayor a 0.');
    }

    if (dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
      if (!dto.cuentaId) {
        throw new BadRequestException(
          'El abono a cuenta propia requiere cuentaId.',
        );
      }

      return;
    }

    if (dto.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
      if (!dto.acreedorId) {
        throw new BadRequestException('El abono directo requiere acreedorId.');
      }

      return;
    }

    throw new BadRequestException('Tipo de entrada no soportado.');
  }

  private entradaInclude() {
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
      cuenta: true,
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

  private async cancelarAbonoDirectoProveedor(
    tx: Prisma.TransactionClient,
    entrada: {
      id: string;
      movimientosCliente: Array<{
        clienteId: string;
        tipo: TipoMovimientoCliente;
        monedaTransaccion: Moneda | null;
        montoTransaccion: Prisma.Decimal | null;
        debitoCop: Prisma.Decimal;
        creditoCop: Prisma.Decimal;
      }>;
    },
    dto: CancelarEntradaDto,
  ) {
    for (const movimiento of entrada.movimientosCliente) {
      await tx.movimientoCliente.create({
        data: {
          clienteId: movimiento.clienteId,
          tipo: TipoMovimientoCliente.CANCELACION,
          entradaId: entrada.id,
          monedaTransaccion: movimiento.monedaTransaccion,
          montoTransaccion: movimiento.montoTransaccion,

          // reversa contable
          debitoCop: Number(movimiento.creditoCop),
          creditoCop: Number(movimiento.debitoCop),

          descripcion: `Cancelación de entrada ${entrada.id}: ${dto.motivo}`,
        },
      });
    }
  }

  private async cancelarAbonoCuentaPropia(
    tx: Prisma.TransactionClient,
    entrada: {
      id: string;
      cuentaId: string | null;
      montoCop: Prisma.Decimal;
      notas: string | null;
      movimientosCliente: Array<{
        clienteId: string;
        tipo: TipoMovimientoCliente;
        monedaTransaccion: Moneda | null;
        montoTransaccion: Prisma.Decimal | null;
        debitoCop: Prisma.Decimal;
        creditoCop: Prisma.Decimal;
      }>;
    },
    dto: CancelarEntradaDto,
  ) {
    if (!entrada.cuentaId) {
      throw new BadRequestException(
        'La entrada no tiene una cuenta asociada para reversar.',
      );
    }

    const cuenta = await tx.cuenta.findUnique({
      where: {
        id: entrada.cuentaId,
      },
    });

    if (!cuenta) {
      throw new NotFoundException('La cuenta asociada a la entrada no existe.');
    }

    const saldoActual = Number(cuenta.saldo);
    const montoEntrada = Number(entrada.montoCop);

    if (saldoActual < montoEntrada) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para cancelar esta entrada.',
      );
    }

    const saldoNuevo = saldoActual - montoEntrada;

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
        monto: montoEntrada,
        moneda: cuenta.moneda,
        saldoAnterior: saldoActual,
        saldoNuevo,
        descripcion: `Cancelación de entrada ${entrada.id}: ${dto.motivo}`,
        referenciaTipo: 'CANCELACION_ENTRADA',
        referenciaId: entrada.id,
      },
    });

    for (const movimiento of entrada.movimientosCliente) {
      await tx.movimientoCliente.create({
        data: {
          clienteId: movimiento.clienteId,
          tipo: TipoMovimientoCliente.CANCELACION,
          entradaId: entrada.id,
          monedaTransaccion: movimiento.monedaTransaccion,
          montoTransaccion: movimiento.montoTransaccion,

          // reversa contable
          debitoCop: Number(movimiento.creditoCop),
          creditoCop: Number(movimiento.debitoCop),

          descripcion: `Cancelación de entrada ${entrada.id}: ${dto.motivo}`,
        },
      });
    }
  }

  async cancelar(id: string, dto: CancelarEntradaDto) {
    const entrada = await this.prisma.entrada.findUnique({
      where: {
        id,
      },
      include: {
        cuenta: true,
        movimientosCliente: true,
      },
    });

    if (!entrada) {
      throw new NotFoundException('La entrada no existe.');
    }

    if (entrada.estado === EstadoEntrada.CANCELADA) {
      throw new BadRequestException('La entrada ya está cancelada.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (entrada.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
        await this.cancelarAbonoCuentaPropia(tx, entrada, dto);
      }

      if (entrada.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
        await this.cancelarAbonoDirectoProveedor(tx, entrada, dto);
      }

      await tx.entrada.update({
        where: {
          id: entrada.id,
        },
        data: {
          estado: EstadoEntrada.CANCELADA,
          notas: entrada.notas
            ? `${entrada.notas}\nCancelada: ${dto.motivo}`
            : `Cancelada: ${dto.motivo}`,
        },
      });

      return tx.entrada.findUnique({
        where: {
          id: entrada.id,
        },
        include: this.entradaInclude(),
      });
    });
  }
}
