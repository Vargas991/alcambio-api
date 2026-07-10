import {
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

  @IsNumber()
  @Min(1)
  montoCop!: number;

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