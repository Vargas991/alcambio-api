import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoEntidad,
  EstadoEntrada,
  Moneda,
  Prisma,
  TipoEntrada,
  TipoMovimientoCliente,
  TipoMovimientoCuenta,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CancelarEntradaDto } from './dto/cancelar-entrada.dto';
import { CreateEntradaDto } from './dto/create-entrada.dto';
import { UpdateEntradaDto } from './dto/update-entrada.dto';

type EntradaConMovimientos = Prisma.EntradaGetPayload<{
  include: {
    movimientosCliente: true;
  };
}>;

type CalculoAbonoCuentaPropia = {
  montoPago: Prisma.Decimal;
  montoAplicado: Prisma.Decimal;
  tasaConversion: Prisma.Decimal | null;
  aplica4x1000: boolean;
  impuesto4x1000Cop: Prisma.Decimal;
  montoCopLegado: Prisma.Decimal;
  montoAplicadoDeudaCopLegado: Prisma.Decimal | null;
};

type CalculoAbonoDirectoProveedor = {
  montoCop: Prisma.Decimal;
  proveedorCobra4x1000: boolean;
  impuestoProveedor4x1000Cop: Prisma.Decimal;
  montoNetoAcreedorCop: Prisma.Decimal;
};

@Injectable()
export class EntradasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEntradaDto) {
    this.validarDtoPorTipo(dto);

