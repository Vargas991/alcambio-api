import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';
import { EstadoEntidad } from '../../generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const usuario = await this.usuariosService.findByCorreo(dto.correo);

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (usuario.estado !== EstadoEntidad.ACTIVO) {
      throw new UnauthorizedException('Usuario inactivo.');
    }

    const passwordValido = await bcrypt.compare(dto.password, usuario.password);

    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const payload = {
      sub: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    console.log(accessToken);

    return {
      accessToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        estado: usuario.estado,
      },
    };
  }
}