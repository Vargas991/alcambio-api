import { BadRequestException, Injectable } from '@nestjs/common';

import {
  EstadoEntidad,
  EstadoOperacion,
  MetodoCalculoOperacion,
  Moneda,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  getTodayInTimeZone,
  getUtcDayRange,
} from '../common/helpers/date-range.helper';

type CuentaDashboard = {
  id: string;
  nombre: string;
  moneda: Moneda;
  categoria: string;
  tipo: string;
  aplica4x1000: boolean;
  saldoActual: number;
  saldoInicial: number;
  entradas: number;
  salidas: number;
  variacion: number;
  saldoFinal: number;
  utilidadGenerada: number;
  cantidadMovimientos: number;
};

type CarteraMoneda = {
  moneda: Moneda;
  porCobrar: number;
  porPagar: number;
  balanceNeto: number;
};

type UtilidadMoneda = {
  moneda: Moneda;
  utilidad: number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerResumen(fecha?: string) {
    const zonaHoraria = await this.obtenerZonaHorariaOrganizacion();
    const fechaSeleccionada = fecha ?? getTodayInTimeZone(zonaHoraria);

    this.validarFecha(fechaSeleccionada);

    const { inicio, fin } = getUtcDayRange(fechaSeleccionada, zonaHoraria);

    const cuentas = await this.prisma.cuenta.findMany({
      where: {
        estado: EstadoEntidad.ACTIVO,
      },
      orderBy: [{ moneda: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        nombre: true,
        moneda: true,
        categoria: true,
        tipo: true,
        saldo: true,
        aplica4x1000: true,
      },
    });

    const monedasDisponibles = this.obtenerMonedasDisponibles(
      cuentas.map((cuenta) => cuenta.moneda),
    );

    const cuentaIds = cuentas.map((cuenta) => cuenta.id);

    const [
      movimientosDia,
      movimientosAnteriores,
      movimientosClientes,
      operacionesDia,
    ] = await Promise.all([
      this.prisma.movimientoCuenta.findMany({
        where: {
          cuentaId: {
            in: cuentaIds,
          },
          creadoEn: {
            gte: inicio,
            lt: fin,
          },
        },
        orderBy: {
          creadoEn: 'asc',
        },
      }),

      Promise.all(
        cuentas.map(async (cuenta) => {
          const movimiento = await this.prisma.movimientoCuenta.findFirst({
            where: {
              cuentaId: cuenta.id,
              creadoEn: {
                lt: inicio,
              },
            },
            orderBy: {
              creadoEn: 'desc',
            },
            select: {
              cuentaId: true,
              saldoNuevo: true,
            },
          });

          return {
            cuentaId: cuenta.id,
            movimiento,
          };
        }),
      ),

      this.prisma.movimientoCliente.findMany({
        select: {
          clienteId: true,
          moneda: true,
          debito: true,
          credito: true,
        },
      }),

      this.prisma.operacion.findMany({
        where: {
          estado: EstadoOperacion.REGISTRADA,
          fechaOperacion: {
            gte: inicio,
            lt: fin,
          },
        },
        select: {
          id: true,
          tipo: true,
          metodoCalculo: true,
          monedaDeuda: true,
          utilidadCop: true,
          montoComision: true,
          cuentaOperativaId: true,
        },
      }),
    ]);

    const saldoAnteriorPorCuenta = new Map<string, number | null>();

    for (const item of movimientosAnteriores) {
      saldoAnteriorPorCuenta.set(
        item.cuentaId,
        item.movimiento ? Number(item.movimiento.saldoNuevo) : null,
      );
    }

    const utilidadPorMoneda = this.calcularUtilidadPorMoneda(
      monedasDisponibles,
      operacionesDia,
    );

    const utilidadPorCuenta = this.calcularUtilidadPorCuenta(operacionesDia);

    const cuentasDashboard: CuentaDashboard[] = cuentas.map((cuenta) => {
      const movimientos = movimientosDia.filter(
        (movimiento) => movimiento.cuentaId === cuenta.id,
      );

      let saldoInicial = 0;

      const primerMovimiento = movimientos[0];

      if (primerMovimiento) {
        saldoInicial = Number(primerMovimiento.saldoAnterior);
      } else {
        const saldoAnterior = saldoAnteriorPorCuenta.get(cuenta.id);

        if (saldoAnterior !== null && saldoAnterior !== undefined) {
          saldoInicial = saldoAnterior;
        }
      }

      let entradas = 0;
      let salidas = 0;

      for (const movimiento of movimientos) {
        const anterior = Number(movimiento.saldoAnterior);

        const nuevo = Number(movimiento.saldoNuevo);

        const diferencia = this.redondear(nuevo - anterior);

        if (diferencia > 0) {
          entradas += diferencia;
        }

        if (diferencia < 0) {
          salidas += Math.abs(diferencia);
        }
      }

      entradas = this.redondear(entradas);

      salidas = this.redondear(salidas);

      const ultimoMovimiento = movimientos[movimientos.length - 1];

      const saldoFinal = ultimoMovimiento
        ? Number(ultimoMovimiento.saldoNuevo)
        : saldoInicial;

      const variacion = this.redondear(saldoFinal - saldoInicial);

      return {
        id: cuenta.id,
        nombre: cuenta.nombre,
        moneda: cuenta.moneda,
        categoria: String(cuenta.categoria),
        tipo: String(cuenta.tipo),
        aplica4x1000: cuenta.aplica4x1000,

        saldoActual: this.redondear(Number(cuenta.saldo)),

        saldoInicial: this.redondear(saldoInicial),

        entradas,
        salidas,
        variacion,

        saldoFinal: this.redondear(saldoFinal),

        utilidadGenerada: this.redondear(utilidadPorCuenta.get(cuenta.id) ?? 0),

        cantidadMovimientos: movimientos.length,
      };
    });

    const carteraPorMoneda = this.calcularCarteraPorMoneda(
      monedasDisponibles,
      movimientosClientes,
    );

    const resumenPorMoneda = monedasDisponibles.map((moneda) => {
      const cuentasMoneda = cuentasDashboard.filter(
        (cuenta) => cuenta.moneda === moneda,
      );

      const cartera = carteraPorMoneda.find(
        (item) => item.moneda === moneda,
      ) ?? {
        moneda,
        porCobrar: 0,
        porPagar: 0,
        balanceNeto: 0,
      };

      const utilidad =
        utilidadPorMoneda.find((item) => item.moneda === moneda)?.utilidad ?? 0;

      const saldoCuentas = this.redondear(
        cuentasMoneda.reduce((total, cuenta) => total + cuenta.saldoActual, 0),
      );

      const saldoInicial = this.redondear(
        cuentasMoneda.reduce((total, cuenta) => total + cuenta.saldoInicial, 0),
      );

      const entradas = this.redondear(
        cuentasMoneda.reduce((total, cuenta) => total + cuenta.entradas, 0),
      );

      const salidas = this.redondear(
        cuentasMoneda.reduce((total, cuenta) => total + cuenta.salidas, 0),
      );

      const saldoFinal = this.redondear(
        cuentasMoneda.reduce((total, cuenta) => total + cuenta.saldoFinal, 0),
      );

      const variacion = this.redondear(saldoFinal - saldoInicial);

      return {
        moneda,

        saldoCuentas,

        cartera: {
          porCobrar: cartera.porCobrar,
          porPagar: cartera.porPagar,
          balanceNeto: cartera.balanceNeto,
        },

        cajaDia: {
          saldoInicial,
          entradas,
          salidas,
          variacion,
          saldoFinal,
        },

        utilidadGenerada: this.redondear(utilidad),

        cantidadCuentas: cuentasMoneda.length,

        cantidadMovimientos: cuentasMoneda.reduce(
          (total, cuenta) => total + cuenta.cantidadMovimientos,
          0,
        ),
      };
    });

    const movimientos = movimientosDia.map((movimiento) => {
      const saldoAnterior = Number(movimiento.saldoAnterior);

      const saldoNuevo = Number(movimiento.saldoNuevo);

      const diferencia = this.redondear(saldoNuevo - saldoAnterior);

      return {
        id: movimiento.id,
        cuentaId: movimiento.cuentaId,
        tipo: movimiento.tipo,
        descripcion: movimiento.descripcion,
        referenciaTipo: movimiento.referenciaTipo,
        referenciaId: movimiento.referenciaId,
        moneda: movimiento.moneda,
        monto: Number(movimiento.monto),

        entrada: diferencia > 0 ? diferencia : 0,

        salida: diferencia < 0 ? Math.abs(diferencia) : 0,

        saldoAnterior,
        saldoNuevo,
        creadoEn: movimiento.creadoEn,
      };
    });

    return {
      fecha: fechaSeleccionada,

      monedasDisponibles,

      resumenPorMoneda,

      cuentas: cuentasDashboard,

      utilidadPorMoneda,

      carteraPorMoneda,

      movimientos,

      generadoEn: new Date(),
    };
  }

  private calcularCarteraPorMoneda(
    monedas: Moneda[],
    movimientos: Array<{
      clienteId: string;
      moneda: Moneda;
      debito: unknown;
      credito: unknown;
    }>,
  ): CarteraMoneda[] {
    const saldos = new Map<string, number>();

    for (const movimiento of movimientos) {
      const key = `${movimiento.clienteId}|${movimiento.moneda}`;

      const saldoActual = saldos.get(key) ?? 0;

      const debito = Number(movimiento.debito ?? 0);

      const credito = Number(movimiento.credito ?? 0);

      saldos.set(key, saldoActual + debito - credito);
    }

    return monedas.map((moneda) => {
      let porCobrar = 0;
      let porPagar = 0;

      for (const [key, saldo] of saldos.entries()) {
        const monedaSaldo = key.split('|')[1] as Moneda;

        if (monedaSaldo !== moneda) {
          continue;
        }

        if (saldo > 0) {
          porCobrar += saldo;
        }

        if (saldo < 0) {
          porPagar += Math.abs(saldo);
        }
      }

      porCobrar = this.redondear(porCobrar);

      porPagar = this.redondear(porPagar);

      return {
        moneda,
        porCobrar,
        porPagar,

        balanceNeto: this.redondear(porCobrar - porPagar),
      };
    });
  }

  private calcularUtilidadPorMoneda(
    monedas: Moneda[],
    operaciones: Array<{
      metodoCalculo: MetodoCalculoOperacion;
      monedaDeuda: Moneda;
      utilidadCop: unknown;
      montoComision: unknown;
      cuentaOperativaId: string | null;
    }>,
  ): UtilidadMoneda[] {
    return monedas.map((moneda) => {
      const utilidad = operaciones
        .filter((operacion) => operacion.monedaDeuda === moneda)
        .reduce((total, operacion) => {
          if (operacion.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE) {
            return total + Number(operacion.montoComision ?? 0);
          }

          return total + Number(operacion.utilidadCop ?? 0);
        }, 0);

      return {
        moneda,
        utilidad: this.redondear(utilidad),
      };
    });
  }

  private calcularUtilidadPorCuenta(
    operaciones: Array<{
      metodoCalculo: MetodoCalculoOperacion;
      monedaDeuda: Moneda;
      utilidadCop: unknown;
      montoComision: unknown;
      cuentaOperativaId: string | null;
    }>,
  ) {
    const utilidad = new Map<string, number>();

    for (const operacion of operaciones) {
      if (!operacion.cuentaOperativaId) {
        continue;
      }

      const utilidadOperacion =
        operacion.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE
          ? Number(operacion.montoComision ?? 0)
          : Number(operacion.utilidadCop ?? 0);

      const actual = utilidad.get(operacion.cuentaOperativaId) ?? 0;

      utilidad.set(operacion.cuentaOperativaId, actual + utilidadOperacion);
    }

    return utilidad;
  }

  private obtenerMonedasDisponibles(monedas: Moneda[]): Moneda[] {
    return Array.from(new Set(monedas));
  }

  private validarFecha(fecha: string) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;

    if (!regex.test(fecha)) {
      throw new BadRequestException('La fecha debe tener formato YYYY-MM-DD.');
    }

    const fechaDate = new Date(`${fecha}T12:00:00Z`);

    if (Number.isNaN(fechaDate.getTime())) {
      throw new BadRequestException('La fecha indicada no es válida.');
    }
  }

  private redondear(valor: number, decimales = 6) {
    const factor = 10 ** decimales;

    return Math.round((valor + Number.EPSILON) * factor) / factor;
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
        'Debe configurar la organizacion antes de consultar el dashboard.',
      );
    }

    return configuracion.zonaHoraria;
  }
}