    return this.prisma.$transaction(async (tx) => {
      if (dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
        return this.crearAbonoCuentaPropia(tx, dto);
      }

      if (dto.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
        return this.crearAbonoDirectoProveedor(tx, dto);
      }

      throw new BadRequestException('Tipo de entrada no soportado.');
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

  async editar(id: string, dto: UpdateEntradaDto) {
    this.validarDtoPorTipo(dto);

    const entradaActual = await this.prisma.entrada.findUnique({
      where: {
        id,
      },
      include: {
        movimientosCliente: true,
      },
    });

    if (!entradaActual) {
      throw new NotFoundException('La entrada no existe.');
    }

    if (entradaActual.estado === EstadoEntrada.CANCELADA) {
      throw new BadRequestException(
        'No se puede editar una entrada cancelada.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.reversarEntradaParaEdicionOEliminacion(tx, entradaActual);

      if (dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
        await this.aplicarAbonoCuentaPropiaEditado(tx, entradaActual.id, dto);
      } else if (dto.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
        await this.aplicarAbonoDirectoProveedorEditado(
          tx,
          entradaActual.id,
          dto,
        );
      } else {
        throw new BadRequestException('Tipo de entrada no soportado.');
      }

      return tx.entrada.findUnique({
        where: {
          id: entradaActual.id,
        },
        include: this.entradaInclude(),
      });
    });
  }

  async eliminar(id: string) {
    const entrada = await this.prisma.entrada.findUnique({
      where: {
        id,
      },
      include: {
        movimientosCliente: true,
      },
    });

    if (!entrada) {
      throw new NotFoundException('La entrada no existe.');
    }

    if (entrada.estado === EstadoEntrada.CANCELADA) {
      throw new BadRequestException(
        'No se puede eliminar una entrada cancelada.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.reversarEntradaParaEdicionOEliminacion(tx, entrada);

      await tx.entrada.delete({
        where: {
          id: entrada.id,
        },
      });

      return {
        id: entrada.id,
        message: 'Entrada eliminada correctamente.',
      };
    });
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
      } else if (entrada.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
        await this.cancelarAbonoDirectoProveedor(tx, entrada, dto);
      } else {
        throw new BadRequestException('Tipo de entrada no soportado.');
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

    const [deudor, cuenta] = await Promise.all([
      tx.cliente.findUnique({
        where: {
          id: dto.deudorId,
        },
      }),
      tx.cuenta.findUnique({
        where: {
          id: cuentaId,
        },
      }),
    ]);

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    const aplica4x1000 = dto.aplica4x1000 ?? false;

    this.validarCuentaParaAbono(cuenta, dto.monedaPago, aplica4x1000);

    const calculo = this.calcularAbonoCuentaPropia({
      montoPago: dto.montoPago,
      monedaPago: dto.monedaPago,
      monedaAplicacion: dto.monedaAplicacion,
      tasaConversion: dto.tasaConversion,
      aplica4x1000: dto.aplica4x1000,
    });

    const saldoCuentaAnterior = new Prisma.Decimal(cuenta.saldo);
    const saldoCuentaNuevo = saldoCuentaAnterior.add(calculo.montoPago);

    const saldoClienteAnterior = await this.obtenerBalanceClientePorMoneda(
      tx,
      dto.deudorId,
      dto.monedaAplicacion,
    );

    const saldoClienteNuevo = saldoClienteAnterior.sub(calculo.montoAplicado);

    const entrada = await tx.entrada.create({
      data: {
        tipo: TipoEntrada.ABONO_CUENTA_PROPIA,
        estado: EstadoEntrada.REGISTRADA,

        deudorId: dto.deudorId,
        acreedorId: null,
        cuentaId,

        montoCop: calculo.montoCopLegado,

        monedaPago: dto.monedaPago,
        montoPago: calculo.montoPago,

        monedaAplicacion: dto.monedaAplicacion,
        montoAplicado: calculo.montoAplicado,
        tasaConversion: calculo.tasaConversion,

        aplica4x1000: calculo.aplica4x1000,
        impuesto4x1000Cop: calculo.impuesto4x1000Cop,
        montoAplicadoDeudaCop: calculo.montoAplicadoDeudaCopLegado,

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
        saldo: saldoCuentaNuevo,
      },
    });

    await tx.movimientoCuenta.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoCuenta.ENTRADA,

        monto: calculo.montoPago,
        moneda: dto.monedaPago,

        saldoAnterior: saldoCuentaAnterior,
        saldoNuevo: saldoCuentaNuevo,

        descripcion: dto.descripcion ?? `Abono recibido de ${deudor.nombre}`,

        referenciaTipo: 'ENTRADA',
        referenciaId: entrada.id,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.deudorId,
        tipo: TipoMovimientoCliente.ABONO,
        entradaId: entrada.id,

        monedaTransaccion: dto.monedaPago,
        montoTransaccion: calculo.montoPago,

        moneda: dto.monedaAplicacion,
        debito: 0,
        credito: calculo.montoAplicado,

        saldoAnterior: saldoClienteAnterior,
        saldoNuevo: saldoClienteNuevo,

        debitoCop: 0,
        creditoCop:
          dto.monedaAplicacion === Moneda.COP ? calculo.montoAplicado : 0,

        descripcion:
          dto.descripcion ??
          this.construirDescripcionAbono({
            monedaPago: dto.monedaPago,
            montoPago: calculo.montoPago,
            monedaAplicacion: dto.monedaAplicacion,
            montoAplicado: calculo.montoAplicado,
            tasaConversion: calculo.tasaConversion,
            entradaId: entrada.id,
          }),
      },
    });

