import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoEntidad,
  Moneda,
  Prisma,
  TipoMovimientoCliente,
  TipoOperacion,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { FilterClienteLedgerDto } from './dto/filter-cliente-ledger';
import { UpdateEstadoClienteDto } from './dto/update-estado-cliente.dto';
import { FilterClientesCarteraDto } from './dto/filter-clientes-cartera.dto';
import {
  getDateKeyInTimeZone,
  getUtcDayRange,
} from 'src/common/helpers/date-range.helper';
import { AjustarSaldoClienteDto } from './dto/ajustar-saldo-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClienteDto) {
    return this.prisma.cliente.create({
      data: {
        nombre: dto.nombre,
        documento: dto.documento,
        telefono: dto.telefono,
        notas: dto.notas,
      },
    });
  }

  async findAll(nombre?: string) {
    const buscar = nombre?.trim();

    return this.prisma.cliente.findMany({
      where: buscar
        ? {
            nombre: {
              contains: buscar,
              mode: 'insensitive',
            },
          }
        : undefined,

      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    return cliente;
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data: {
        nombre: dto.nombre,
        documento: dto.documento,
        telefono: dto.telefono,
        notas: dto.notas,
      },
    });
  }

  async updateEstado(id: string, dto: UpdateEstadoClienteDto) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data: {
        estado: dto.estado,
      },
    });
  }

  async remove(id: string) {
    await this.validarClienteExiste(id);

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data: {
        estado: EstadoEntidad.INACTIVO,
      },
    });
  }

  async getBalance(id: string) {
    await this.validarClienteExiste(id);

    const movimientos = await this.prisma.movimientoCliente.findMany({
      where: {
        clienteId: id,
      },
      select: {
        moneda: true,
        debito: true,
        credito: true,
      },
    });

    const balances = this.calcularBalancesPorMoneda(movimientos);

    return {
      clienteId: id,
      balances,
    };
  }

  async getLedger(id: string, filters: FilterClienteLedgerDto) {
    const [cliente, configuracion] = await Promise.all([
      this.prisma.cliente.findUnique({
        where: { id },
        select: {
          id: true,
          nombre: true,
          documento: true,
          telefono: true,
          estado: true,
        },
      }),
      this.prisma.configuracionOrganizacion.findFirst({
        select: {
          zonaHoraria: true,
        },
      }),
    ]);

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    if (!configuracion) {
      throw new BadRequestException(
        'Debe configurar la organizacion antes de consultar el ledger.',
      );
    }

    const zonaHoraria = configuracion.zonaHoraria;

    /**
     * ==========================================
     * VALIDACIONES DE FILTROS
     * ==========================================
     */

    /**
     * metodoCalculo únicamente pertenece
     * a movimientos originados por operaciones.
     *
     * No tendría sentido:
     *
     * tipoMov=ABONO
     * metodoCalculo=TASA
     */
    if (
      filters.metodoCalculo &&
      filters.tipoMov &&
      filters.tipoMov !== TipoMovimientoCliente.OPERACION
    ) {
      throw new BadRequestException(
        'El filtro metodoCalculo solo puede utilizarse con movimientos de tipo OPERACION.',
      );
    }

    /**
     * ==========================================
     * WHERE DEL PERÍODO / FILTROS
     * ==========================================
     */

    const andConditions: Prisma.MovimientoClienteWhereInput[] = [
      {
        clienteId: id,
      },
    ];

    /**
     * Tipo de movimiento:
     *
     * OPERACION
     * ABONO
     * PAGO
     * AJUSTE
     * etc.
     */
    if (filters.tipoMov) {
      andConditions.push({
        tipo: filters.tipoMov,
      });
    }

    /**
     * ==========================================
     * FILTROS DE OPERACIÓN
     * ==========================================
     */

    const puedeFiltrarPorOperacion =
      !filters.tipoMov || filters.tipoMov === TipoMovimientoCliente.OPERACION;

    if (
      puedeFiltrarPorOperacion &&
      (filters.tipo || filters.estado || filters.metodoCalculo)
    ) {
      /**
       * Cuando existe metodoCalculo,
       * necesariamente estamos buscando
       * movimientos provenientes de operaciones.
       */
      if (filters.metodoCalculo) {
        andConditions.push({
          tipo: TipoMovimientoCliente.OPERACION,
        });
      }

      andConditions.push({
        operacion: {
          ...(filters.tipo && {
            tipo: filters.tipo,
          }),

          ...(filters.estado && {
            estado: filters.estado,
          }),

          ...(filters.metodoCalculo && {
            metodoCalculo: filters.metodoCalculo,
          }),
        },
      });
    }

    /**
     * ==========================================
     * MONEDA
     * ==========================================
     *
     * Se filtra por la moneda contable real
     * del movimiento/deuda.
     *
     * NO por monedaTransaccion.
     *
     * Ejemplo:
     *
     * montoTransaccion = 1.000 USD
     * moneda = COP
     * debito = 3.500.000 COP
     *
     * Si buscamos la deuda COP,
     * ese movimiento debe aparecer.
     */
    if (filters.moneda) {
      andConditions.push({
        moneda: filters.moneda,
      });
    }

    /**
     * ==========================================
     * FECHAS
     * ==========================================
     */

    if (filters.desde || filters.hasta) {
      const creadoEn: Prisma.DateTimeFilter = {};

      if (filters.desde) {
        const { inicio } = getUtcDayRange(filters.desde, zonaHoraria);

        creadoEn.gte = inicio;
      }

      if (filters.hasta) {
        const { fin } = getUtcDayRange(filters.hasta, zonaHoraria);

        creadoEn.lt = fin;
      }

      andConditions.push({
        creadoEn,
      });
    }

    /**
     * ==========================================
     * MOVIMIENTOS FILTRADOS
     * ==========================================
     */

    const movimientos = await this.prisma.movimientoCliente.findMany({
      where: {
        AND: andConditions,
      },

      /**
       * Ascendente para poder calcular
       * correctamente el saldo acumulado.
       */
      orderBy: {
        creadoEn: 'asc',
      },

      include: {
        operacion: {
          include: {
            deudor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            cuentaOperativa: {
              select: {
                id: true,
                nombre: true,
                moneda: true,
              },
            },
          },
        },

        entrada: {
          include: {
            deudor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            cuenta: {
              select: {
                id: true,
                nombre: true,
                moneda: true,
              },
            },
          },
        },

        salida: {
          include: {
            acreedor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            cuenta: {
              select: {
                id: true,
                nombre: true,
                moneda: true,
              },
            },
          },
        },
      },
    });

    /**
     * ==========================================
     * BALANCE GLOBAL DEL CLIENTE
     * ==========================================
     *
     * NO aplica filtros.
     *
     * Sirve para conocer la deuda real
     * completa del cliente.
     */

    const movimientosTotales = await this.prisma.movimientoCliente.findMany({
      where: {
        clienteId: id,
      },

      select: {
        moneda: true,
        debito: true,
        credito: true,
      },
    });

    /**
     * ==========================================
     * BALANCES POR MONEDA
     * ==========================================
     */

    const movimientosParaBalancesFiltrados = movimientos.filter(
      (mov) => mov.tipo !== TipoMovimientoCliente.AJUSTE,
    );

    const balancesFiltrados = this.calcularBalancesPorMoneda(
      movimientosParaBalancesFiltrados,
    );

    const balancesGlobales = this.calcularBalancesPorMoneda(movimientosTotales);

    /**
     * ==========================================
     * SALDOS ACUMULADOS POR MONEDA
     * ==========================================
     *
     * Nunca:
     *
     * COP + USD + BS
     *
     * Cada moneda tiene su propia
     * secuencia de saldo.
     */

    const saldosAcumulados = new Map<Moneda, number>();

    const movimientosConSaldo = movimientos.map((mov) => {
      const moneda = mov.moneda;

      const saldoAnterior = saldosAcumulados.get(moneda) ?? 0;

      const debito = Number(mov.debito ?? 0);

      const credito = Number(mov.credito ?? 0);

      const saldoAcumulado = saldoAnterior + debito - credito;

      saldosAcumulados.set(moneda, saldoAcumulado);

      /**
       * La utilidad actual sigue expresándose
       * mediante utilidadCop para operaciones
       * que realmente generan utilidad.
       */
      const utilidadRealCop =
        mov.operacion && this.operacionGeneraUtilidadReal(mov.operacion.tipo)
          ? Number(mov.operacion.utilidadCop ?? 0)
          : 0;

      return {
        ...mov,

        utilidadRealCop,

        saldoAcumulado,

        saldoAcumuladoMoneda: moneda,
      };
    });

    /**
     * ==========================================
     * UTILIDAD DEL PERÍODO
     * ==========================================
     */

    const totalUtilidadRealCop = movimientosConSaldo.reduce(
      (acc, mov) => acc + mov.utilidadRealCop,
      0,
    );

    const utilidadPorDiaMap = new Map<string, number>();

    for (const mov of movimientosConSaldo) {
      if (mov.utilidadRealCop === 0) {
        continue;
      }

      const fecha = getDateKeyInTimeZone(mov.creadoEn, zonaHoraria);

      utilidadPorDiaMap.set(
        fecha,
        (utilidadPorDiaMap.get(fecha) ?? 0) + mov.utilidadRealCop,
      );
    }

    const utilidadPorDia = Array.from(utilidadPorDiaMap.entries())
      .map(([fecha, utilidadCop]) => ({
        fecha,
        utilidadCop,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    /**
     * ==========================================
     * RESPUESTA
     * ==========================================
     */

    return {
      cliente,

      filtros: {
        desde: filters.desde ?? null,

        hasta: filters.hasta ?? null,

        tipo: filters.tipo ?? null,

        estado: filters.estado ?? null,

        tipoMov: filters.tipoMov ?? null,

        moneda: filters.moneda ?? null,

        metodoCalculo: filters.metodoCalculo ?? null,
      },

      resumen: {
        balancesFiltrados,
        balancesGlobales,

        totalUtilidadRealCop,
        utilidadPorDia,
      },

      /**
       * Para frontend/PDF lo devolvemos
       * nuevamente de más reciente a más antiguo.
       */
      movimientos: movimientosConSaldo.sort(
        (a, b) => b.creadoEn.getTime() - a.creadoEn.getTime(),
      ),
    };
  }

  async getCartera(filters: FilterClientesCarteraDto) {
    const where: Prisma.ClienteWhereInput = {};

    if (filters.buscar) {
      where.OR = [
        {
          nombre: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          documento: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
        {
          telefono: {
            contains: filters.buscar,
            mode: 'insensitive',
          },
        },
      ];
    }

    const clientes = await this.prisma.cliente.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        documento: true,
        telefono: true,
        estado: true,
        movimientos: {
          select: {
            moneda: true,
            debito: true,
            credito: true,
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const cartera = clientes
      .map((cliente) => ({
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          documento: cliente.documento,
          telefono: cliente.telefono,
          estado: cliente.estado,
        },
        balances: this.calcularBalancesPorMoneda(cliente.movimientos).filter(
          (balance) => Math.abs(balance.saldo) >= 0.000001,
        ),
      }))
      .filter((item) => item.balances.length > 0);

    const meDeben = cartera
      .map((item) => ({
        ...item,
        balances: item.balances.filter((balance) => balance.saldo > 0),
      }))
      .filter((item) => item.balances.length > 0);

    const lesDebo = cartera
      .map((item) => ({
        ...item,
        balances: item.balances.filter((balance) => balance.saldo < 0),
      }))
      .filter((item) => item.balances.length > 0);

    const resumenPorMoneda = Object.values(Moneda).map((moneda) => {
      const totalPorCobrar = cartera.reduce((total, item) => {
        const balance = item.balances.find((b) => b.moneda === moneda);
        return total + Math.max(balance?.saldo ?? 0, 0);
      }, 0);

      const totalPorPagar = cartera.reduce((total, item) => {
        const balance = item.balances.find((b) => b.moneda === moneda);
        return total + Math.abs(Math.min(balance?.saldo ?? 0, 0));
      }, 0);

      return {
        moneda,
        totalPorCobrar,
        totalPorPagar,
        balanceNeto: totalPorCobrar - totalPorPagar,
      };
    });

    return {
      resumenPorMoneda,
      cantidadMeDeben: meDeben.length,
      cantidadLesDebo: lesDebo.length,
      meDeben,
      lesDebo,
    };
  }

  async ajustarSaldo(clienteId: string, dto: AjustarSaldoClienteDto) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente) {
      throw new NotFoundException('El cliente no existe.');
    }

    return this.prisma.$transaction(async (tx) => {
      const totales = await tx.movimientoCliente.aggregate({
        where: {
          clienteId,
          moneda: dto.moneda,
        },
        _sum: {
          debito: true,
          credito: true,
        },
      });

      const totalDebitos = Number(totales._sum.debito ?? 0);
      const totalCreditos = Number(totales._sum.credito ?? 0);
      const saldoActual = totalDebitos - totalCreditos;
      const saldoObjetivo = Number(dto.saldoObjetivo);

      if (!Number.isFinite(saldoObjetivo)) {
        throw new BadRequestException('El saldo objetivo no es válido.');
      }

      const diferencia = saldoObjetivo - saldoActual;

      if (Math.abs(diferencia) < 0.000001) {
        return {
          clienteId: cliente.id,
          cliente: cliente.nombre,
          moneda: dto.moneda,
          saldoAnterior: saldoActual,
          saldoObjetivo,
          saldoNuevo: saldoActual,
          ajuste: 0,
          mensaje: 'El cliente ya tiene el saldo indicado.',
        };
      }

      const debito = diferencia > 0 ? diferencia : 0;
      const credito = diferencia < 0 ? Math.abs(diferencia) : 0;
      const esCop = dto.moneda === Moneda.COP;

      const movimiento = await tx.movimientoCliente.create({
        data: {
          clienteId,
          tipo: TipoMovimientoCliente.AJUSTE,
          moneda: dto.moneda,
          debito,
          credito,
          // Compatibilidad temporal con reportes antiguos en COP.
          debitoCop: esCop ? debito : 0,
          creditoCop: esCop ? credito : 0,
          monedaTransaccion: dto.moneda,
          montoTransaccion: Math.abs(diferencia),
          descripcion: `Ajuste de saldo ${dto.moneda}: ${dto.motivo}`,
        },
      });

      return {
        clienteId: cliente.id,
        cliente: cliente.nombre,
        moneda: dto.moneda,
        saldoAnterior: saldoActual,
        saldoObjetivo,
        saldoNuevo: saldoObjetivo,
        ajuste: Math.abs(diferencia),
        movimientoTipo: diferencia > 0 ? 'DEBITO' : 'CREDITO',
        motivo: dto.motivo,
        movimiento,
      };
    });
  }

  async getPerfil(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        movimientos: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          include: {
            operacion: true,
            entrada: true,
            salida: true,
          },
        },
        operacionesComoDeudor: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          include: {
            cuentaOperativa: true,
            acreedor: { select: { id: true, nombre: true } },
          },
        },
        operacionesComoAcreedor: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          include: {
            cuentaOperativa: true,
            deudor: { select: { id: true, nombre: true } },
          },
        },
        entradasComoDeudor: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          include: {
            cuenta: true,
            acreedor: { select: { id: true, nombre: true } },
          },
        },
        entradasComoAcreedor: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          include: {
            cuenta: true,
            deudor: { select: { id: true, nombre: true } },
          },
        },
        salidasComoAcreedor: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          include: { cuenta: true },
        },
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    const movimientosBalance = await this.prisma.movimientoCliente.findMany({
      where: { clienteId: id },
      select: {
        moneda: true,
        debito: true,
        credito: true,
        operacion: {
          select: {
            tipo: true,
            utilidadCop: true,
          },
        },
      },
    });

    const balances = this.calcularBalancesPorMoneda(movimientosBalance);

    const totalUtilidadRealCop = movimientosBalance.reduce((acc, mov) => {
      if (!mov.operacion) return acc;
      if (!this.operacionGeneraUtilidadReal(mov.operacion.tipo)) return acc;
      return acc + Number(mov.operacion.utilidadCop ?? 0);
    }, 0);

    return {
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        documento: cliente.documento,
        telefono: cliente.telefono,
        notas: cliente.notas,
        estado: cliente.estado,
        creadoEn: cliente.creadoEn,
        actualizadoEn: cliente.actualizadoEn,
      },
      balances,
      totalUtilidadRealCop,
      ultimosMovimientos: cliente.movimientos,
      ultimasOperacionesComoDeudor: cliente.operacionesComoDeudor,
      ultimasOperacionesComoAcreedor: cliente.operacionesComoAcreedor,
      ultimasEntradasComoDeudor: cliente.entradasComoDeudor,
      ultimasEntradasComoAcreedor: cliente.entradasComoAcreedor,
      ultimasSalidasComoAcreedor: cliente.salidasComoAcreedor,
    };
  }

  private calcularBalancesPorMoneda(
    movimientos: Array<{
      moneda: Moneda | null;
      debito: Prisma.Decimal | number | string | null;
      credito: Prisma.Decimal | number | string | null;
    }>,
  ) {
    const acumulados = new Map<
      Moneda,
      {
        moneda: Moneda;
        totalDebitos: number;
        totalCreditos: number;
        saldo: number;
        estado: string;
      }
    >();

    for (const moneda of Object.values(Moneda)) {
      acumulados.set(moneda, {
        moneda,
        totalDebitos: 0,
        totalCreditos: 0,
        saldo: 0,
        estado: 'SALDADO',
      });
    }

    for (const movimiento of movimientos) {
      if (!movimiento.moneda) {
        continue;
      }

      const balance = acumulados.get(movimiento.moneda);

      if (!balance) {
        continue;
      }

      balance.totalDebitos += Number(movimiento.debito ?? 0);
      balance.totalCreditos += Number(movimiento.credito ?? 0);
      balance.saldo = balance.totalDebitos - balance.totalCreditos;
      balance.estado = this.obtenerEstadoBalance(balance.saldo);
    }

    return Array.from(acumulados.values());
  }

  private async validarClienteExiste(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!cliente) {
      throw new BadRequestException('El cliente no existe.');
    }

    return cliente;
  }

  private obtenerEstadoBalance(saldoCop: number) {
    if (saldoCop > 0) {
      return 'ME_DEBE';
    }

    if (saldoCop < 0) {
      return 'LE_DEBO';
    }

    return 'SALDADO';
  }

  private operacionGeneraUtilidadReal(tipoOperacion: TipoOperacion) {
    return (
      tipoOperacion === TipoOperacion.VENTA ||
      tipoOperacion === TipoOperacion.OPERACION_DIRECTA
    );
  }
}
