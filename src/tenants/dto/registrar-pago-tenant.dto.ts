import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { Moneda } from '../../../generated/prisma/client';

export class RegistrarPagoTenantDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monto!: number;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @IsOptional()
  @IsDateString()
  fechaRenovacion?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referencia?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notas?: string;
}
