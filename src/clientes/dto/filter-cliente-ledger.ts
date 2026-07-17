import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { EstadoOperacion, Moneda, TipoMovimientoCliente, TipoOperacion } from '../../../generated/prisma/client';
import { Operacion } from 'generated/prisma/browser';

export class FilterClienteLedgerDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsEnum(TipoMovimientoCliente)
  tipoMov?: TipoMovimientoCliente;
  
  @IsOptional()
  @IsEnum(TipoOperacion)
  tipo?: TipoOperacion;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional()
  @IsEnum(EstadoOperacion)
  estado?: EstadoOperacion;
}