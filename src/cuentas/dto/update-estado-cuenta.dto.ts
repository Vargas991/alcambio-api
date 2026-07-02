import { IsEnum } from 'class-validator';
import { EstadoEntidad } from '../../../generated/prisma/client';

export class UpdateEstadoCuentaDto {
  @IsEnum(EstadoEntidad)
  estado!: EstadoEntidad;
}