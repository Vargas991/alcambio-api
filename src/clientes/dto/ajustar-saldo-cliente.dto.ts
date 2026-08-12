import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

import { Moneda } from '../../../generated/prisma/client';

export class AjustarSaldoClienteDto {
  @IsEnum(Moneda)
  moneda!: Moneda;

  @Type(() => Number)
  @IsNumber()
  saldoObjetivo!: number;

  @IsString()
  @IsNotEmpty()
  motivo!: string;
}
