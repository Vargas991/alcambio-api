import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import {
  EstadoEntidad,
  RolUsuario,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateEstadoUsuarioDto } from './dto/update-estado-usuario.dto';
import { UpdatePasswordUsuarioDto } from './dto/update-password-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUsuarioDto) {
    const existe = await this.prisma.usuario.findUnique({
      where: {
        correo: dto.correo,
      },
    });

    if (existe) {
      throw new BadRequestException('Ya existe un usuario con ese correo.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.usuario.create({
      data: {
        nombre: dto.nombre,
        correo: dto.correo,
        password: passwordHash,
        rol: dto.rol ?? RolUsuario.OPERADOR,
        estado: EstadoEntidad.ACTIVO,
      },
      select: this.usuarioSelect(),
    });
  }

  async findAll() {
    return this.prisma.usuario.findMany({
      select: this.usuarioSelect(),
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: {
        id,
      },
      select: this.usuarioSelect(),
    });

    if (!usuario) {
      throw new NotFoundException('El usuario no existe.');
    }

    return usuario;
  }

  async update(id: string, dto: UpdateUsuarioDto) {
    await this.validarUsuarioExiste(id);

    if (dto.correo) {
      const usuarioConCorreo = await this.prisma.usuario.findUnique({
        where: {
          correo: dto.correo,
        },
      });

      if (usuarioConCorreo && usuarioConCorreo.id !== id) {
        throw new BadRequestException('Ya existe otro usuario con ese correo.');
      }
    }

    return this.prisma.usuario.update({
      where: {
        id,
      },
      data: {
        nombre: dto.nombre,
        correo: dto.correo,
        rol: dto.rol,
      },
      select: this.usuarioSelect(),
    });
  }

  async updateEstado(id: string, dto: UpdateEstadoUsuarioDto) {
    await this.validarUsuarioExiste(id);

    return this.prisma.usuario.update({
      where: {
        id,
      },
      data: {
        estado: dto.estado,
      },
      select: this.usuarioSelect(),
    });
  }

  async updatePassword(id: string, dto: UpdatePasswordUsuarioDto) {
    await this.validarUsuarioExiste(id);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.usuario.update({
      where: {
        id,
      },
      data: {
        password: passwordHash,
      },
      select: this.usuarioSelect(),
    });
  }

  async remove(id: string) {
    await this.validarUsuarioExiste(id);

    return this.prisma.usuario.update({
      where: {
        id,
      },
      data: {
        estado: EstadoEntidad.INACTIVO,
      },
      select: this.usuarioSelect(),
    });
  }

  /**
   * Este método sí devuelve password.
   * Lo usa AuthService para validar login.
   */
  async findByCorreo(correo: string) {
    return this.prisma.usuario.findUnique({
      where: {
        correo,
      },
    });
  }

  /**
   * Este método lo usa JwtStrategy.
   * No debe devolver password.
   */
  async findById(id: string) {
    return this.prisma.usuario.findUnique({
      where: {
        id,
      },
      select: this.usuarioSelect(),
    });
  }

  private async validarUsuarioExiste(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('El usuario no existe.');
    }

    return usuario;
  }

  private usuarioSelect() {
    return {
      id: true,
      nombre: true,
      correo: true,
      rol: true,
      estado: true,
      creadoEn: true,
      actualizadoEn: true,
    };
  }
}