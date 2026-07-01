import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { EstadoEntidad, RolUsuario } from 'generated/prisma/enums';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService {

  constructor(private readonly prisma: PrismaService){}

  async create(dto: CreateUsuarioDto) {
    const existe = await this.prisma.usuario.findUnique({
      where: { correo: dto.correo },
    });

    if (existe) {
      throw new Error('El usuario ya existe');
    }

    const passwordHash = await bcrypt.hash(dto.password,10);
    
    const usuario = await this.prisma.usuario.create({
      data: {
        nombre: dto.nombre,
        correo: dto.correo,
        password: passwordHash,
        rol: dto.rol || RolUsuario.OPERADOR,
        estado: EstadoEntidad.ACTIVO, // Asignar rol por defecto si no se proporciona 
      },
      select : {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        estado: true,
        creadoEn: true,
      },
    })
    
    return usuario;
  }

  findAll() {
    return this.prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        estado: true,
        creadoEn: true,
      },
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  findByCorreo(correo: string) {
    return this.prisma.usuario.findUnique({
      where: { correo },
    });
  }

  findById(id: string) {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        estado: true,
        creadoEn: true,
      },
    });
  }


}
