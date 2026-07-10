import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}