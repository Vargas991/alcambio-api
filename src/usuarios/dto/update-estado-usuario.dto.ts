import { IsEnum } from 'class-validator';
import { EstadoEntidad } from '../../../generated/prisma/client';

export class UpdateEstadoUsuarioDto {
  @IsEnum(EstadoEntidad)
  estado!: EstadoEntidad;
}