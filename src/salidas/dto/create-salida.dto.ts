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

import { Moneda, TipoSalida } from '../../../generated/prisma/client';

export class CreateSalidaDto {
  @IsEnum(TipoSalida)
  tipo!: TipoSalida;

  /**
   * Cuenta de donde realmente sale el dinero.
   *
   * Su moneda define monedaPago en backend.
   */
  @IsString()
  @IsNotEmpty()
  cuentaId!: string;

  /**
   * Requerido únicamente en PAGO_ACREEDOR.
   */
  @ValidateIf((dto: CreateSalidaDto) => dto.tipo === TipoSalida.PAGO_ACREEDOR)
  @IsString()
  @IsNotEmpty()
  acreedorId?: string;

  /**
   * Monto BASE expresado en la moneda
   * de la cuenta origen.
   *
   * No incluye 4x1000.
   *
   * Ej:
   * cuenta COP -> 320000
   * cuenta USD -> 100
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  montoPago!: number;

  /**
   * Moneda de la deuda que se desea reducir.
   *
   * Solo es obligatoria para PAGO_ACREEDOR.
   *
   * Para GASTO / RETIRO el backend utiliza
   * automáticamente la moneda de la cuenta.
   */
  @ValidateIf((dto: CreateSalidaDto) => dto.tipo === TipoSalida.PAGO_ACREEDOR)
  @IsEnum(Moneda)
  monedaAplicacion?: Moneda;

  /**
   * Convención interna:
   *
   * 1 monedaAplicacion =
   * tasaConversion monedaPago
   *
   * Ej:
   * deuda USD + cuenta COP
   * 1 USD = 3200 COP
   * tasaConversion = 3200
   *
   * El frontend puede mostrar otra convención
   * más natural y convertirla antes de enviar.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  tasaConversion?: number;

  /**
   * Solo tiene efecto si la cuenta origen es COP.
   */
  @IsOptional()
  @IsBoolean()
  proveedorCobra4x1000?: boolean;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  /**
   * Campo legacy.
   *
   * Se deja temporalmente para que payloads
   * antiguos no rompan ValidationPipe si usa
   * whitelist/forbidNonWhitelisted.
   *
   * El nuevo servicio NO lo utiliza.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  montoCop?: number;
}
