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

import { TipoSalida } from '../../../generated/prisma/client';

export class CreateSalidaDto {
  @IsEnum(TipoSalida)
  tipo!: TipoSalida;

  @ValidateIf((dto) => dto.tipo === TipoSalida.PAGO_ACREEDOR)
  @IsString()
  @IsNotEmpty()
  acreedorId?: string;

  @IsString()
  @IsNotEmpty()
  cuentaId!: string;

  /**
   * Monto base que se quiere pagar.
   * Ejemplo: quiero pagar 1.000.000 al proveedor.
   */
  @IsNumber()
  @Min(1)
  montoCop!: number;

  /**
   * Indica si el proveedor cobra 4x1000.
   * Si true:
   * montoEnviado = montoCop + 4x1000 proveedor
   *
   * El 4x1000 de la cuenta propia NO viene aquí.
   * Se calcula según cuenta.aplica4x1000.
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
}