import { NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes/clientes.service';
import { CuentasService } from './cuentas/cuentas.service';
import { EntradasService } from './entradas/entradas.service';
import { OperacionesService } from './operaciones/operaciones.service';
import { SalidasService } from './salidas/salidas.service';

jest.mock('../generated/prisma/client', () => ({
  CategoriaCuenta: {
    BASE_COP: 'BASE_COP',
    OPERATIVA: 'OPERATIVA',
  },
  EstadoEntidad: {
    ACTIVO: 'ACTIVO',
    INACTIVO: 'INACTIVO',
  },
  EstadoOperacion: {
    REGISTRADA: 'REGISTRADA',
    CANCELADA: 'CANCELADA',
  },
  Moneda: {
    COP: 'COP',
    BS: 'BS',
    USD: 'USD',
    USDT: 'USDT',
  },
  Prisma: {},
  PrismaClient: class {},
  TipoCuenta: {
    CAJA: 'CAJA',
    OFICINA: 'OFICINA',
    BANCO: 'BANCO',
    ZELLE: 'ZELLE',
    BINANCE: 'BINANCE',
    BILLETERA_BS: 'BILLETERA_BS',
    OTRA: 'OTRA',
  },
  TipoEntrada: {
    ABONO_CUENTA_PROPIA: 'ABONO_CUENTA_PROPIA',
    ABONO_DIRECTO_PROVEEDOR: 'ABONO_DIRECTO_PROVEEDOR',
  },
  TipoMovimientoCliente: {
    OPERACION: 'OPERACION',
    ABONO: 'ABONO',
    PAGO: 'PAGO',
    ABONO_DIRECTO: 'ABONO_DIRECTO',
    AJUSTE: 'AJUSTE',
    CANCELACION: 'CANCELACION',
  },
  TipoMovimientoCuenta: {
    ENTRADA: 'ENTRADA',
    SALIDA: 'SALIDA',
    GASTO: 'GASTO',
    TRASLADO_ENTRADA: 'TRASLADO_ENTRADA',
    TRASLADO_SALIDA: 'TRASLADO_SALIDA',
    OPERACION_ENTRADA: 'OPERACION_ENTRADA',
    OPERACION_SALIDA: 'OPERACION_SALIDA',
    AJUSTE_ENTRADA: 'AJUSTE_ENTRADA',
    AJUSTE_SALIDA: 'AJUSTE_SALIDA',
  },
  TipoOperacion: {
    COMPRA: 'COMPRA',
    VENTA: 'VENTA',
    OPERACION_DIRECTA: 'OPERACION_DIRECTA',
  },
  TipoSalida: {
    PAGO_ACREEDOR: 'PAGO_ACREEDOR',
    GASTO: 'GASTO',
    RETIRO: 'RETIRO',
  },
}));

const CategoriaCuenta = {
  BASE_COP: 'BASE_COP',
  OPERATIVA: 'OPERATIVA',
} as const;
const EstadoEntidad = {
  ACTIVO: 'ACTIVO',
} as const;
const Moneda = {
  COP: 'COP',
  USD: 'USD',
} as const;
const TipoCuenta = {
  CAJA: 'CAJA',
} as const;
const TipoEntrada = {
  ABONO_CUENTA_PROPIA: 'ABONO_CUENTA_PROPIA',
} as const;
const TipoOperacion = {
  VENTA: 'VENTA',
} as const;
const TipoSalida = {
  GASTO: 'GASTO',
} as const;

const TENANT_ID = 'tenant-a';

function createCuenta(overrides = {}) {
  return {
    id: 'cuenta-a',
    nombre: 'Caja A',
    moneda: Moneda.COP,
    categoria: CategoriaCuenta.BASE_COP,
    tipo: TipoCuenta.CAJA,
    aplica4x1000: false,
    saldo: 1_000_000,
    estado: EstadoEntidad.ACTIVO,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function createCliente(overrides = {}) {
  return {
    id: 'cliente-a',
    nombre: 'Cliente A',
    documento: null,
    telefono: null,
    estado: EstadoEntidad.ACTIVO,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

describe('Tenant financial core', () => {
  describe('OperacionesService', () => {
    it('filtra el listado por tenant y usa la configuracion del tenant', async () => {
      const prisma = {
        configuracionOrganizacion: {
          findUnique: jest.fn().mockResolvedValue({
            zonaHoraria: 'America/Bogota',
          }),
        },
        operacion: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };

      const service = new OperacionesService(prisma as never);

      await service.findAll({}, TENANT_ID);

      expect(prisma.configuracionOrganizacion.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
        },
        select: {
          zonaHoraria: true,
        },
      });
      expect(prisma.operacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
    });

    it('devuelve operaciones paginadas con meta y aplica page/pageSize', async () => {
      const prisma = {
        configuracionOrganizacion: {
          findUnique: jest.fn().mockResolvedValue({
            zonaHoraria: 'America/Bogota',
          }),
        },
        operacion: {
          findMany: jest.fn().mockResolvedValue([{ id: 'op-2' }]),
          count: jest.fn().mockResolvedValue(43),
        },
      };

      const service = new OperacionesService(prisma as never);

      const result = await service.findAll({ page: 2, pageSize: 10 }, TENANT_ID);

      expect(prisma.operacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
          skip: 10,
          take: 10,
        }),
      );
      expect(result).toEqual({
        items: [{ id: 'op-2' }],
        meta: {
          page: 2,
          pageSize: 10,
          total: 43,
          totalPages: 5,
        },
      });
    });

    it('crea venta con tenantId y valida cliente/cuenta dentro del tenant', async () => {
      const tx = {
        cliente: {
          findFirst: jest.fn().mockResolvedValue(createCliente()),
        },
        cuenta: {
          findFirst: jest.fn().mockResolvedValue(
            createCuenta({
              moneda: Moneda.USD,
              categoria: CategoriaCuenta.OPERATIVA,
              saldo: 100,
            }),
          ),
          update: jest.fn().mockResolvedValue(createCuenta()),
        },
        operacion: {
          create: jest.fn().mockResolvedValue({
            id: 'op-a',
            codigo: 'OP-000001',
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'op-a',
            tenantId: TENANT_ID,
          }),
        },
        movimientoCuenta: {
          create: jest.fn().mockResolvedValue({}),
        },
        movimientoCliente: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        operacion: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn((callback) => callback(tx)),
      };

      const service = new OperacionesService(prisma as never);

      await service.create(
        {
          nombre: 'Venta USD',
          tipo: TipoOperacion.VENTA,
          deudorId: 'cliente-a',
          cuentaOperativaId: 'cuenta-a',
          monedaTransaccion: Moneda.USD,
          montoTransaccion: 10,
          tasaCompra: 3900,
          tasaVenta: 4000,
        },
        TENANT_ID,
      );

      expect(tx.cliente.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cliente-a',
          tenantId: TENANT_ID,
        },
      });
      expect(tx.cuenta.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cuenta-a',
          tenantId: TENANT_ID,
        },
      });
      expect(tx.operacion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
      expect(tx.movimientoCuenta.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
      expect(tx.movimientoCliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
    });

    it('rechaza una operacion si la cuenta no pertenece al tenant', async () => {
      const tx = {
        cliente: {
          findFirst: jest.fn().mockResolvedValue(createCliente()),
        },
        cuenta: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        operacion: {
          create: jest.fn(),
        },
      };

      const prisma = {
        operacion: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn((callback) => callback(tx)),
      };

      const service = new OperacionesService(prisma as never);

      await expect(
        service.create(
          {
            nombre: 'Venta cruzada',
            tipo: TipoOperacion.VENTA,
            deudorId: 'cliente-a',
            cuentaOperativaId: 'cuenta-b',
            monedaTransaccion: Moneda.USD,
            montoTransaccion: 10,
            tasaCompra: 3900,
            tasaVenta: 4000,
          },
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(tx.cuenta.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cuenta-b',
          tenantId: TENANT_ID,
        },
      });
      expect(tx.operacion.create).not.toHaveBeenCalled();
    });
  });

  describe('EntradasService', () => {
    it('crea abono a cuenta propia con tenantId en entrada y movimientos', async () => {
      const tx = {
        cliente: {
          findFirst: jest.fn().mockResolvedValue(createCliente()),
        },
        cuenta: {
          findFirst: jest.fn().mockResolvedValue(createCuenta()),
          update: jest.fn().mockResolvedValue(createCuenta()),
        },
        entrada: {
          create: jest.fn().mockResolvedValue({ id: 'entrada-a' }),
          findUnique: jest.fn().mockResolvedValue({ id: 'entrada-a' }),
        },
        movimientoCuenta: {
          create: jest.fn().mockResolvedValue({}),
        },
        movimientoCliente: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        $transaction: jest.fn((callback) => callback(tx)),
      };

      const service = new EntradasService(prisma as never);

      await service.create(
        {
          tipo: TipoEntrada.ABONO_CUENTA_PROPIA,
          deudorId: 'cliente-a',
          cuentaId: 'cuenta-a',
          montoCop: 100_000,
        },
        TENANT_ID,
      );

      expect(tx.cliente.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cliente-a',
          tenantId: TENANT_ID,
        },
      });
      expect(tx.cuenta.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cuenta-a',
          tenantId: TENANT_ID,
        },
      });
      expect(tx.entrada.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
      expect(tx.movimientoCuenta.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
      expect(tx.movimientoCliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
    });
  });

  describe('SalidasService', () => {
    it('crea gasto con tenantId en salida y movimiento de cuenta', async () => {
      const tx = {
        cuenta: {
          findFirst: jest.fn().mockResolvedValue(createCuenta()),
          update: jest.fn().mockResolvedValue(createCuenta()),
        },
        salida: {
          create: jest.fn().mockResolvedValue({ id: 'salida-a' }),
          findUnique: jest.fn().mockResolvedValue({ id: 'salida-a' }),
        },
        movimientoCuenta: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        $transaction: jest.fn((callback) => callback(tx)),
      };

      const service = new SalidasService(prisma as never);

      await service.create(
        {
          tipo: TipoSalida.GASTO,
          cuentaId: 'cuenta-a',
          montoCop: 25_000,
        },
        TENANT_ID,
      );

      expect(tx.cuenta.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cuenta-a',
          tenantId: TENANT_ID,
        },
      });
      expect(tx.salida.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
      expect(tx.movimientoCuenta.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
    });
  });

  describe('Servicios derivados', () => {
    it('consulta movimientos de cuenta por cuentaId y tenantId', async () => {
      const prisma = {
        cuenta: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cuenta-a' }),
        },
        movimientoCuenta: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const service = new CuentasService(prisma as never);

      await service.getMovimientos('cuenta-a', TENANT_ID);

      expect(prisma.movimientoCuenta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cuentaId: 'cuenta-a',
            tenantId: TENANT_ID,
          },
        }),
      );
    });

    it('calcula balance de cliente solo con movimientos del tenant', async () => {
      const prisma = {
        cliente: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cliente-a' }),
        },
        movimientoCliente: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const service = new ClientesService(prisma as never);

      await service.getBalance('cliente-a', TENANT_ID);

      expect(prisma.movimientoCliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clienteId: 'cliente-a',
            tenantId: TENANT_ID,
          },
        }),
      );
    });
  });
});
