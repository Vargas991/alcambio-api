import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

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
    moneda: string | null;
  };
  resumen: {
    totalDebitosCop: number;
    totalCreditosCop: number;
    saldoFiltradoCop: number;
    estado: string;

    totalDebitosGlobalCop?: number;
    totalCreditosGlobalCop?: number;
    saldoTotalCop?: number;
    estadoTotal?: string;

    totalUtilidadRealCop?: number;
    utilidadPorDia?: {
      fecha: string;
      utilidadCop: number;
    }[];
  };

  movimientos: Array<{
    id: string;
    tipo: string;
    monedaTransaccion?: string | null;
    montoTransaccion?: unknown;
    debitoCop: unknown;
    creditoCop: unknown;
    descripcion?: string | null;
    creadoEn: Date | string;
    utilidadRealCop?: number;
    saldoAcumuladoCop?: number;
    operacion?: {
      codigo: string;
      nombre: string;
      tipo: string;
      tasaCompra?: unknown;
      tasaVenta?: unknown;
      utilidadCop?: unknown;
      destinatario?: string | null;
      notas?: string | null;
    } | null;
    entrada?: {
      tipo: string;
      referencia?: string | null;
      descripcion?: string | null;
      notas?: string | null;
    } | null;
    salida?: {
      tipo: string;
      referencia?: string | null;
      descripcion?: string | null;
      notas?: string | null;
      montoCop?: unknown;
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

@Injectable()
export class ClienteLedgerPdfService {
  async generate(ledger: LedgerClientePdfData): Promise<Buffer> {
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

      this.drawHeader(doc, ledger);
      this.drawResumen(doc, ledger);
      this.drawMovimientos(doc, ledger);
      this.drawFooter(doc);

      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, ledger: LedgerClientePdfData) {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Estado de Cuenta del Cliente', 30, 25, {
        align: 'center',
      });

    doc.moveDown(0.4);

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Generado: ${this.formatDateTime(new Date())}`, {
        align: 'center',
      });

    doc.moveDown(0.8);

    const yCliente = doc.y;

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Cliente:', 30, yCliente, { continued: true })
      .font('Helvetica')
      .text(` ${ledger.cliente.nombre}`, { continued: true })
      .font('Helvetica-Bold')
      .text('   Documento:', { continued: true })
      .font('Helvetica')
      .text(` ${ledger.cliente.documento ?? 'N/A'}`, { continued: true })
      .font('Helvetica-Bold')
      .text('   Teléfono:', { continued: true })
      .font('Helvetica')
      .text(` ${ledger.cliente.telefono ?? 'N/A'}`, { continued: true })
      .font('Helvetica-Bold')
      .text('   Estado:', { continued: true })
      .font('Helvetica')
      .text(` ${ledger.cliente.estado}`);

    doc.moveDown(0.4);

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Desde:', 30, doc.y, { continued: true })
      .font('Helvetica')
      .text(` ${ledger.filtros.desde ?? 'Sin filtro'}`, { continued: true })
      .font('Helvetica-Bold')
      .text('   Hasta:', { continued: true })
      .font('Helvetica')
      .text(` ${ledger.filtros.hasta ?? 'Sin filtro'}`, { continued: true })
      .font('Helvetica-Bold')
      .text('   Tipo:', { continued: true })
      .font('Helvetica')
      .text(` ${ledger.filtros.tipo ?? 'Todos'}`, { continued: true })
      .font('Helvetica-Bold')
      .text('   Moneda:', { continued: true })
      .font('Helvetica')
      .text(` ${ledger.filtros.moneda ?? 'Todas'}`);

    doc.moveDown(0.7);

    this.drawLine(doc);
  }

  private getSaldoPeriodoTexto(saldo: number) {
    if (saldo > 0) {
      return `Saldo del período: ${this.money(saldo)} COP por cobrar`;
    }

    if (saldo < 0) {
      return `Saldo del período: ${this.money(Math.abs(saldo))} COP a favor`;
    }

    return 'Saldo del período: saldado';
  }

  private drawResumen(doc: PDFKit.PDFDocument, ledger: LedgerClientePdfData) {
    const { resumen } = ledger;

    const saldoPeriodoTexto = this.getSaldoPeriodoTexto(
      resumen.saldoFiltradoCop,
    );

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Resumen del período:', 30, doc.y, { continued: true })
      .font('Helvetica')
      .text(` Débitos: ${this.money(resumen.totalDebitosCop)} COP`, {
        continued: true,
      })
      .text(`   Abonos: ${this.money(resumen.totalCreditosCop)} COP`, {
        continued: true,
      })
      .font('Helvetica-Bold')
      .text(`   ${saldoPeriodoTexto}`);

    doc.moveDown(0.8);
  }

  private drawMovimientos(
    doc: PDFKit.PDFDocument,
    ledger: LedgerClientePdfData,
  ) {
    const columns: TableColumn[] = [
      { title: 'Fecha', x: 30, width: 70, align: 'left' },
      { title: 'Tipo', x: 100, width: 90, align: 'center' },
      { title: 'Concepto', x: 190, width: 260, align: 'left' },
      { title: 'Monto', x: 450, width: 80, align: 'right' },
      { title: 'Tasa', x: 530, width: 65, align: 'right' },
      { title: 'Debe COP', x: 595, width: 70, align: 'right' },
      { title: 'Abono COP', x: 665, width: 75, align: 'right' },
      { title: 'Saldo COP', x: 740, width: 50, align: 'right' },
    ];

    let y = doc.y;

    this.drawTableHeader(doc, y, columns);
    y += 22;

    const movimientosAsc = [...ledger.movimientos].sort(
      (a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
    );

    let totalMonto = 0;
    let totalDebitos = 0;
    let totalCreditos = 0;
    let ultimoSaldo = 0;

    for (const mov of movimientosAsc) {
      if (y > 520) {
        doc.addPage();
        y = 35;
        this.drawTableHeader(doc, y, columns);
        y += 22;
      }

      const monto = Number(mov.montoTransaccion ?? 0);
      const debito = Number(mov.debitoCop ?? 0);
      const credito = Number(mov.creditoCop ?? 0);
      const saldo = Number(mov.saldoAcumuladoCop ?? 0);

      totalMonto += monto;
      totalDebitos += debito;
      totalCreditos += credito;
      ultimoSaldo = saldo;

      const tipoVisual = this.getTipoVisual(mov);
      const tipoColor = this.getTipoColor(tipoVisual);
      const saldoColor = this.getSaldoColor(saldo);

      const row = {
        fecha: this.formatDateShort(mov.creadoEn),
        // referencia: this.getReferencia(mov),
        tipo: tipoVisual,
        concepto: this.getConceptoCliente(mov),
        // moneda: mov.monedaTransaccion ?? '-',
        monto: `${mov.monedaTransaccion} ${this.money(monto)}`,
        tasa: this.getTasaVisible(mov),
        debito: this.money(debito),
        credito: this.money(credito),
        saldo: this.money(saldo),
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
          row.tasa,
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

    this.drawTotalsRow(doc, y, columns, {
      totalMonto,
      totalDebitos,
      totalCreditos,
      saldoPeriodo: ledger.resumen.saldoFiltradoCop,
      saldoTotalReal: ledger.resumen.saldoTotalCop,
    });
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

      // Columna Saldo COP
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
      totalMonto: number;
      totalDebitos: number;
      totalCreditos: number;
      saldoPeriodo: number;
      saldoTotalReal?: number;
    },
  ) {
    const height = 22;

    const labelX = columns[0].x;
    const labelWidth = columns[0].width + columns[1].width + columns[2].width;

    const drawMergedLabelCell = (
      yPosition: number,
      label: string,
      backgroundColor: string,
    ) => {
      doc
        .save()
        .fillColor(backgroundColor)
        .rect(labelX, yPosition, labelWidth, height)
        .fill()
        .restore();

      doc.rect(labelX, yPosition, labelWidth, height).stroke();

      doc
        .fontSize(7.5)
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
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(value, column.x + 3, yPosition + 7, {
          width: column.width - 6,
          align: column.align,
        });
    };

    /**
     * Fila 1: Totales del período
     */
    drawMergedLabelCell(y, 'TOTALES DEL PERÍODO', '#F3F4F6');

    drawCell(3, y, '-', '#F3F4F6');
    drawCell(4, y, '', '#F3F4F6');
    drawCell(5, y, this.money(totals.totalDebitos), '#F3F4F6');
    drawCell(6, y, this.money(totals.totalCreditos), '#F3F4F6');
    drawCell(7, y, this.money(totals.saldoPeriodo), '#F3F4F6');

    /**
     * Fila 2: Saldo total real
     */
    const saldoTotalReal =
      totals.saldoTotalReal === undefined
        ? totals.saldoPeriodo
        : totals.saldoTotalReal;

    const ySaldoReal = y + height;

    drawMergedLabelCell(ySaldoReal, 'SALDO TOTAL REAL', '#E5E7EB');

    drawCell(3, ySaldoReal, '', '#E5E7EB');
    drawCell(4, ySaldoReal, '', '#E5E7EB');
    drawCell(5, ySaldoReal, '', '#E5E7EB');
    drawCell(6, ySaldoReal, '', '#E5E7EB');
    drawCell(
      7,
      ySaldoReal,
      this.money(saldoTotalReal),
      this.getSaldoColor(saldoTotalReal),
    );

    doc.fillColor('#000000');
  }

  private drawFooter(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      doc
        .fontSize(7)
        .font('Helvetica')
        .text(`Página ${i + 1} de ${range.count}`, 30, doc.page.height - 25, {
          align: 'center',
          width: doc.page.width - 60,
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
        return 'DIRECTA';
      }

      return mov.operacion.tipo;
    }

    if (mov.entrada) {
      if (mov.entrada.tipo === 'ABONO_CUENTA_PROPIA') {
        return 'ABONO';
      }

      if (mov.entrada.tipo === 'ABONO_DIRECTO_PROVEEDOR') {
        return 'ABONO DIRECTO';
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
        concepto = 'Pago recibido';
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

  private getTasaVisible(mov: LedgerClientePdfData['movimientos'][number]) {
    if (!mov.operacion) {
      return '-';
    }

    const tipoOperacion = mov.operacion.tipo;
    const debito = Number(mov.debitoCop ?? 0);
    const credito = Number(mov.creditoCop ?? 0);

    if (tipoOperacion === 'VENTA') {
      return this.formatTasa(mov.operacion.tasaVenta);
    }

    if (tipoOperacion === 'COMPRA') {
      return this.formatTasa(mov.operacion.tasaCompra);
    }

    if (tipoOperacion === 'OPERACION_DIRECTA') {
      /**
       * En operación directa:
       *
       * - Si el movimiento está en Debe COP, el cliente es deudor.
       *   Se muestra tasaVenta.
       *
       * - Si el movimiento está en Abono COP, el cliente es acreedor.
       *   Se muestra tasaCompra.
       */
      if (debito > 0) {
        return this.formatTasa(mov.operacion.tasaVenta);
      }

      if (credito > 0) {
        return this.formatTasa(mov.operacion.tasaCompra);
      }

      return '-';
    }

    return '-';
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

  private formatDateShort(value: Date | string) {
    const date = new Date(value);

    return date.toLocaleDateString('es-CO', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private formatDateTime(value: Date | string) {
    const date = new Date(value);

    return date.toLocaleString('es-CO', {
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
