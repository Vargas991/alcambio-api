import {
  IsNotEmpty,
  IsNumber,
  IsString,
} from 'class-validator';

export class AjustarSaldoClienteDto {
  @IsNumber()
  saldoObjetivoCop: number;

  @IsString()
  @IsNotEmpty()
  motivo: string;
}