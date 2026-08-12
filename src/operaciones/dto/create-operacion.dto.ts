import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  AplicacionPorcentaje,
  MetodoCalculoOperacion,
  Moneda,
  TipoOperacion,
} from '../../../generated/prisma/client';

export class CreateOperacionDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsEnum(TipoOperacion)
  tipo!: TipoOperacion;

  @ValidateIf(
    (dto: CreateOperacionDto) =>
      dto.tipo === TipoOperacion.VENTA ||
      dto.tipo === TipoOperacion.OPERACION_DIRECTA,
  )
  @IsString()
  @IsNotEmpty()
  deudorId?: string;

  @ValidateIf(
    (dto: CreateOperacionDto) =>
      dto.tipo === TipoOperacion.COMPRA ||
      dto.tipo === TipoOperacion.OPERACION_DIRECTA,
  )
  @IsString()
  @IsNotEmpty()
  acreedorId?: string;

  @ValidateIf(
    (dto: CreateOperacionDto) =>
      dto.tipo === TipoOperacion.VENTA || dto.tipo === TipoOperacion.COMPRA,
  )
  @IsString()
  @IsNotEmpty()
  cuentaOperativaId?: string;

  @IsEnum(Moneda)
  monedaTransaccion!: Moneda;

  @IsNumber()
  @Min(0.000001)
  montoTransaccion!: number;

  /**
   * Se mantiene opcional para aceptar solicitudes del frontend anterior.
   * Cuando no venga, el servicio debe interpretarlo como TASA.
   */
  @IsOptional()
  @IsEnum(MetodoCalculoOperacion)
  metodoCalculo?: MetodoCalculoOperacion;

  /**
   * Obligatoria para el flujo actual por tasa.
   * También será obligatoria cuando metodoCalculo no venga indicado,
   * porque ese caso se considera TASA por compatibilidad.
   */
  @ValidateIf(
    (dto: CreateOperacionDto) =>
      !dto.metodoCalculo || dto.metodoCalculo === MetodoCalculoOperacion.TASA,
  )
  @IsNumber()
  @Min(0.000001)
  tasaCompra?: number;

  @ValidateIf(
    (dto: CreateOperacionDto) =>
      !dto.metodoCalculo || dto.metodoCalculo === MetodoCalculoOperacion.TASA,
  )
  @IsNumber()
  @Min(0.000001)
  tasaVenta?: number;

  /**
   * Obligatorio únicamente para operaciones por porcentaje.
   */
  @ValidateIf(
    (dto: CreateOperacionDto) =>
      dto.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE,
  )
  @IsNumber()
  @Min(0.0001)
  @Max(100)
  porcentaje?: number;

  /**
   * Define si el porcentaje se suma o se descuenta.
   */
  @ValidateIf(
    (dto: CreateOperacionDto) =>
      dto.metodoCalculo === MetodoCalculoOperacion.PORCENTAJE,
  )
  @IsEnum(AplicacionPorcentaje)
  aplicacionPorcentaje?: AplicacionPorcentaje;

  /**
   * Moneda en la que se generará la deuda.
   *
   * Cuando no venga:
   * - el servicio mantendrá COP para solicitudes antiguas por tasa;
   * - para porcentaje podrá utilizar la moneda base configurada.
   */
  @IsOptional()
  @IsEnum(Moneda)
  monedaDeuda?: Moneda;

  /**
   * Se utiliza cuando hace falta convertir entre la moneda de
   * transacción y la moneda en la que se registrará la deuda.
   *
   * Convención:
   * unidades de monedaTransaccion por 1 unidad de monedaDeuda.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  tasaConversionBase?: number;

  @IsOptional()
  @IsString()
  destinatario?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