    return tx.entrada.findUnique({
      where: {
        id: entrada.id,
      },
      include: this.entradaInclude(),
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

    const [deudor, cuenta] = await Promise.all([
      tx.cliente.findUnique({
        where: {
          id: dto.deudorId,
        },
      }),
      tx.cuenta.findUnique({
        where: {
          id: cuentaId,
        },
      }),
    ]);

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    if (!cuenta) {
      throw new NotFoundException('La cuenta no existe.');
    }

    const aplica4x1000 = dto.aplica4x1000 ?? false;

    this.validarCuentaParaAbono(cuenta, dto.monedaPago, aplica4x1000);

    const calculo = this.calcularAbonoCuentaPropia({
      montoPago: dto.montoPago,
      monedaPago: dto.monedaPago,
      monedaAplicacion: dto.monedaAplicacion,
      tasaConversion: dto.tasaConversion,
      aplica4x1000: dto.aplica4x1000,
    });

    const saldoCuentaAnterior = new Prisma.Decimal(cuenta.saldo);
    const saldoCuentaNuevo = saldoCuentaAnterior.add(calculo.montoPago);

    const saldoClienteAnterior = await this.obtenerBalanceClientePorMoneda(
      tx,
      dto.deudorId,
      dto.monedaAplicacion,
    );

    const saldoClienteNuevo = saldoClienteAnterior.sub(calculo.montoAplicado);

    const entrada = await tx.entrada.update({
      where: {
        id: entradaId,
      },
      data: {
        tipo: TipoEntrada.ABONO_CUENTA_PROPIA,
        estado: EstadoEntrada.REGISTRADA,

        deudorId: dto.deudorId,
        acreedorId: null,
        cuentaId,

        montoCop: calculo.montoCopLegado,

        monedaPago: dto.monedaPago,
        montoPago: calculo.montoPago,

        monedaAplicacion: dto.monedaAplicacion,
        montoAplicado: calculo.montoAplicado,
        tasaConversion: calculo.tasaConversion,

        aplica4x1000: calculo.aplica4x1000,
        impuesto4x1000Cop: calculo.impuesto4x1000Cop,
        montoAplicadoDeudaCop: calculo.montoAplicadoDeudaCopLegado,

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
        saldo: saldoCuentaNuevo,
      },
    });

    await tx.movimientoCuenta.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoCuenta.ENTRADA,

        monto: calculo.montoPago,
        moneda: dto.monedaPago,

        saldoAnterior: saldoCuentaAnterior,
        saldoNuevo: saldoCuentaNuevo,

        descripcion: dto.descripcion ?? `Abono recibido de ${deudor.nombre}`,

        referenciaTipo: 'ENTRADA',
        referenciaId: entrada.id,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: dto.deudorId,
        tipo: TipoMovimientoCliente.ABONO,
        entradaId: entrada.id,

        monedaTransaccion: dto.monedaPago,
        montoTransaccion: calculo.montoPago,

        moneda: dto.monedaAplicacion,
        debito: 0,
        credito: calculo.montoAplicado,

        saldoAnterior: saldoClienteAnterior,
        saldoNuevo: saldoClienteNuevo,

        debitoCop: 0,
        creditoCop:
          dto.monedaAplicacion === Moneda.COP ? calculo.montoAplicado : 0,

        descripcion:
          dto.descripcion ??
          this.construirDescripcionAbono({
            monedaPago: dto.monedaPago,
            montoPago: calculo.montoPago,
            monedaAplicacion: dto.monedaAplicacion,
            montoAplicado: calculo.montoAplicado,
            tasaConversion: calculo.tasaConversion,
            entradaId: entrada.id,
          }),
      },
    });

    return entrada;
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

    const [deudor, acreedor] = await Promise.all([
      tx.cliente.findUnique({
        where: {
          id: dto.deudorId,
        },
      }),
      tx.cliente.findUnique({
        where: {
          id: acreedorId,
        },
      }),
    ]);

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const calculo = this.calcularAbonoDirectoProveedorMultimoneda({
      montoPago: dto.montoPago,
      monedaPago: dto.monedaPago,
      monedaAplicacion: dto.monedaAplicacion,
      tasaConversion: dto.tasaConversion,
      proveedorCobra4x1000: dto.proveedorCobra4x1000,
    });

    const saldoDeudorAnterior = await this.obtenerBalanceClientePorMoneda(
      tx,
      dto.deudorId,
      dto.monedaAplicacion,
    );

    const saldoDeudorNuevo = saldoDeudorAnterior.sub(
      calculo.montoAplicadoDeudor,
    );

    const saldoAcreedorAnterior = await this.obtenerBalanceClientePorMoneda(
      tx,
      acreedorId,
      dto.monedaAplicacion,
    );

    const saldoAcreedorNuevo = saldoAcreedorAnterior.add(
      calculo.montoAplicadoAcreedor,
    );

    const entrada = await tx.entrada.create({
      data: {
        tipo: TipoEntrada.ABONO_DIRECTO_PROVEEDOR,
        estado: EstadoEntrada.REGISTRADA,

        deudorId: dto.deudorId,
        acreedorId,
        cuentaId: null,

        montoCop: dto.monedaPago === Moneda.COP ? calculo.montoPago : 0,

        monedaPago: dto.monedaPago,
        montoPago: calculo.montoPago,

        monedaAplicacion: dto.monedaAplicacion,
        montoAplicado: calculo.montoAplicadoAcreedor,
        tasaConversion: calculo.tasaConversion,

        aplica4x1000: false,
        impuesto4x1000Cop: 0,
        montoAplicadoDeudaCop:
          dto.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicadoDeudor
            : null,

        proveedorCobra4x1000: calculo.proveedorCobra4x1000,

        impuestoProveedor4x1000Cop: calculo.impuestoProveedor4x1000Cop,

        montoNetoAcreedorCop:
          dto.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicadoAcreedor
            : 0,

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

        monedaTransaccion: dto.monedaPago,
        montoTransaccion: calculo.montoPago,

        moneda: dto.monedaAplicacion,
        debito: 0,
        credito: calculo.montoAplicadoDeudor,

        saldoAnterior: saldoDeudorAnterior,
        saldoNuevo: saldoDeudorNuevo,

        debitoCop: 0,
        creditoCop:
          dto.monedaAplicacion === Moneda.COP ? calculo.montoAplicadoDeudor : 0,

        descripcion:
          dto.descripcion ??
          `Abono directo de ${deudor.nombre} aplicado en ${dto.monedaAplicacion}`,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,
        tipo: TipoMovimientoCliente.ABONO_DIRECTO,
        entradaId: entrada.id,

        monedaTransaccion: dto.monedaPago,
        montoTransaccion: calculo.montoNetoPago,

        moneda: dto.monedaAplicacion,
        debito: calculo.montoAplicadoAcreedor,
        credito: 0,

        saldoAnterior: saldoAcreedorAnterior,
        saldoNuevo: saldoAcreedorNuevo,

        debitoCop:
          dto.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicadoAcreedor
            : 0,

        creditoCop: 0,

        descripcion:
          dto.descripcion ??
          `Abono directo al acreedor ${acreedor.nombre} aplicado en ${dto.monedaAplicacion}`,
      },
    });

    return tx.entrada.findUnique({
      where: {
        id: entrada.id,
      },
      include: this.entradaInclude(),
    });
  }

  private async aplicarAbonoDirectoProveedorEditado(
    tx: Prisma.TransactionClient,
    entradaId: string,
    dto: UpdateEntradaDto,
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

    const [deudor, acreedor] = await Promise.all([
      tx.cliente.findUnique({
        where: {
          id: dto.deudorId,
        },
      }),
      tx.cliente.findUnique({
        where: {
          id: acreedorId,
        },
      }),
    ]);

    if (!deudor) {
      throw new NotFoundException('El deudor no existe.');
    }

    if (!acreedor) {
      throw new NotFoundException('El acreedor no existe.');
    }

    const calculo = this.calcularAbonoDirectoProveedorMultimoneda({
      montoPago: dto.montoPago,
      monedaPago: dto.monedaPago,
      monedaAplicacion: dto.monedaAplicacion,
      tasaConversion: dto.tasaConversion,
      proveedorCobra4x1000: dto.proveedorCobra4x1000,
    });

    const saldoDeudorAnterior = await this.obtenerBalanceClientePorMoneda(
      tx,
      dto.deudorId,
      dto.monedaAplicacion,
    );

    const saldoDeudorNuevo = saldoDeudorAnterior.sub(
      calculo.montoAplicadoDeudor,
    );

    const saldoAcreedorAnterior = await this.obtenerBalanceClientePorMoneda(
      tx,
      acreedorId,
      dto.monedaAplicacion,
    );

    const saldoAcreedorNuevo = saldoAcreedorAnterior.add(
      calculo.montoAplicadoAcreedor,
    );

    const entrada = await tx.entrada.update({
      where: {
        id: entradaId,
      },
      data: {
        tipo: TipoEntrada.ABONO_DIRECTO_PROVEEDOR,
        estado: EstadoEntrada.REGISTRADA,

        deudorId: dto.deudorId,
        acreedorId,
        cuentaId: null,

        montoCop: dto.monedaPago === Moneda.COP ? calculo.montoPago : 0,

        monedaPago: dto.monedaPago,
        montoPago: calculo.montoPago,

        monedaAplicacion: dto.monedaAplicacion,
        montoAplicado: calculo.montoAplicadoAcreedor,
        tasaConversion: calculo.tasaConversion,

        aplica4x1000: false,
        impuesto4x1000Cop: 0,
        montoAplicadoDeudaCop:
          dto.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicadoDeudor
            : null,

        proveedorCobra4x1000: calculo.proveedorCobra4x1000,

        impuestoProveedor4x1000Cop: calculo.impuestoProveedor4x1000Cop,

        montoNetoAcreedorCop:
          dto.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicadoAcreedor
            : 0,

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

        monedaTransaccion: dto.monedaPago,
        montoTransaccion: calculo.montoPago,

        moneda: dto.monedaAplicacion,
        debito: 0,
        credito: calculo.montoAplicadoDeudor,

        saldoAnterior: saldoDeudorAnterior,
        saldoNuevo: saldoDeudorNuevo,

        debitoCop: 0,
        creditoCop:
          dto.monedaAplicacion === Moneda.COP ? calculo.montoAplicadoDeudor : 0,

        descripcion:
          dto.descripcion ??
          `Abono directo de ${deudor.nombre} aplicado en ${dto.monedaAplicacion}`,
      },
    });

    await tx.movimientoCliente.create({
      data: {
        clienteId: acreedorId,
        tipo: TipoMovimientoCliente.ABONO_DIRECTO,
        entradaId: entrada.id,

        monedaTransaccion: dto.monedaPago,
        montoTransaccion: calculo.montoNetoPago,

        moneda: dto.monedaAplicacion,
        debito: calculo.montoAplicadoAcreedor,
        credito: 0,

        saldoAnterior: saldoAcreedorAnterior,
        saldoNuevo: saldoAcreedorNuevo,

        debitoCop:
          dto.monedaAplicacion === Moneda.COP
            ? calculo.montoAplicadoAcreedor
            : 0,

        creditoCop: 0,

        descripcion:
          dto.descripcion ??
          `Abono directo al acreedor ${acreedor.nombre} aplicado en ${dto.monedaAplicacion}`,
      },
    });

    return entrada;
  }

  private async reversarEntradaParaEdicionOEliminacion(
    tx: Prisma.TransactionClient,
    entrada: EntradaConMovimientos,
  ) {
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

      const montoEntrada = new Prisma.Decimal(entrada.montoPago);
      const saldoActual = new Prisma.Decimal(cuenta.saldo);

      if (saldoActual.lt(montoEntrada)) {
        throw new BadRequestException(
          `La cuenta "${cuenta.nombre}" no tiene saldo suficiente para reversar esta entrada.`,
        );
      }

      await tx.cuenta.update({
        where: {
          id: cuenta.id,
        },
        data: {
          saldo: saldoActual.sub(montoEntrada),
        },
      });
    }

    await tx.movimientoCliente.deleteMany({
      where: {
        entradaId: entrada.id,
      },
    });

    await tx.movimientoCuenta.deleteMany({
      where: {
        referenciaTipo: 'ENTRADA',
        referenciaId: entrada.id,
      },
    });
  }

  private async cancelarAbonoCuentaPropia(
    tx: Prisma.TransactionClient,
    entrada: EntradaConMovimientos,
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

    const montoEntrada = new Prisma.Decimal(entrada.montoPago);
    const saldoActual = new Prisma.Decimal(cuenta.saldo);

    if (saldoActual.lt(montoEntrada)) {
      throw new BadRequestException(
        'La cuenta no tiene saldo suficiente para cancelar esta entrada.',
      );
    }

    const saldoNuevo = saldoActual.sub(montoEntrada);

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
        moneda: entrada.monedaPago,

        saldoAnterior: saldoActual,
        saldoNuevo,

        descripcion: `Cancelación de entrada ${entrada.id}: ${dto.motivo}`,

        referenciaTipo: 'CANCELACION_ENTRADA',
        referenciaId: entrada.id,
      },
    });

    await this.crearMovimientosClienteDeCancelacion(tx, entrada, dto);
  }

  private async cancelarAbonoDirectoProveedor(
    tx: Prisma.TransactionClient,
    entrada: EntradaConMovimientos,
    dto: CancelarEntradaDto,
  ) {
    await this.crearMovimientosClienteDeCancelacion(tx, entrada, dto);
  }

  private async crearMovimientosClienteDeCancelacion(
    tx: Prisma.TransactionClient,
    entrada: EntradaConMovimientos,
    dto: CancelarEntradaDto,
  ) {
    for (const movimiento of entrada.movimientosCliente) {
      const saldoAnterior = await this.obtenerBalanceClientePorMoneda(
        tx,
        movimiento.clienteId,
        movimiento.moneda,
      );

      const debito = new Prisma.Decimal(movimiento.credito);
      const credito = new Prisma.Decimal(movimiento.debito);
      const saldoNuevo = saldoAnterior.add(debito).sub(credito);

      await tx.movimientoCliente.create({
        data: {
          clienteId: movimiento.clienteId,
          tipo: TipoMovimientoCliente.CANCELACION,
          entradaId: entrada.id,

          monedaTransaccion: movimiento.monedaTransaccion,
          montoTransaccion: movimiento.montoTransaccion,

          moneda: movimiento.moneda,
          debito,
          credito,

          saldoAnterior,
          saldoNuevo,

          debitoCop: movimiento.moneda === Moneda.COP ? debito : 0,

          creditoCop: movimiento.moneda === Moneda.COP ? credito : 0,

          descripcion: `Cancelación de entrada ${entrada.id}: ${dto.motivo}`,
        },
      });
    }
  }

  private validarCuentaParaAbono(
    cuenta: {
      nombre: string;
      moneda: Moneda;
      estado: EstadoEntidad;
    },
    monedaPago: Moneda,
    aplica4x1000: boolean,
  ) {
    if (cuenta.estado !== EstadoEntidad.ACTIVO) {
      throw new BadRequestException('La cuenta está inactiva.');
    }

    if (cuenta.moneda !== monedaPago) {
      throw new BadRequestException(
        `La cuenta "${cuenta.nombre}" trabaja en ${cuenta.moneda}, pero el pago fue registrado en ${monedaPago}.`,
      );
    }

    if (aplica4x1000 && cuenta.moneda !== Moneda.COP) {
      throw new BadRequestException(
        'El 4x1000 solo puede aplicarse a cuentas en COP.',
      );
    }
  }

  private calcularAbonoCuentaPropia(input: {
    montoPago: number;
    monedaPago: Moneda;
    monedaAplicacion: Moneda;
    tasaConversion?: number;
    aplica4x1000?: boolean;
  }): CalculoAbonoCuentaPropia {
    const montoPago = new Prisma.Decimal(input.montoPago);

    if (montoPago.lte(0)) {
      throw new BadRequestException(
        'El monto recibido debe ser mayor que cero.',
      );
    }

    const mismaMoneda = input.monedaPago === input.monedaAplicacion;

    let tasaConversion: Prisma.Decimal | null = null;

    if (!mismaMoneda) {
      if (
        input.tasaConversion === undefined ||
        input.tasaConversion === null ||
        Number(input.tasaConversion) <= 0
      ) {
        throw new BadRequestException(
          'La tasa de conversión es obligatoria cuando las monedas son diferentes.',
        );
      }

      tasaConversion = new Prisma.Decimal(input.tasaConversion);
    }

    const aplica4x1000 = input.aplica4x1000 ?? false;

    if (aplica4x1000 && input.monedaPago !== Moneda.COP) {
      throw new BadRequestException(
        'El 4x1000 solo puede aplicarse cuando el pago se recibe en COP.',
      );
    }

    const impuesto4x1000Cop = aplica4x1000
      ? montoPago.mul(new Prisma.Decimal('0.004')).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    const montoNetoPago = montoPago.sub(impuesto4x1000Cop);

    if (montoNetoPago.lte(0)) {
      throw new BadRequestException(
        'El monto neto aplicado debe ser mayor que cero.',
      );
    }

    const montoAplicado = mismaMoneda
      ? montoNetoPago
      : montoNetoPago.div(tasaConversion!).toDecimalPlaces(6);

    return {
      montoPago,
      montoAplicado,
      tasaConversion,
      aplica4x1000,
      impuesto4x1000Cop,

      montoCopLegado:
        input.monedaPago === Moneda.COP ? montoPago : new Prisma.Decimal(0),

      montoAplicadoDeudaCopLegado:
        input.monedaAplicacion === Moneda.COP ? montoAplicado : null,
    };
  }

  private calcularAbonoDirectoProveedorMultimoneda(input: {
    montoPago: number;
    monedaPago: Moneda;
    monedaAplicacion: Moneda;
    tasaConversion?: number;
    proveedorCobra4x1000?: boolean;
  }) {
    const montoPago = new Prisma.Decimal(input.montoPago);

    if (montoPago.lte(0)) {
      throw new BadRequestException(
        'El monto del abono directo debe ser mayor que cero.',
      );
    }

    const mismaMoneda = input.monedaPago === input.monedaAplicacion;

    let tasaConversion: Prisma.Decimal | null = null;

    if (!mismaMoneda) {
      if (
        input.tasaConversion === undefined ||
        input.tasaConversion === null ||
        Number(input.tasaConversion) <= 0
      ) {
        throw new BadRequestException(
          'La tasa de conversión es obligatoria cuando las monedas son diferentes.',
        );
      }

      tasaConversion = new Prisma.Decimal(input.tasaConversion);
    }

    const proveedorCobra4x1000 = input.proveedorCobra4x1000 ?? false;

    if (proveedorCobra4x1000 && input.monedaPago !== Moneda.COP) {
      throw new BadRequestException(
        'El 4x1000 del proveedor solo puede aplicarse cuando el pago se realiza en COP.',
      );
    }

    const impuestoProveedor4x1000Cop = proveedorCobra4x1000
      ? montoPago.mul(new Prisma.Decimal('0.004')).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    const montoNetoPago = montoPago.sub(impuestoProveedor4x1000Cop);

    if (montoNetoPago.lte(0)) {
      throw new BadRequestException(
        'El monto neto reconocido al acreedor debe ser mayor que cero.',
      );
    }

    const montoAplicadoDeudor = mismaMoneda
      ? montoPago
      : montoPago.div(tasaConversion!).toDecimalPlaces(6);

    const montoAplicadoAcreedor = mismaMoneda
      ? montoNetoPago
      : montoNetoPago.div(tasaConversion!).toDecimalPlaces(6);

    return {
      montoPago,
      montoNetoPago,
      monedaPago: input.monedaPago,
      monedaAplicacion: input.monedaAplicacion,
      tasaConversion,
      proveedorCobra4x1000,
      impuestoProveedor4x1000Cop,
      montoAplicadoDeudor,
      montoAplicadoAcreedor,
    };
  }

  private async obtenerBalanceClientePorMoneda(
    tx: Prisma.TransactionClient,
    clienteId: string,
    moneda: Moneda,
  ) {
    const resultado = await tx.movimientoCliente.aggregate({
      where: {
        clienteId,
        moneda,
      },
      _sum: {
        debito: true,
        credito: true,
      },
    });

    const totalDebitos = new Prisma.Decimal(resultado._sum.debito ?? 0);
    const totalCreditos = new Prisma.Decimal(resultado._sum.credito ?? 0);

    return totalDebitos.sub(totalCreditos);
  }

  private construirDescripcionAbono(input: {
    monedaPago: Moneda;
    montoPago: Prisma.Decimal;
    monedaAplicacion: Moneda;
    montoAplicado: Prisma.Decimal;
    tasaConversion: Prisma.Decimal | null;
    entradaId: string;
  }) {
    const pago = `${input.montoPago.toFixed(6)} ${input.monedaPago}`;

    const aplicacion = `${input.montoAplicado.toFixed(6)} ${input.monedaAplicacion}`;

    if (!input.tasaConversion) {
      return (
        `Abono de ${pago} aplicado a deuda ` +
        `${input.monedaAplicacion}. Entrada ${input.entradaId}.`
      );
    }

    return [
      `Abono recibido: ${pago}.`,
      `Aplicado a deuda: ${aplicacion}.`,
      `Tasa: 1 ${input.monedaAplicacion} = ` +
        `${input.tasaConversion.toFixed(8)} ${input.monedaPago}.`,
      `Entrada ${input.entradaId}.`,
    ].join(' ');
  }

  private validarDtoPorTipo(dto: CreateEntradaDto | UpdateEntradaDto) {
    if (!dto.deudorId) {
      throw new BadRequestException('La entrada requiere deudorId.');
    }

    if (dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
      if (!dto.cuentaId) {
        throw new BadRequestException(
          'El abono a cuenta propia requiere cuentaId.',
        );
      }

      if (!dto.monedaPago) {
        throw new BadRequestException('El abono requiere monedaPago.');
      }

      if (
        dto.montoPago === undefined ||
        dto.montoPago === null ||
        Number(dto.montoPago) <= 0
      ) {
        throw new BadRequestException(
          'El abono requiere montoPago mayor que cero.',
        );
      }

      if (!dto.monedaAplicacion) {
        throw new BadRequestException('El abono requiere monedaAplicacion.');
      }

      if (
        dto.monedaPago !== dto.monedaAplicacion &&
        (dto.tasaConversion === undefined ||
          dto.tasaConversion === null ||
          Number(dto.tasaConversion) <= 0)
      ) {
        throw new BadRequestException(
          'La tasa de conversión es obligatoria cuando las monedas son diferentes.',
        );
      }

      return;
    }

    if (dto.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
      if (!dto.acreedorId) {
        throw new BadRequestException('El abono directo requiere acreedorId.');
      }

      if (!dto.monedaPago) {
        throw new BadRequestException('El abono directo requiere monedaPago.');
      }

      if (
        dto.montoPago === undefined ||
        dto.montoPago === null ||
        Number(dto.montoPago) <= 0
      ) {
        throw new BadRequestException(
          'El abono directo requiere montoPago mayor que cero.',
        );
      }

      if (!dto.monedaAplicacion) {
        throw new BadRequestException(
          'El abono directo requiere monedaAplicacion.',
        );
      }

      if (
        dto.monedaPago !== dto.monedaAplicacion &&
        (dto.tasaConversion === undefined ||
          dto.tasaConversion === null ||
          Number(dto.tasaConversion) <= 0)
      ) {
        throw new BadRequestException(
          'La tasa de conversión es obligatoria cuando las monedas son diferentes.',
        );
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
    } satisfies Prisma.EntradaInclude;
  }
}
