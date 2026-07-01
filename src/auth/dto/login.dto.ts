import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  correo!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}