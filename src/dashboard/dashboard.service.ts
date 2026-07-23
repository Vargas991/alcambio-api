import { BadRequestException, Injectable } from '@nestjs/common';

import {
  CategoriaCuenta,
  EstadoEntidad,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CuentasService } from '../cuentas/cuentas.service';

@Injectable()
export class DashboardService {
  /**
   * El negocio trabaja con horario de Venezuela.
   *
   * Venezuela actualmente utiliza UTC-04:00.
   */
  private readonly timezoneOffset = '-04:00';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cuentasService: CuentasService,
  ) {}

  /**
   * ==========================================
   * DASHBOARD GENERAL
   * ==========================================
   *
   * GET /dashboard/resumen?fecha=2026-07-23
   *
   * Si no se envía fecha se toma la fecha
   * actual de Venezuela.
   */
  async obtenerResumen(fecha?: string) {
    const fechaSeleccionada =
      fecha ?? this.obtenerFechaActualVenezuela();

    this.validarFecha(fechaSeleccionada);

    const { inicio, fin } =
      this.obtenerRangoDia(fechaSeleccionada);

    /**
     * Ejecutamos en paralelo las dos partes
     * principales del dashboard.
     */
    const [
      capital,
      caja,
    ] = await Promise.all([
      this.obtenerCapitalOperativo(),
      this.obtenerCajaDia(inicio, fin),
    ]);

    return {
      fecha: fechaSeleccionada,

      capital,

      caja,

      generadoEn: new Date(),
    };
  }

  /**
   * ==========================================
   * CAPITAL OPERATIVO ACTUAL
   * ==========================================
   *
   * Disponible COP
   * +
   * inventario de divisas valorizado
   * al promedio de compra.
   */
  private async obtenerCapitalOperativo() {
    /**
     * Cuentas financieras en COP.
     *
     * Ej:
     * - Caja
     * - Oficina
     * - Bancolombia
     */
    const cuentasBase =
      await this.prisma.cuenta.findMany({
        where: {
          categoria: CategoriaCuenta.BASE_COP,
          moneda: 'COP',
          estado: EstadoEntidad.ACTIVO,
        },

        orderBy: {
          nombre: 'asc',
        },

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

    /**
     * Reutilizamos el método que YA tienes
     * en CuentasService.
     *
     * No duplicamos el promedio ponderado.
     */
    const promedios =
      await this.cuentasService
        .obtenerPromediosCompraCuentasOperativas();

    /**
     * ======================================
     * CUENTAS BASE COP
     * ======================================
     */

    const cuentasBaseResponse =
      cuentasBase.map((cuenta) => ({
        id: cuenta.id,

        nombre: cuenta.nombre,

        moneda: cuenta.moneda,

        tipo: cuenta.tipo,

        saldo: Number(cuenta.saldo),

        aplica4x1000:
          cuenta.aplica4x1000,
      }));

    /**
     * Dinero líquido disponible actualmente
     * en cuentas COP.
     */
    const disponibleCop =
      this.redondearDosDecimales(
        cuentasBaseResponse.reduce(
          (total, cuenta) =>
            total + cuenta.saldo,
          0,
        ),
      );

    /**
     * ======================================
     * CUENTAS OPERATIVAS
     * ======================================
     *
     * IMPORTANTE:
     *
     * Para el dashboard valorizamos el saldo
     * REAL actual de la cuenta usando el
     * promedio de compra.
     *
     * saldoActual × promedioCompra
     *
     * No utilizamos directamente
     * costoInventarioCop porque ese valor
     * corresponde al saldo reconstruido
     * desde operaciones.
     */
    const cuentasOperativas =
      promedios.map((cuenta) => {
        const saldoActual =
          Number(cuenta.saldoActual ?? 0);

        const saldoCalculado =
          Number(cuenta.saldoCalculado ?? 0);

        const promedioCompra =
          Number(cuenta.promedioCompra ?? 0);

        const valorActualCop =
          this.redondearDosDecimales(
            saldoActual *
              promedioCompra,
          );

        const diferenciaSaldo =
          this.redondearDosDecimales(
            saldoActual -
              saldoCalculado,
          );

        return {
          id: cuenta.cuentaId,

          nombre: cuenta.cuenta,

          moneda: cuenta.moneda,

          saldoActual,

          saldoCalculado,

          diferenciaSaldo,

          promedioCompra,

          tasaMinimaVenta:
            Number(
              cuenta.tasaMinimaVenta ?? 0,
            ),

          /**
           * Costo calculado por el algoritmo
           * FIFO/promedio móvil existente.
           */
          costoInventarioCalculadoCop:
            Number(
              cuenta.costoInventarioCop ??
                0,
            ),

          /**
           * Valor que realmente nos interesa
           * para el dashboard:
           *
           * saldo físico actual × promedio.
           */
          valorActualCop,

          totalOperacionesAnalizadas:
            cuenta.totalOperacionesAnalizadas,
        };
      });

    /**
     * Valor total del dinero/divisas que
     * actualmente queda en las cuentas
     * operativas.
     */
    const inventarioDivisasCop =
      this.redondearDosDecimales(
        cuentasOperativas.reduce(
          (total, cuenta) =>
            total +
            cuenta.valorActualCop,
          0,
        ),
      );

    /**
     * ======================================
     * CAPITAL OPERATIVO
     * ======================================
     *
     * Dinero COP disponible
     * +
     * divisas valorizadas al costo promedio.
     */
    const capitalOperativoCop =
      this.redondearDosDecimales(
        disponibleCop +
          inventarioDivisasCop,
      );

    return {
      disponibleCop,

      inventarioDivisasCop,

      capitalOperativoCop,

      resumen: {
        cantidadCuentasBase:
          cuentasBaseResponse.length,

        cantidadCuentasOperativas:
          cuentasOperativas.length,
      },

      cuentasBase:
        cuentasBaseResponse,

      cuentasOperativas,
    };
  }

  /**
   * ==========================================
   * CAJA DEL DÍA
   * ==========================================
   *
   * Solo trabajamos con cuentas BASE_COP.
   *
   * saldo inicial
   * + entradas
   * - salidas
   * = saldo final
   */
  private async obtenerCajaDia(
    inicio: Date,
    fin: Date,
  ) {
    const cuentas =
      await this.prisma.cuenta.findMany({
        where: {
          categoria:
            CategoriaCuenta.BASE_COP,

          moneda: 'COP',

          estado:
            EstadoEntidad.ACTIVO,
        },

        orderBy: {
          nombre: 'asc',
        },

        select: {
          id: true,
          nombre: true,
          moneda: true,
          tipo: true,
          saldo: true,
          aplica4x1000: true,
        },
      });

    /**
     * Todos los movimientos realizados
     * durante el día seleccionado.
     */
    const movimientosDia =
      await this.prisma.movimientoCuenta
        .findMany({
          where: {
            cuentaId: {
              in: cuentas.map(
                (cuenta) =>
                  cuenta.id,
              ),
            },

            creadoEn: {
              gte: inicio,
              lt: fin,
            },
          },

          orderBy: {
            creadoEn: 'asc',
          },
        });

    /**
     * Necesitamos conocer el saldo existente
     * justo antes de comenzar el día.
     *
     * Esto permite consultar:
     *
     * hoy
     * ayer
     * cualquier fecha histórica
     */
    const movimientosAnteriores =
      await Promise.all(
        cuentas.map(async (cuenta) => {
          const movimiento =
            await this.prisma
              .movimientoCuenta
              .findFirst({
                where: {
                  cuentaId:
                    cuenta.id,

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
      );

    const saldoAnteriorPorCuenta =
      new Map<
        string,
        number | null
      >();

    for (
      const item of movimientosAnteriores
    ) {
      saldoAnteriorPorCuenta.set(
        item.cuentaId,
        item.movimiento
          ? Number(
              item.movimiento
                .saldoNuevo,
            )
          : null,
      );
    }

    /**
     * ======================================
     * RESUMEN POR CUENTA
     * ======================================
     */

    const cuentasCaja =
      cuentas.map((cuenta) => {
        const movimientos =
          movimientosDia.filter(
            (movimiento) =>
              movimiento.cuentaId ===
              cuenta.id,
          );

        /**
         * SALDO INICIAL
         *
         * Prioridad:
         *
         * 1. saldoAnterior del primer movimiento
         *    del día.
         *
         * 2. último saldoNuevo anterior al día.
         *
         * 3. si jamás tuvo movimientos y estamos
         *    en el presente, utilizamos saldo.
         */
        let saldoInicial = 0;

        const primerMovimiento =
          movimientos[0];

        if (primerMovimiento) {
          saldoInicial =
            Number(
              primerMovimiento
                .saldoAnterior,
            );
        } else {
          const saldoAnterior =
            saldoAnteriorPorCuenta.get(
              cuenta.id,
            );

          if (
            saldoAnterior !== null &&
            saldoAnterior !== undefined
          ) {
            saldoInicial =
              saldoAnterior;
          } else {
            /**
             * Cuenta sin historial.
             *
             * Normalmente será una cuenta con
             * saldo 0.
             */
            saldoInicial = 0;
          }
        }

        let entradas = 0;
        let salidas = 0;

        for (
          const movimiento of movimientos
        ) {
          const anterior =
            Number(
              movimiento.saldoAnterior,
            );

          const nuevo =
            Number(
              movimiento.saldoNuevo,
            );

          const diferencia =
            this.redondearDosDecimales(
              nuevo - anterior,
            );

          /**
           * Esta estrategia es mejor que
           * depender del enum:
           *
           * saldo subió → entrada
           * saldo bajó → salida
           *
           * Incluye:
           * - entradas
           * - salidas
           * - gastos
           * - traslados
           * - ajustes
           */
          if (diferencia > 0) {
            entradas += diferencia;
          }

          if (diferencia < 0) {
            salidas +=
              Math.abs(diferencia);
          }
        }

        entradas =
          this.redondearDosDecimales(
            entradas,
          );

        salidas =
          this.redondearDosDecimales(
            salidas,
          );

        /**
         * El último movimiento nos da el
         * cierre real del día.
         */
        const ultimoMovimiento =
          movimientos[
            movimientos.length - 1
          ];

        const saldoFinal =
          ultimoMovimiento
            ? Number(
                ultimoMovimiento
                  .saldoNuevo,
              )
            : saldoInicial;

        const variacion =
          this.redondearDosDecimales(
            saldoFinal -
              saldoInicial,
          );

        return {
          id: cuenta.id,

          nombre: cuenta.nombre,

          moneda: cuenta.moneda,

          tipo: cuenta.tipo,

          aplica4x1000:
            cuenta.aplica4x1000,

          saldoInicial:
            this.redondearDosDecimales(
              saldoInicial,
            ),

          entradas,

          salidas,

          variacion,

          saldoFinal:
            this.redondearDosDecimales(
              saldoFinal,
            ),

          /**
           * Saldo actual real de la cuenta.
           *
           * Es útil para comparar cuando
           * consultamos el día actual.
           */
          saldoActual:
            Number(cuenta.saldo),

          cantidadMovimientos:
            movimientos.length,
        };
      });

    /**
     * ======================================
     * TOTALES CAJA
     * ======================================
     */

    const saldoInicial =
      this.redondearDosDecimales(
        cuentasCaja.reduce(
          (total, cuenta) =>
            total +
            cuenta.saldoInicial,
          0,
        ),
      );

    const entradas =
      this.redondearDosDecimales(
        cuentasCaja.reduce(
          (total, cuenta) =>
            total +
            cuenta.entradas,
          0,
        ),
      );

    const salidas =
      this.redondearDosDecimales(
        cuentasCaja.reduce(
          (total, cuenta) =>
            total +
            cuenta.salidas,
          0,
        ),
      );

    const saldoFinal =
      this.redondearDosDecimales(
        cuentasCaja.reduce(
          (total, cuenta) =>
            total +
            cuenta.saldoFinal,
          0,
        ),
      );

    const variacion =
      this.redondearDosDecimales(
        saldoFinal -
          saldoInicial,
      );

    return {
      resumen: {
        saldoInicial,
        entradas,
        salidas,
        variacion,
        saldoFinal,
      },

      cuentas:
        cuentasCaja,

      movimientos:
        movimientosDia.map(
          (movimiento) => {
            const saldoAnterior =
              Number(
                movimiento.saldoAnterior,
              );

            const saldoNuevo =
              Number(
                movimiento.saldoNuevo,
              );

            const diferencia =
              this.redondearDosDecimales(
                saldoNuevo -
                  saldoAnterior,
              );

            return {
              id: movimiento.id,

              cuentaId:
                movimiento.cuentaId,

              tipo:
                movimiento.tipo,

              descripcion:
                movimiento.descripcion,

              referenciaTipo:
                movimiento.referenciaTipo,

              referenciaId:
                movimiento.referenciaId,

              moneda:
                movimiento.moneda,

              monto:
                Number(
                  movimiento.monto,
                ),

              entrada:
                diferencia > 0
                  ? diferencia
                  : 0,

              salida:
                diferencia < 0
                  ? Math.abs(
                      diferencia,
                    )
                  : 0,

              saldoAnterior,

              saldoNuevo,

              creadoEn:
                movimiento.creadoEn,
            };
          },
        ),
    };
  }

  /**
   * ==========================================
   * FECHAS
   * ==========================================
   */

  private obtenerFechaActualVenezuela() {
    return new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Caracas',

        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    ).format(new Date());
  }

  private obtenerRangoDia(
    fecha: string,
  ) {
    /**
     * Inicio:
     * 2026-07-23 00:00 Venezuela
     *
     * JS lo convierte internamente a UTC.
     */
    const inicio = new Date(
      `${fecha}T00:00:00.000${this.timezoneOffset}`,
    );

    /**
     * Calculamos el siguiente día usando UTC
     * solo para manipular YYYY-MM-DD.
     */
    const [
      year,
      month,
      day,
    ] = fecha
      .split('-')
      .map(Number);

    const siguiente =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day + 1,
        ),
      );

    const siguienteFecha = [
      siguiente
        .getUTCFullYear()
        .toString()
        .padStart(4, '0'),

      (
        siguiente.getUTCMonth() +
        1
      )
        .toString()
        .padStart(2, '0'),

      siguiente
        .getUTCDate()
        .toString()
        .padStart(2, '0'),
    ].join('-');

    const fin = new Date(
      `${siguienteFecha}T00:00:00.000${this.timezoneOffset}`,
    );

    return {
      inicio,
      fin,
    };
  }

  private validarFecha(
    fecha: string,
  ) {
    const regex =
      /^\d{4}-\d{2}-\d{2}$/;

    if (!regex.test(fecha)) {
      throw new BadRequestException(
        'La fecha debe tener formato YYYY-MM-DD.',
      );
    }

    const fechaDate =
      new Date(`${fecha}T12:00:00Z`);

    if (
      Number.isNaN(
        fechaDate.getTime(),
      )
    ) {
      throw new BadRequestException(
        'La fecha indicada no es válida.',
      );
    }
  }

  private redondearDosDecimales(
    valor: number,
  ) {
    return (
      Math.round(
        (
          valor +
          Number.EPSILON
        ) * 100,
      ) / 100
    );
  }
}