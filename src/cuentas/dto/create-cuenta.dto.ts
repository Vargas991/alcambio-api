import {
  CategoriaCuenta,
  Moneda,
  TipoCuenta,
} from '../../../generated/prisma/client';

import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCuentaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsEnum(Moneda)
  moneda!: Moneda;

  @IsEnum(CategoriaCuenta)
  categoria!: CategoriaCuenta;

  @IsEnum(TipoCuenta)
  tipo! : TipoCuenta;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saldoInicial?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsBoolean()
  aplica4x1000?: boolean;
}