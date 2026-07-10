import { IsNotEmpty, IsString } from 'class-validator';

export class CancelarSalidaDto {
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}