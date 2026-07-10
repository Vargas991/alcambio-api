import { IsOptional, IsString } from 'class-validator';

export class FilterClientesCarteraDto {
  @IsOptional()
  @IsString()
  buscar?: string;
}