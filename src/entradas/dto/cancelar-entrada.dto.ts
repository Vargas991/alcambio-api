import { IsNotEmpty, IsString } from 'class-validator';

export class CancelarEntradaDto {
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}