import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfiguracionService } from 'src/configuracion/configuracion.service';

type BalanceMonedaPdf = {
  moneda: string;
  totalDebitos: number;
  totalCreditos: number;
  saldo: number;
  estado: string;
};

type LedgerClientePdfData = {
  cliente: {
    id: string;
    nombre: string;
    documento?: string | null;
    telefono?: string | null;
    estado: string;
  };

  filtros: {
    desde: string | null;
    hasta: string | null;
    tipo: string | null;
    estado?: string | null;
    tipoMov?: string | null;
    moneda: string | null;

    /**
     * TASA | PORCENTAJE.
     * Se acepta PROMEDIO como alias temporal de PORCENTAJE
     * para no romper llamadas antiguas del frontend.
     */
    metodoCalculo?: string | null;
  };

  resumen: {
    balancesFiltrados: BalanceMonedaPdf[];
    balancesGlobales: BalanceMonedaPdf[];

    totalUtilidadRealCop?: number;
    utilidadPorDia?: {
      fecha: string;
      utilidadCop: number;
    }[];
  };

  movimientos: Array<{
    id: string;
    tipo: string;

    moneda?: string | null;
    debito?: unknown;
    credito?: unknown;

    monedaTransaccion?: string | null;
    montoTransaccion?: unknown;

    /**
     * Campos legados. Se conservan como fallback
     * para movimientos históricos.
     */
    debitoCop?: unknown;
    creditoCop?: unknown;

    descripcion?: string | null;
    creadoEn: Date | string;
    utilidadRealCop?: number;

    operacion?: {
      codigo: string;
      nombre: string;
      tipo: string;

      metodoCalculo?: string | null;

      tasaCompra?: unknown;
      tasaVenta?: unknown;

      porcentaje?: unknown;
      aplicacionPorcentaje?: string | null;
      montoComision?: unknown;
      montoResultado?: unknown;

      monedaDeuda?: string | null;
      montoDeuda?: unknown;

      utilidadCop?: unknown;
      destinatario?: string | null;
      notas?: string | null;
    } | null;

    entrada?: {
      tipo: string;
      referencia?: string | null;
      descripcion?: string | null;
      notas?: string | null;
      monedaPago?: string | null;
      montoPago?: unknown;
      monedaAplicacion?: string | null;
      montoAplicado?: unknown;
      tasaConversion?: unknown;
    } | null;

    salida?: {
      tipo: string;
      referencia?: string | null;
      descripcion?: string | null;
      notas?: string | null;
      montoCop?: unknown;
      monedaPago?: string | null;
      montoPago?: unknown;
      monedaAplicacion?: string | null;
      montoAplicado?: unknown;
      tasaConversion?: unknown;
      cuenta?: {
        id: string;
        nombre: string;
        moneda: string;
      } | null;
    } | null;
  }>;
};

type TableColumn = {
  title: string;
  x: number;
  width: number;
  align: 'left' | 'center' | 'right';
};

type MovimientoConversionPdf = {
  monedaPago?: string | null;
  montoPago?: unknown;
  monedaAplicacion?: string | null;
  montoAplicado?: unknown;
  tasaConversion?: unknown;
};

type ParTasaVisible = {
  base: string;
  quote: string;
};

const TIPO_COLORS: Record<string, string> = {
  VENTA: '#DCFCE7', // green-100
  COMPRA: '#FEE2E2', // red-100
  DIRECTA: '#DBEAFE', // blue-100
  ABONO: '#FEF9C3', // yellow-100
  'ABONO DIRECTO': '#FEF9C3', // yellow-100
  PAGO: '#E0E7FF', // indigo-100
  GASTO: '#FED7AA', // orange-200
  RETIRO: '#E5E7EB', // gray-200
  CANCELACIÓN: '#F3F4F6', // gray-100
};

/**
 * ==========================================
 * MEMBRETE DE LA ORGANIZACIÓN
 * ==========================================
 *
 * Variables opcionales:
 *
 * ORGANIZATION_NAME="Nombre de la organización"
 * ORGANIZATION_LOGO_PATH="/ruta/absoluta/logo.png"
 *
 * Si no se define ORGANIZATION_LOGO_PATH,
 * se buscará public/logo.png.
 */
const ORGANIZATION_NAME =
  process.env.ORGANIZATION_NAME ?? 'Nombre de la organización';

