import { IsNotEmpty, IsString } from 'class-validator';

export class CancelarOperacionDto {
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}