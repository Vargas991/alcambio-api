import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Moneda } from '../../../generated/prisma/client';

export class ActualizarConfiguracionOrganizacionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  correo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  direccion?: string | null;

  @IsOptional()
  @IsEnum(Moneda)
  monedaBase?: Moneda;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zonaHoraria?: string;
}
