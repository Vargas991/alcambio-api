import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { Moneda, TipoMovimientoCliente } from '../../../generated/prisma/client';

export class FilterClienteLedgerDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsEnum(TipoMovimientoCliente)
  tipo?: TipoMovimientoCliente;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;
}