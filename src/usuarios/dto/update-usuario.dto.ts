import { IsEmail, IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { RolUsuario } from '../../../generated/prisma/client';

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @IsOptional()
  @IsEnum(RolUsuario)
  rol?: RolUsuario;
}