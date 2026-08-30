import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { RolUsuario } from '../../../generated/prisma/client';

export class CreateTenantUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsEmail()
  correo!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(RolUsuario)
  rol!: RolUsuario;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
