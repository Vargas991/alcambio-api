import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { successResponse } from 'src/common/responses/api-responses';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const data =  await this.authService.login(dto);
    return successResponse(data, 'Inicio de sesión exitoso.');
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() usuario: unknown) {
    return successResponse(usuario, 'Información del usuario obtenida correctamente.');
  }
}