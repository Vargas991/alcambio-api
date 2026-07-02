import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordUsuarioDto {
  @IsString()
  @MinLength(6)
  password!: string;
}