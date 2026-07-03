import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

import { Moneda, TipoOperacion } from '../../../generated/prisma/client';

export class CreateOperacionDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsEnum(TipoOperacion)
  tipo!: TipoOperacion;

  @ValidateIf(
    (dto) =>
      dto.tipo === TipoOperacion.VENTA ||
      dto.tipo === TipoOperacion.OPERACION_DIRECTA,
  )
  @IsString()
  @IsNotEmpty()
  deudorId?: string;

  @ValidateIf(
    (dto) =>
      dto.tipo === TipoOperacion.COMPRA ||
      dto.tipo === TipoOperacion.OPERACION_DIRECTA,
  )
  @IsString()
  @IsNotEmpty()
  acreedorId?: string;

  @ValidateIf(
    (dto) =>
      dto.tipo === TipoOperacion.VENTA ||
      dto.tipo === TipoOperacion.COMPRA,
  )
  @IsString()
  @IsNotEmpty()
  cuentaOperativaId?: string;

  @IsEnum(Moneda)
  monedaTransaccion!: Moneda;

  @IsNumber()
  @Min(1)
  montoTransaccion!: number;

  @IsNumber()
  @Min(0.000001)
  tasaCompra!: number;

  @IsNumber()
  @Min(0.000001)
  tasaVenta!: number;

  @IsOptional()
  @IsString()
  destinatario?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}