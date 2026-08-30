import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsuariosService } from '../../usuarios/usuarios.service';
import { EstadoEntidad } from '../../../generated/prisma/client';

export interface JwtPayload {
  sub: string;
  correo: string;
  rol: string;
  tenantId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usuariosService: UsuariosService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET no está definido en .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const usuario = await this.usuariosService.findById(payload.sub);

    if (!usuario || usuario.estado !== EstadoEntidad.ACTIVO) {
      throw new UnauthorizedException('Usuario no autorizado.');
    }

    if (usuario.tenant && !usuario.tenant.activo) {
      throw new UnauthorizedException('Tenant inactivo.');
    }

    if (usuario.rol !== 'SUPER_ADMIN' && !usuario.tenantId) {
      throw new UnauthorizedException('Usuario sin tenant asignado.');
    }

    return usuario;
  }
}
