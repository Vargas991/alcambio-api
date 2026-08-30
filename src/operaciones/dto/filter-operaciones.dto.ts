import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  EstadoOperacion,
  Moneda,
  TipoOperacion,
} from '../../../generated/prisma/client';

export class FilterOperacionesDto {
  @IsOptional()
  @IsEnum(TipoOperacion)
  tipo?: TipoOperacion;

  @IsOptional()
  @IsEnum(EstadoOperacion)
  estado?: EstadoOperacion;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional()
  @IsString()
  deudorId?: string;

  @IsOptional()
  @IsString()
  acreedorId?: string;

  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  cuentaOperativaId?: string;

  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;

  @IsOptional()
  @IsString()
  buscar?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
