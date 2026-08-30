import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PeriodoRenovacionTenant } from '../../../generated/prisma/client';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsDateString()
  fechaActivacion?: string;

  @IsOptional()
  @IsDateString()
  fechaRenovacion?: string;

  @IsOptional()
  @IsEnum(PeriodoRenovacionTenant)
  periodoRenovacion?: PeriodoRenovacionTenant;
}
