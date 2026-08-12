import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

import { Moneda, TipoEntrada } from '../../../generated/prisma/client';

export class CreateEntradaDto {
  @IsEnum(TipoEntrada)
  tipo!: TipoEntrada;

  @IsString()
  @IsNotEmpty()
  deudorId!: string;

  @ValidateIf(
    (dto: CreateEntradaDto) => dto.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR,
  )
  @IsString()
  @IsNotEmpty()
  acreedorId?: string;

  @ValidateIf(
    (dto: CreateEntradaDto) => dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA,
  )
  @IsString()
  @IsNotEmpty()
  cuentaId?: string;

  /**
   * Moneda en la que el cliente entrega el dinero.
   */
  @IsEnum(Moneda)
  monedaPago!: Moneda;

  /**
   * Monto realmente recibido.
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  montoPago!: number;

  /**
   * Moneda de la deuda que se desea disminuir.
   */
  @IsEnum(Moneda)
  monedaAplicacion!: Moneda;

  /**
   * Convención:
   * 1 monedaAplicacion =
   * tasaConversion monedaPago.
   *
   * Solo es obligatoria cuando las monedas
   * son diferentes.
   */
  @ValidateIf(
    (dto: CreateEntradaDto) => dto.monedaPago !== dto.monedaAplicacion,
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  tasaConversion?: number;

  /**
   * Campo legado.
   * Puede conservarse temporalmente mientras
   * se ajustan otros métodos.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montoCop?: number;

  @IsOptional()
  @IsBoolean()
  proveedorCobra4x1000?: boolean;

  @IsOptional()
  @IsBoolean()
  aplica4x1000?: boolean;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
