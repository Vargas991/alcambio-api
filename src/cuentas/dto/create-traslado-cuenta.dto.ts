import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTrasladoCuentaDto {
  @IsString()
  @IsNotEmpty()
  cuentaOrigenId!: string;

  @IsString()
  @IsNotEmpty()
  cuentaDestinoId!: string;

  @IsNumber()
  @Min(1)
  monto!: number;

  @IsString()
  @IsNotEmpty()
  descripcion!: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}