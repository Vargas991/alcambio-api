import { Injectable } from '@nestjs/common';

import {
  CategoriaCuenta,
  EstadoEntrada,
  EstadoOperacion,
  EstadoSalida,
  Prisma,
  TipoEntrada,
  TipoOperacion,
  TipoSalida,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { FilterDashboardDto } from './dto/filter-dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getResumen(filters: FilterDashboardDto) {
    const rango = this.obtenerRangoFechas(filters);

    const [
      operaciones,
      entradas,
      salidas,
      cuentas,
      movimientosCartera,
      ultimosMovimientos,
    ] = await Promise.all([
      this.obtenerOperaciones(rango),
      this.obtenerEntradas(rango),
      this.obtenerSalidas(rango),
      this.obtenerCuentas(),
      this.obtenerMovimientosCartera(),
      this.obtenerUltimosMovimientos(),
    ]);

    const resumenOperaciones = this.calcularResumenOperaciones(operaciones);
    const resumenEntradas = this.calcularResumenEntradas(entradas);
    const resumenSalidas = this.calcularResumenSalidas(salidas);
    const resumenCuentas = this.calcularResumenCuentas(cuentas);
    const resumenCartera = this.calcularCartera(movimientosCartera);

    return {
      filtros: {
        desde: rango.desde,
        hasta: rango.hasta,
      },

      indicadores: {
        operaciones: resumenOperaciones.cantidad,
        comprasCop: resumenOperaciones.comprasCop,
        ventasCop: resumenOperaciones.ventasCop,
        utilidadRealCop: resumenOperaciones.utilidadRealCop,

        entradasCop: resumenEntradas.totalEntradasCop,
        pagosAcreedoresCop: resumenSalidas.pagosAcreedoresCop,
        gastosCop: resumenSalidas.gastosCop,
        retirosCop: resumenSalidas.retirosCop,

        saldoCuentasCop: resumenCuentas.saldoCuentasCop,
        porCobrarCop: resumenCartera.porCobrarCop,
        porPagarCop: resumenCartera.porPagarCop,
      },

      operaciones: resumenOperaciones,
      entradas: resumenEntradas,
      salidas: resumenSalidas,
      cuentas: resumenCuentas,
      cartera: resumenCartera,

      ultimosMovimientos,
    };
  }

  private obtenerRangoFechas(filters: FilterDashboardDto) {
    const desde = filters.desde
      ? this.crearFechaInicio(filters.desde)
      : this.inicioDelDia(new Date());

    const hasta = filters.hasta
      ? this.crearFechaFin(filters.hasta)
      : this.finDelDia(new Date());

    return {
      desde,
      hasta,
    };
  }

  private obtenerOperaciones(rango: { desde: Date; hasta: Date }) {
    return this.prisma.operacion.findMany({
      where: {
        estado: EstadoOperacion.REGISTRADA,
        fechaOperacion: {
          gte: rango.desde,
          lte: rango.hasta,
        },
      },
      select: {
        id: true,
        tipo: true,
        totalCompraCop: true,
        totalVentaCop: true,
        utilidadCop: true,
      },
    });
  }

  private obtenerEntradas(rango: { desde: Date; hasta: Date }) {
    return this.prisma.entrada.findMany({
      where: {
        estado: EstadoEntrada.REGISTRADA,
        creadoEn: {
          gte: rango.desde,
          lte: rango.hasta,
        },
      },
      select: {
        id: true,
        tipo: true,
        montoCop: true,
      },
    });
  }

  private obtenerSalidas(rango: { desde: Date; hasta: Date }) {
    return this.prisma.salida.findMany({
      where: {
        estado: EstadoSalida.REGISTRADA,
        creadoEn: {
          gte: rango.desde,
          lte: rango.hasta,
        },
      },
      select: {
        id: true,
        tipo: true,
        montoCop: true,
      },
    });
  }

  private obtenerCuentas() {
    return this.prisma.cuenta.findMany({
      where: {
        estado: 'ACTIVO',
      },
      select: {
        id: true,
        nombre: true,
        moneda: true,
        categoria: true,
        tipo: true,
        saldo: true,
      },
      orderBy: [
        {
          categoria: 'asc',
        },
        {
          nombre: 'asc',
        },
      ],
    });
  }

  /**
   * La cartera es un saldo histórico actual.
   * No debe filtrarse por las fechas del dashboard.
   */
  private obtenerMovimientosCartera() {
    return this.prisma.movimientoCliente.findMany({
      select: {
        clienteId: true,
        debitoCop: true,
        creditoCop: true,
        cliente: {
          select: {
            id: true,
            nombre: true,
            documento: true,
            telefono: true,
            estado: true,
          },
        },
      },
    });
  }

  private obtenerUltimosMovimientos() {
    return this.prisma.movimientoCliente.findMany({
      take: 10,
      orderBy: {
        creadoEn: 'desc',
      },
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            documento: true,
          },
        },
        operacion: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            tipo: true,
            estado: true,
          },
        },
        entrada: {
          select: {
            id: true,
            tipo: true,
            estado: true,
            descripcion: true,
            referencia: true,
          },
        },
        salida: {
          select: {
            id: true,
            tipo: true,
            estado: true,
            descripcion: true,
            referencia: true,
          },
        },
      },
    });
  }

  private calcularResumenOperaciones(
    operaciones: Array<{
      id: string;
      tipo: TipoOperacion;
      totalCompraCop: Prisma.Decimal;
      totalVentaCop: Prisma.Decimal;
      utilidadCop: Prisma.Decimal;
    }>,
  ) {
    let comprasCop = 0;
    let ventasCop = 0;
    let utilidadRealCop = 0;

    let cantidadCompras = 0;
    let cantidadVentas = 0;
    let cantidadDirectas = 0;

    for (const operacion of operaciones) {
      if (operacion.tipo === TipoOperacion.COMPRA) {
        comprasCop += Number(operacion.totalCompraCop);
        cantidadCompras += 1;
        continue;
      }

      if (operacion.tipo === TipoOperacion.VENTA) {
        ventasCop += Number(operacion.totalVentaCop);
        utilidadRealCop += Number(operacion.utilidadCop);
        cantidadVentas += 1;
        continue;
      }

      if (operacion.tipo === TipoOperacion.OPERACION_DIRECTA) {
        ventasCop += Number(operacion.totalVentaCop);
        utilidadRealCop += Number(operacion.utilidadCop);
        cantidadDirectas += 1;
      }
    }

    return {
      cantidad: operaciones.length,
      cantidadCompras,
      cantidadVentas,
      cantidadDirectas,
      comprasCop,
      ventasCop,
      utilidadRealCop,
    };
  }

  private calcularResumenEntradas(
    entradas: Array<{
      id: string;
      tipo: TipoEntrada;
      montoCop: Prisma.Decimal;
    }>,
  ) {
    let abonosCuentaPropiaCop = 0;
    let abonosDirectosCop = 0;

    for (const entrada of entradas) {
      const montoCop = Number(entrada.montoCop);

      if (entrada.tipo === TipoEntrada.ABONO_CUENTA_PROPIA) {
        abonosCuentaPropiaCop += montoCop;
        continue;
      }

      if (entrada.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR) {
        abonosDirectosCop += montoCop;
      }
    }

    return {
      cantidad: entradas.length,
      abonosCuentaPropiaCop,
      abonosDirectosCop,
      totalEntradasCop: abonosCuentaPropiaCop + abonosDirectosCop,
    };
  }

  private calcularResumenSalidas(
    salidas: Array<{
      id: string;
      tipo: TipoSalida;
      montoCop: Prisma.Decimal;
    }>,
  ) {
    let pagosAcreedoresCop = 0;
    let gastosCop = 0;
    let retirosCop = 0;

    for (const salida of salidas) {
      const montoCop = Number(salida.montoCop);

      if (salida.tipo === TipoSalida.PAGO_ACREEDOR) {
        pagosAcreedoresCop += montoCop;
        continue;
      }

      if (salida.tipo === TipoSalida.GASTO) {
        gastosCop += montoCop;
        continue;
      }

      if (salida.tipo === TipoSalida.RETIRO) {
        retirosCop += montoCop;
      }
    }

    return {
      cantidad: salidas.length,
      pagosAcreedoresCop,
      gastosCop,
      retirosCop,
      totalSalidasCop:
        pagosAcreedoresCop +
        gastosCop +
        retirosCop,
    };
  }

  private calcularResumenCuentas(
    cuentas: Array<{
      id: string;
      nombre: string;
      moneda: string;
      categoria: CategoriaCuenta;
      tipo: string;
      saldo: Prisma.Decimal;
    }>,
  ) {
    const saldoCuentasCop = cuentas
      .filter(
        (cuenta) =>
          cuenta.categoria === CategoriaCuenta.BASE_COP &&
          cuenta.moneda === 'COP',
      )
      .reduce(
        (total, cuenta) => total + Number(cuenta.saldo),
        0,
      );

    const porMoneda = cuentas.reduce<Record<string, number>>(
      (acc, cuenta) => {
        acc[cuenta.moneda] =
          (acc[cuenta.moneda] ?? 0) + Number(cuenta.saldo);

        return acc;
      },
      {},
    );

    return {
      cantidad: cuentas.length,
      saldoCuentasCop,
      porMoneda,
      detalle: cuentas.map((cuenta) => ({
        ...cuenta,
        saldo: Number(cuenta.saldo),
      })),
    };
  }

  private calcularCartera(
    movimientos: Array<{
      clienteId: string;
      debitoCop: Prisma.Decimal;
      creditoCop: Prisma.Decimal;
      cliente: {
        id: string;
        nombre: string;
        documento: string | null;
        telefono: string | null;
        estado: string;
      };
    }>,
  ) {
    const balances = new Map<
      string,
      {
        cliente: {
          id: string;
          nombre: string;
          documento: string | null;
          telefono: string | null;
          estado: string;
        };
        totalDebitosCop: number;
        totalCreditosCop: number;
      }
    >();

    for (const movimiento of movimientos) {
      const balanceActual = balances.get(movimiento.clienteId) ?? {
        cliente: movimiento.cliente,
        totalDebitosCop: 0,
        totalCreditosCop: 0,
      };

      balanceActual.totalDebitosCop += Number(movimiento.debitoCop);
      balanceActual.totalCreditosCop += Number(movimiento.creditoCop);

      balances.set(movimiento.clienteId, balanceActual);
    }

    const detalle = Array.from(balances.values())
      .map((item) => {
        const saldoCop =
          item.totalDebitosCop - item.totalCreditosCop;

        return {
          cliente: item.cliente,
          totalDebitosCop: item.totalDebitosCop,
          totalCreditosCop: item.totalCreditosCop,
          saldoCop,
          estado:
            saldoCop > 0
              ? 'ME_DEBE'
              : saldoCop < 0
                ? 'LE_DEBO'
                : 'SALDADO',
        };
      })
      .filter((item) => item.saldoCop !== 0);

    const porCobrar = detalle
      .filter((item) => item.saldoCop > 0)
      .sort((a, b) => b.saldoCop - a.saldoCop);

    const porPagar = detalle
      .filter((item) => item.saldoCop < 0)
      .sort((a, b) => a.saldoCop - b.saldoCop);

    const porCobrarCop = porCobrar.reduce(
      (total, item) => total + item.saldoCop,
      0,
    );

    const porPagarCop = porPagar.reduce(
      (total, item) => total + Math.abs(item.saldoCop),
      0,
    );

    return {
      porCobrarCop,
      porPagarCop,
      balanceNetoCop: porCobrarCop - porPagarCop,
      cantidadDeudores: porCobrar.length,
      cantidadAcreedores: porPagar.length,
      principalesDeudores: porCobrar.slice(0, 5),
      principalesAcreedores: porPagar.slice(0, 5),
    };
  }

  private crearFechaInicio(value: string) {
    const fecha = new Date(value);
    fecha.setHours(0, 0, 0, 0);
    return fecha;
  }

  private crearFechaFin(value: string) {
    const fecha = new Date(value);
    fecha.setHours(23, 59, 59, 999);
    return fecha;
  }

  private inicioDelDia(fecha: Date) {
    const resultado = new Date(fecha);
    resultado.setHours(0, 0, 0, 0);
    return resultado;
  }

  private finDelDia(fecha: Date) {
    const resultado = new Date(fecha);
    resultado.setHours(23, 59, 59, 999);
    return resultado;
  }
}