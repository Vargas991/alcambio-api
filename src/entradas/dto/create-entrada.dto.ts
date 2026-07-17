import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { TipoEntrada } from '../../../generated/prisma/client';

export class CreateEntradaDto {
  @IsEnum(TipoEntrada)
  tipo!: TipoEntrada;

  @IsString()
  @IsNotEmpty()
  deudorId!: string;

  @ValidateIf((dto) => dto.tipo === TipoEntrada.ABONO_DIRECTO_PROVEEDOR)
  @IsString()
  @IsNotEmpty()
  acreedorId?: string;

  @ValidateIf((dto) => dto.tipo === TipoEntrada.ABONO_CUENTA_PROPIA)
  @IsString()
  @IsNotEmpty()
  cuentaId?: string;

  @IsNumber()
  @Min(1)
  montoCop!: number;

  @IsOptional()
  @IsBoolean()
  proveedorCobra4x1000?: boolean;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}