@Injectable()
export class ClienteLedgerPdfService {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  async generate(ledger: LedgerClientePdfData): Promise<Buffer> {
    const configuracion = await this.configuracionService.obtenerOrganizacion();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 30,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawHeader(doc, ledger, configuracion);
      this.drawResumen(doc, ledger);
      this.drawMovimientos(doc, ledger, configuracion.zonaHoraria);
      this.drawFooter(doc);

      doc.end();
    });
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    ledger: LedgerClientePdfData,
    configuracion?: {
      nombre: string;
      logoUrl?: string | null;
      zonaHoraria: string;
    },
  ) {
    /**
     * ==========================================
     * MEMBRETE
     * ==========================================
     */
    const headerTop = 20;
    const logoWidth = 80;
    const logoHeight = 60;
    const organizationTextX = logoWidth + 50;

    const logoPath = configuracion?.logoUrl
      ? join(process.cwd(), configuracion?.logoUrl?.replace(/^\/+/, ''))
      : null;
    console.log('path: ', logoPath);

    if (logoPath && existsSync(logoPath)) {
      try {
        doc.image(logoPath, 50, headerTop, {
          fit: [logoWidth, logoHeight],
          // 'align' option is not accepted by the PDFKit TypeScript defs here,
          // so omit it to avoid a type error. Position is set by the x,y args above.
        });
      } catch {
        // Si el logo falla, el PDF continúa con el nombre.
      }
    }

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(
        configuracion?.nombre ?? ORGANIZATION_NAME,
        organizationTextX,
        headerTop + logoHeight / 2,
        {
          width: 790 - organizationTextX,
          // align: 'right',
        },
      );

    doc
      .save()
      .strokeColor('#D1D5DB')
      // .lineWidth(0.8)
      .moveTo(30, 63)
      // .lineTo(790, 63)
      .stroke()
      .restore();

    /**
     * Título principal.
     */
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Estado de Cuenta del Cliente', 30, 74, {
        width: 760,
        align: 'center',
      });

    /**
     * Nombre del cliente:
     * tamaño intermedio entre título y fecha.
     */
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#374151')
      .text(ledger.cliente.nombre, 30, 97, {
        width: 760,
        align: 'center',
      });

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text(
        `Generado: ${this.formatDateTime(
          new Date(),
          configuracion?.zonaHoraria,
        )}`,
        30,
        115,
        {
          width: 760,
          align: 'center',
        },
      );

    doc.y = 139;

    /**
     * Datos complementarios del cliente.
     * El nombre ya está destacado arriba.
     */
    const yCliente = doc.y;

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Documento:', 30, yCliente, {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.cliente.documento ?? 'N/A'}`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text('   Teléfono:', {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.cliente.telefono ?? 'N/A'}`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text('   Estado:', {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.cliente.estado}`);

    doc.moveDown(0.4);

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Desde:', 30, doc.y, {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.filtros.desde ?? 'Sin filtro'}`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text('   Hasta:', {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.filtros.hasta ?? 'Sin filtro'}`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text('   Tipo:', {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.filtros.tipo ?? 'Todos'}`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text('   Moneda:', {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${ledger.filtros.moneda ?? 'Todas'}`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text('   Método:', {
        continued: true,
      })
      .font('Helvetica')
      .text(` ${this.getMetodoFiltroTexto(ledger.filtros.metodoCalculo)}`);

    doc.moveDown(0.7);

    this.drawLine(doc);
  }

  private getSaldoPeriodoTexto(saldo: number, moneda: string) {
    if (saldo > 0) {
      return `${this.money(saldo)} ${moneda} por cobrar`;
    }

    if (saldo < 0) {
      return `${this.money(Math.abs(saldo))} ${moneda} a favor`;
    }

    return `Saldado en ${moneda}`;
  }

  private drawResumen(doc: PDFKit.PDFDocument, ledger: LedgerClientePdfData) {
    const balances = this.getBalancesVisibles(ledger);

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Resumen del período:', 30, doc.y);

    if (balances.length === 0) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .text('Sin movimientos para los filtros seleccionados.', 30, doc.y + 4);

      doc.moveDown(1.2);
      return;
    }

    for (const balance of balances) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(`${balance.moneda}:`, 30, doc.y + 3, {
          continued: true,
        })
        .font('Helvetica')
        .text(
          ` Débitos: ${this.money(balance.totalDebitos)} ${balance.moneda}`,
          { continued: true },
        )
        .text(
          `   Abonos: ${this.money(balance.totalCreditos)} ${balance.moneda}`,
          { continued: true },
        )
        .font('Helvetica-Bold')
        .text(
          `   Saldo: ${this.getSaldoPeriodoTexto(
            balance.saldo,
            balance.moneda,
          )}`,
        );
    }

    doc.moveDown(0.8);
  }

  private drawMovimientos(
    doc: PDFKit.PDFDocument,
    ledger: LedgerClientePdfData,
    timeZone: string,
  ) {
    const metodoFiltro = this.normalizarMetodoCalculo(
      ledger.filtros.metodoCalculo,
    );

    const tituloCalculo =
      metodoFiltro === 'PORCENTAJE'
        ? '%'
        : metodoFiltro === 'TASA'
          ? 'Tasa'
          : 'Tasa / %';

    const columns: TableColumn[] = [
      { title: 'Fecha', x: 30, width: 65, align: 'left' },
      { title: 'Tipo', x: 95, width: 80, align: 'center' },
      { title: 'Concepto', x: 175, width: 220, align: 'left' },
      { title: 'Monto', x: 395, width: 90, align: 'right' },
      { title: tituloCalculo, x: 485, width: 75, align: 'right' },
      { title: 'Debe', x: 560, width: 75, align: 'right' },
      { title: 'Abono', x: 635, width: 75, align: 'right' },
      { title: 'Saldo', x: 710, width: 80, align: 'right' },
    ];

    let y = doc.y;

    this.drawTableHeader(doc, y, columns);
    y += 22;

    const movimientosAsc = [...ledger.movimientos]
      .filter((mov) => this.isMovimientoVisibleEnPdf(mov))
      .filter((mov) => {
        if (!metodoFiltro) {
          return true;
        }

        /**
         * Cuando se filtra por método solo se muestran
         * movimientos pertenecientes a operaciones.
         * Abonos, pagos y ajustes no tienen metodoCalculo.
         */
        return (
          this.normalizarMetodoCalculo(mov.operacion?.metodoCalculo) ===
          metodoFiltro
        );
      })
      .sort(
        (a, b) =>
          new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
      );

    /**
     * El saldo se acumula de forma independiente por moneda.
     * Nunca se suman COP + USD + BS + USDT.
     */
    const saldosPorMoneda = new Map<string, number>();

    for (const mov of movimientosAsc) {
      if (y > 520) {
        doc.addPage();
        y = 35;
        this.drawTableHeader(doc, y, columns);
        y += 22;
      }

      const moneda =
        mov.moneda ??
        mov.operacion?.monedaDeuda ??
        ledger.filtros.moneda ??
        'COP';

      const monto = Number(mov.montoTransaccion ?? 0);

      const debito = this.getDebitoMovimiento(mov);
      const credito = this.getCreditoMovimiento(mov);

      const saldoAnterior = saldosPorMoneda.get(moneda) ?? 0;

      const saldo = saldoAnterior + debito - credito;

      saldosPorMoneda.set(moneda, saldo);

      const tipoVisual = this.getTipoVisual(mov);
      const tipoColor = this.getTipoColor(tipoVisual);
      const saldoColor = this.getSaldoColor(saldo);

      const monedaMonto = mov.monedaTransaccion ?? moneda;

      const row = {
        fecha: this.formatDateShort(mov.creadoEn, timeZone),
        tipo: tipoVisual,
        concepto: this.getConceptoCliente(mov),
        monto: `${monedaMonto} ${this.money(monto)}`,
        calculo: this.getCalculoVisible(mov),
        debito: `${this.money(debito)} ${moneda}`,
        credito: `${this.money(credito)} ${moneda}`,
        saldo: `${this.money(saldo)} ${moneda}`,
      };

      this.drawTableRow(
        doc,
        y,
        columns,
        [
          row.fecha,
          row.tipo,
          row.concepto,
          row.monto,
          row.calculo,
          row.debito,
          row.credito,
          row.saldo,
        ],
        {
          tipoColor,
          saldoColor,
        },
      );

      y += 20;
    }

    if (movimientosAsc.length === 0) {
      doc
        .fontSize(8)
        .font('Helvetica')
        .text('No hay movimientos para los filtros seleccionados.', 30, y + 8);

      return;
    }

    /**
     * ==========================================
     * TOTALES POR MONEDA
     * ==========================================
     *
     * balancesFiltrados:
     * - suma de débitos del período/filtros
     * - suma de créditos del período/filtros
     * - saldo resultante del período/filtros
     *
     * balancesGlobales:
     * - saldo TOTAL REAL del cliente en esa moneda,
     *   sin verse afectado por los filtros del PDF.
     *
     * Las sumatorias se colocan exactamente debajo
     * de las columnas Debe y Abono.
     */
    y += 4;

    for (const balance of this.getBalancesVisibles(ledger)) {
      if (y > 520) {
        doc.addPage();
        y = 35;
        this.drawTableHeader(doc, y, columns);
        y += 22;
      }

      const balanceGlobal = ledger.resumen.balancesGlobales?.find(
        (item) => item.moneda === balance.moneda,
      );

      const saldoTotalReal = Number(balanceGlobal?.saldo ?? balance.saldo);

      this.drawTotalsRow(doc, y, columns, {
        moneda: balance.moneda,
        totalDebitos: balance.totalDebitos,
        totalCreditos: balance.totalCreditos,
        saldoPeriodo: balance.saldo,
        saldoTotalReal,
      });

      y += 46;
    }
  }

  private drawTableHeader(
    doc: PDFKit.PDFDocument,
    y: number,
    columns: TableColumn[],
  ) {
    const height = 20;

    doc.save().fillColor('#F2F2F2').rect(30, y, 760, height).fill().restore();

    doc.rect(30, y, 760, height).stroke();

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000');

    for (const column of columns) {
      doc.text(column.title, column.x + 3, y + 6, {
        width: column.width - 6,
        align: column.align,
      });

      doc
        .moveTo(column.x + column.width, y)
        .lineTo(column.x + column.width, y + height)
        .stroke();
    }
  }

  private drawTableRow(
    doc: PDFKit.PDFDocument,
    y: number,
    columns: TableColumn[],
    values: string[],
    options?: {
      tipoColor?: string;
      saldoColor?: string;
    },
  ) {
    const height = 20;

    doc.rect(30, y, 760, height).stroke();

    doc.fontSize(7).font('Helvetica');

    values.forEach((value, index) => {
      const column = columns[index];

      // Columna Tipo
      if (index === 1 && options?.tipoColor) {
        doc
          .save()
          .fillColor(options.tipoColor)
          .rect(column.x, y, column.width, height)
          .fill()
          .restore();

        doc.rect(column.x, y, column.width, height).stroke();
      }

      // Columna Saldo
      if (index === 7 && options?.saldoColor) {
        doc
          .save()
          .fillColor(options.saldoColor)
          .rect(column.x, y, column.width, height)
          .fill()
          .restore();

        doc.rect(column.x, y, column.width, height).stroke();
      }

      doc.fillColor('#000000').text(value, column.x + 3, y + 6, {
        width: column.width - 6,
        align: column.align,
        ellipsis: true,
      });

      doc
        .moveTo(column.x + column.width, y)
        .lineTo(column.x + column.width, y + height)
        .stroke();
    });

    doc.fillColor('#000000');
  }

  private drawTotalsRow(
    doc: PDFKit.PDFDocument,
    y: number,
    columns: TableColumn[],
    totals: {
      moneda: string;
      totalDebitos: number;
      totalCreditos: number;
      saldoPeriodo: number;
      saldoTotalReal: number;
    },
  ) {
    const height = 22;

    const labelX = columns[0].x;
    const labelWidth = columns[0].width + columns[1].width + columns[2].width;

    const drawMergedLabelCell = (
      yPosition: number,
      label: string,
      backgroundColor: string,
      fontSize = 7.5,
    ) => {
      doc
        .save()
        .fillColor(backgroundColor)
        .rect(labelX, yPosition, labelWidth, height)
        .fill()
        .restore();

      doc.rect(labelX, yPosition, labelWidth, height).stroke();

      doc
        .fontSize(fontSize)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(label, labelX + 4, yPosition + 7, {
          width: labelWidth - 8,
          align: 'left',
        });
    };

    const drawCell = (
      columnIndex: number,
      yPosition: number,
      value: string,
      backgroundColor: string,
      fontSize = 7.5,
    ) => {
      const column = columns[columnIndex];

      doc
        .save()
        .fillColor(backgroundColor)
        .rect(column.x, yPosition, column.width, height)
        .fill()
        .restore();

      doc.rect(column.x, yPosition, column.width, height).stroke();

      doc
        .fontSize(fontSize)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(value, column.x + 3, yPosition + 7, {
          width: column.width - 6,
          align: column.align,
        });
    };

    /**
     * ==========================================
     * FILA 1 — TOTALES DEL PERÍODO FILTRADO
     * ==========================================
     *
     * Débitos y abonos se muestran debajo de
     * sus columnas respectivas.
     */
    drawMergedLabelCell(y, `TOTALES ${totals.moneda}`, '#F3F4F6');

    drawCell(3, y, '', '#F3F4F6');

    drawCell(4, y, '', '#F3F4F6');

    drawCell(
      5,
      y,
      `${this.money(totals.totalDebitos)} ${totals.moneda}`,
      '#F3F4F6',
    );

    drawCell(
      6,
      y,
      `${this.money(totals.totalCreditos)} ${totals.moneda}`,
      '#F3F4F6',
    );

    drawCell(
      7,
      y,
      `${this.money(totals.saldoPeriodo)} ${totals.moneda}`,
      this.getSaldoColor(totals.saldoPeriodo),
    );

    /**
     * ==========================================
     * FILA 2 — SALDO TOTAL REAL
     * ==========================================
     *
     * Va debajo de la fila filtrada, NO como
     * una columna adicional.
     *
     * Se dibuja un punto más grande:
     * 8.5 pt frente a 7.5 pt.
     */
    const ySaldoReal = y + height;

    drawMergedLabelCell(ySaldoReal, 'SALDO TOTAL REAL', '#E5E7EB', 8.5);

    drawCell(3, ySaldoReal, '', '#E5E7EB', 8.5);

    drawCell(4, ySaldoReal, '', '#E5E7EB', 8.5);

    drawCell(5, ySaldoReal, '', '#E5E7EB', 8.5);

    drawCell(6, ySaldoReal, '', '#E5E7EB', 8.5);

    drawCell(
      7,
      ySaldoReal,
      `${this.money(totals.saldoTotalReal)} ${totals.moneda}`,
      this.getSaldoColor(totals.saldoTotalReal),
      8.5,
    );

    doc.fillColor('#000000');
  }

  private getBalancesVisibles(
    ledger: LedgerClientePdfData,
  ): BalanceMonedaPdf[] {
    const balances = ledger.resumen.balancesFiltrados ?? [];

    if (ledger.filtros.moneda) {
      return balances.filter(
        (balance) => balance.moneda === ledger.filtros.moneda,
      );
    }

    return balances.filter(
      (balance) =>
        balance.totalDebitos !== 0 ||
        balance.totalCreditos !== 0 ||
        balance.saldo !== 0,
    );
  }

  private isMovimientoVisibleEnPdf(
    mov: LedgerClientePdfData['movimientos'][number],
  ) {
    return mov.tipo !== 'AJUSTE';
  }

  private drawFooter(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const text = `Página ${i + 1} de ${range.count}`;

      doc.fontSize(7).font('Helvetica').fillColor('#6B7280');

      const textWidth = doc.widthOfString(text);

      const x = (doc.page.width - textWidth) / 2;

      /**
       * Se dibuja dentro del margen inferior,
       * pero sin usar un width que provoque
       * wrapping / salto automático.
       */
      const y = doc.page.height - 20;

      doc.text(text, x, y, {
        lineBreak: false,
      });
    }
  }

  private getReferencia(mov: LedgerClientePdfData['movimientos'][number]) {
    if (mov.operacion) {
      return mov.operacion.codigo;
    }

    if (mov.entrada?.referencia) {
      return mov.entrada.referencia;
    }

    return '-';
  }

  private getTipoVisual(mov: LedgerClientePdfData['movimientos'][number]) {
    if (mov.tipo === 'CANCELACION') {
      return 'CANCELACIÓN';
    }
    if (mov.operacion) {
      if (mov.operacion.tipo === 'VENTA') {
        return 'VENTA';
      }

      if (mov.operacion.tipo === 'COMPRA') {
        return 'COMPRA';
      }

      if (mov.operacion.tipo === 'OPERACION_DIRECTA') {
        return 'OP. DIRECTA';
      }

      return mov.operacion.tipo;
    }

    if (mov.entrada) {
      if (mov.entrada.tipo === 'ABONO_CUENTA_PROPIA') {
        return 'ABONO CP';
      }

      if (mov.entrada.tipo === 'ABONO_DIRECTO_PROVEEDOR') {
        return 'ABONO DIRECTO PRO';
      }

      return mov.entrada.tipo;
    }

    if (mov.salida) {
      if (mov.salida.tipo === 'PAGO_ACREEDOR') {
        return 'PAGO';
      }

      if (mov.salida.tipo === 'GASTO') {
        return 'GASTO';
      }

      if (mov.salida.tipo === 'RETIRO') {
        return 'RETIRO';
      }

      return mov.salida.tipo;
    }

    if (mov.tipo === 'ABONO_DIRECTO') {
      return 'ABONO DIRECTO';
    }

    if (mov.tipo === 'ABONO') {
      return 'ABONO';
    }

    if (mov.tipo === 'PAGO') {
      return 'PAGO';
    }

    return mov.tipo;
  }

  private getTipoColor(tipo: string) {
    return TIPO_COLORS[tipo] ?? '#FFFFFF';
  }

  private getSaldoColor(saldo: number) {
    if (saldo > 0) {
      return '#BBF7D0'; // green-200 | el cliente me debe
    }

    if (saldo < 0) {
      return '#FECACA'; // red-200 | yo le debo al cliente
    }

    return '#E5E7EB'; // gray-200 | saldado
  }

  private unirConceptoConNotas(concepto: string, notas?: string | null) {
    if (!notas) {
      return concepto;
    }

    return `${concepto} - ${notas}`;
  }

  private getConceptoCliente(mov: LedgerClientePdfData['movimientos'][number]) {
    if (mov.operacion) {
      let concepto = '';
      if (mov.tipo === 'CANCELACION') {
        return mov.descripcion ?? 'Cancelación de movimiento';
      }

      if (mov.operacion.tipo === 'VENTA') {
        concepto = mov.operacion.destinatario
          ? `Venta a ${mov.operacion.destinatario}`
          : mov.operacion.nombre;
      } else if (mov.operacion.tipo === 'OPERACION_DIRECTA') {
        concepto = 'Operación directa';
      } else if (mov.operacion.tipo === 'COMPRA') {
        concepto = 'Compra / saldo a favor';
      } else {
        concepto = mov.operacion.nombre;
      }

      return this.unirConceptoConNotas(concepto, mov.operacion.notas);
    }

    if (mov.entrada) {
      let concepto = '';

      if (mov.entrada.tipo === 'ABONO_CUENTA_PROPIA') {
        concepto = 'Abono recibido';
      } else if (mov.entrada.tipo === 'ABONO_DIRECTO_PROVEEDOR') {
        concepto = 'Abono directo a tercero';
      } else {
        concepto = mov.entrada.descripcion ?? mov.entrada.tipo;
      }

      return this.unirConceptoConNotas(concepto, mov.entrada.notas);
    }

    if (mov.salida) {
      let concepto = '';

      if (mov.salida.tipo === 'PAGO_ACREEDOR') {
        concepto = 'Pago Realizado a Proveedor';
      } else if (mov.salida.tipo === 'GASTO') {
        concepto = 'Gasto';
      } else if (mov.salida.tipo === 'RETIRO') {
        concepto = 'Retiro';
      } else {
        concepto = mov.salida.descripcion ?? mov.salida.tipo;
      }

      return this.unirConceptoConNotas(concepto, mov.salida.notas);
    }

    return this.unirConceptoConNotas(mov.descripcion ?? mov.tipo, null);
  }

  private formatTasa(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return '-';
    }

    return this.decimal(numberValue);
  }

  private getCalculoVisible(mov: LedgerClientePdfData['movimientos'][number]) {
    if (!mov.operacion) {
      if (mov.entrada) {
        return this.getTasaEntradaVisible(mov.entrada);
      }

      if (mov.salida) {
        return this.getTasaSalidaVisible(mov.salida);
      }

      return '-';
    }

    const metodo = this.normalizarMetodoCalculo(mov.operacion.metodoCalculo);

    if (metodo === 'PORCENTAJE') {
      const porcentaje = Number(mov.operacion.porcentaje ?? 0);

      if (!Number.isFinite(porcentaje)) {
        return '-';
      }

      const signo =
        mov.operacion.aplicacionPorcentaje === 'DESCONTAR' ? '-' : '+';

      return `${signo}${this.decimal(porcentaje)}%`;
    }

    /**
     * Para TASA se conserva exactamente el criterio anterior:
     * VENTA -> tasaVenta
     * COMPRA -> tasaCompra
     * DIRECTA -> depende de si el cliente es deudor o acreedor.
     */
    const tipoOperacion = mov.operacion.tipo;
    const debito = this.getDebitoMovimiento(mov);
    const credito = this.getCreditoMovimiento(mov);

    if (tipoOperacion === 'VENTA') {
      return this.formatTasa(mov.operacion.tasaVenta);
    }

    if (tipoOperacion === 'COMPRA') {
      return this.formatTasa(mov.operacion.tasaCompra);
    }

    if (tipoOperacion === 'OPERACION_DIRECTA') {
      if (debito > 0) {
        return this.formatTasa(mov.operacion.tasaVenta);
      }

      if (credito > 0) {
        return this.formatTasa(mov.operacion.tasaCompra);
      }
    }

    return '-';
  }

  private getTasaEntradaVisible(entrada: MovimientoConversionPdf) {
    const tasaDesdeMontos = this.calcularTasaComercialVisible(entrada);

    if (tasaDesdeMontos !== null) {
      return this.formatTasa(tasaDesdeMontos);
    }

    const tasaDesdeGuardada =
      this.getTasaEntradaVisibleDesdeTasaGuardada(entrada);

    return tasaDesdeGuardada !== null
      ? this.formatTasa(tasaDesdeGuardada)
      : '-';
  }

  private getTasaSalidaVisible(salida: MovimientoConversionPdf) {
    const tasaDesdeMontos = this.calcularTasaComercialVisible(salida);

    if (tasaDesdeMontos !== null) {
      return this.formatTasa(tasaDesdeMontos);
    }

    const par = this.getParTasaVisible(
      salida.monedaPago,
      salida.monedaAplicacion,
    );

    if (!par) {
      return '-';
    }

    return this.formatTasa(salida.tasaConversion);
  }

  private calcularTasaComercialVisible(mov: MovimientoConversionPdf) {
    const par = this.getParTasaVisible(mov.monedaPago, mov.monedaAplicacion);

    if (!par) {
      return null;
    }

    const monedaPago = this.normalizarMoneda(mov.monedaPago);
    const monedaAplicacion = this.normalizarMoneda(mov.monedaAplicacion);
    const montoPago = this.toFinitePositiveNumber(mov.montoPago);
    const montoAplicado = this.toFinitePositiveNumber(mov.montoAplicado);

    if (
      !monedaPago ||
      !monedaAplicacion ||
      montoPago === null ||
      montoAplicado === null
    ) {
      return null;
    }

    const montoBase =
      monedaPago === par.base
        ? montoPago
        : monedaAplicacion === par.base
          ? montoAplicado
          : null;

    const montoQuote =
      monedaPago === par.quote
        ? montoPago
        : monedaAplicacion === par.quote
          ? montoAplicado
          : null;

    if (montoBase === null || montoQuote === null || montoBase <= 0) {
      return null;
    }

    const tasa = montoQuote / montoBase;

    return Number.isFinite(tasa) && tasa > 0 ? tasa : null;
  }

  private getTasaEntradaVisibleDesdeTasaGuardada(
    entrada: MovimientoConversionPdf,
  ) {
    const par = this.getParTasaVisible(
      entrada.monedaPago,
      entrada.monedaAplicacion,
    );

    if (!par) {
      return null;
    }

    const monedaPago = this.normalizarMoneda(entrada.monedaPago);
    const monedaAplicacion = this.normalizarMoneda(entrada.monedaAplicacion);
    const tasaGuardada = this.toFinitePositiveNumber(entrada.tasaConversion);

    if (!monedaPago || !monedaAplicacion || tasaGuardada === null) {
      return null;
    }

    /**
     * Entradas historicamente guarda:
     * 1 monedaAplicacion = tasaConversion monedaPago.
     */
    if (monedaAplicacion === par.base && monedaPago === par.quote) {
      return tasaGuardada;
    }

    if (monedaAplicacion === par.quote && monedaPago === par.base) {
      return 1 / tasaGuardada;
    }

    return null;
  }

  private getParTasaVisible(
    monedaA?: string | null,
    monedaB?: string | null,
  ): ParTasaVisible | null {
    const a = this.normalizarMoneda(monedaA);
    const b = this.normalizarMoneda(monedaB);

    if (!a || !b || a === b) {
      return null;
    }

    if (this.esPar(a, b, 'BS', 'COP')) {
      return { base: 'BS', quote: 'COP' };
    }

    if (this.esPar(a, b, 'USD', 'BS')) {
      return { base: 'USD', quote: 'BS' };
    }

    if (this.esPar(a, b, 'USD', 'COP')) {
      return { base: 'USD', quote: 'COP' };
    }

    return null;
  }

  private esPar(monedaA: string, monedaB: string, base: string, quote: string) {
    return (
      (monedaA === base && monedaB === quote) ||
      (monedaA === quote && monedaB === base)
    );
  }

  private normalizarMoneda(value?: string | null) {
    return value?.trim().toUpperCase() || null;
  }

  private toFinitePositiveNumber(value: unknown) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) && numberValue > 0
      ? numberValue
      : null;
  }

  private getDebitoMovimiento(
    mov: LedgerClientePdfData['movimientos'][number],
  ) {
    const multimoneda = Number(mov.debito);

    if (Number.isFinite(multimoneda)) {
      return multimoneda;
    }

    const legado = Number(mov.debitoCop ?? 0);

    return Number.isFinite(legado) ? legado : 0;
  }

  private getCreditoMovimiento(
    mov: LedgerClientePdfData['movimientos'][number],
  ) {
    const multimoneda = Number(mov.credito);

    if (Number.isFinite(multimoneda)) {
      return multimoneda;
    }

    const legado = Number(mov.creditoCop ?? 0);

    return Number.isFinite(legado) ? legado : 0;
  }

  private normalizarMetodoCalculo(
    value?: string | null,
  ): 'TASA' | 'PORCENTAJE' | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toUpperCase();

    if (normalized === 'TASA') {
      return 'TASA';
    }

    if (normalized === 'PORCENTAJE' || normalized === 'PROMEDIO') {
      return 'PORCENTAJE';
    }

    return null;
  }

  private getMetodoFiltroTexto(value?: string | null) {
    const metodo = this.normalizarMetodoCalculo(value);

    if (metodo === 'TASA') {
      return 'Tasa';
    }

    if (metodo === 'PORCENTAJE') {
      return 'Porcentaje';
    }

    return 'Todos';
  }

  //   private getTasaCompra(mov: LedgerClientePdfData['movimientos'][number]) {
  //   if (!mov.operacion) {
  //     return '-';
  //   }

  //   if (mov.operacion.tipo === 'VENTA') {
  //     return '-';
  //   }

  //   if (mov.operacion.tipo === 'OPERACION_DIRECTA') {
  //     return '-';
  //   }

  //   if (
  //     mov.operacion.tasaCompra === null ||
  //     mov.operacion.tasaCompra === undefined
  //   ) {
  //     return '-';
  //   }

  //   return this.decimal(Number(mov.operacion.tasaCompra));
  // }

  //   private getTasaVenta(mov: LedgerClientePdfData['movimientos'][number]) {
  //     if (!mov.operacion) {
  //       return '-';
  //     }

  //     if (mov.operacion.tipo === 'COMPRA') {
  //       return '-';
  //     }

  //     if (mov.operacion.tasaVenta === null || mov.operacion.tasaVenta === undefined) {
  //       return '-';
  //     }

  //     return this.decimal(Number(mov.operacion.tasaVenta));
  //   }

  private formatDateShort(value: Date | string, timeZone: string) {
    const date = new Date(value);

    return date.toLocaleDateString('es-CO', {
      timeZone,
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private formatDateTime(value: Date | string, timeZone?: string) {
    const date = new Date(value);

    return date.toLocaleString('es-CO', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private money(value: number) {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private decimal(value: number) {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }).format(value);
  }

  private drawLine(doc: PDFKit.PDFDocument) {
    doc.moveTo(30, doc.y).lineTo(790, doc.y).stroke();
    doc.moveDown(0.6);
  }
}
