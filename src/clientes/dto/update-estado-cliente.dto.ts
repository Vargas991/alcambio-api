import { IsEnum } from 'class-validator';
import { EstadoEntidad } from '../../../generated/prisma/client';

export class UpdateEstadoClienteDto {
  @IsEnum(EstadoEntidad)
  estado!: EstadoEntidad;
}