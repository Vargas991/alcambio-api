import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class AjustarSaldoCuentaDto {
  @IsNumber()
  @Min(0)
  saldoReal!: number;

  @IsString()
  @IsNotEmpty()
  descripcion!: string;
}