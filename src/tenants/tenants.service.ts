import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoEntidad,
  RolUsuario,
} from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ActualizarConfiguracionOrganizacionDto } from '../configuracion/dto/actualizar-configuracion-organizacion.dto';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { CreateTenantUsuarioDto } from './dto/create-tenant-usuario.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { RegistrarPagoTenantDto } from './dto/registrar-pago-tenant.dto';
import { UpdateTenantUsuarioDto } from './dto/update-tenant-usuario.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracionService: ConfiguracionService,
    private readonly usuariosService: UsuariosService,
  ) {}

  async create(dto: CreateTenantDto) {
    const nombre = dto.nombre.trim();
    const slug = dto.slug?.trim() || this.crearSlug(nombre);

    await this.validarSlugDisponible(slug);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          nombre,
          slug,
          activo: dto.activo ?? true,
          fechaActivacion: dto.fechaActivacion
            ? new Date(dto.fechaActivacion)
            : undefined,
          fechaRenovacion: dto.fechaRenovacion
            ? new Date(dto.fechaRenovacion)
            : undefined,
          periodoRenovacion: dto.periodoRenovacion,
        },
      });

      await tx.configuracionOrganizacion.create({
        data: {
          tenantId: tenant.id,
          nombre,
          monedaBase: 'COP',
          zonaHoraria: 'America/Caracas',
        },
      });

      return tenant;
    });
  }

  findAll() {
    return this.prisma.tenant.findMany({
      orderBy: {
        creadoEn: 'desc',
      },
      include: {
        configuracion: true,
        pagos: {
          take: 1,
          orderBy: {
            fechaPago: 'desc',
          },
        },
        _count: {
          select: {
            usuarios: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id,
      },
      include: {
        configuracion: true,
        pagos: {
          orderBy: {
            fechaPago: 'desc',
          },
        },
        usuarios: {
          select: {
            id: true,
            nombre: true,
            correo: true,
            rol: true,
            estado: true,
          },
          orderBy: {
            creadoEn: 'desc',
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('El tenant no existe.');
    }

    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.validarTenantExiste(id);

    const data: {
      nombre?: string;
      slug?: string;
      activo?: boolean;
      fechaActivacion?: Date;
      fechaRenovacion?: Date | null;
      periodoRenovacion?: UpdateTenantDto['periodoRenovacion'];
    } = {};

    if (dto.nombre !== undefined) {
      data.nombre = dto.nombre.trim();
    }

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      await this.validarSlugDisponible(slug, id);
      data.slug = slug;
    }

    if (dto.activo !== undefined) {
      data.activo = dto.activo;
    }

    if (dto.fechaActivacion !== undefined) {
      data.fechaActivacion = new Date(dto.fechaActivacion);
    }

    if (dto.fechaRenovacion !== undefined) {
      data.fechaRenovacion = dto.fechaRenovacion
        ? new Date(dto.fechaRenovacion)
        : null;
    }

    if (dto.periodoRenovacion !== undefined) {
      data.periodoRenovacion = dto.periodoRenovacion;
    }

    return this.prisma.tenant.update({
      where: {
        id,
      },
      data,
    });
  }

  obtenerConfiguracion(id: string) {
    return this.configuracionService.obtenerOrganizacionPorTenant(id);
  }

  async actualizarConfiguracion(
    id: string,
    dto: ActualizarConfiguracionOrganizacionDto,
  ) {
    await this.validarTenantExiste(id);
    return this.configuracionService.actualizarOrganizacion(dto, id);
  }

  async listarPagos(tenantId: string) {
    await this.validarTenantExiste(tenantId);

    return this.prisma.pagoTenant.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        fechaPago: 'desc',
      },
    });
  }

  async registrarPago(tenantId: string, dto: RegistrarPagoTenantDto) {
    await this.validarTenantExiste(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const pago = await tx.pagoTenant.create({
        data: {
          tenantId,
          monto: dto.monto,
          moneda: dto.moneda ?? 'COP',
          fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : undefined,
          referencia: dto.referencia?.trim() || null,
          notas: dto.notas?.trim() || null,
        },
      });

      if (dto.fechaRenovacion) {
        await tx.tenant.update({
          where: {
            id: tenantId,
          },
          data: {
            fechaRenovacion: new Date(dto.fechaRenovacion),
          },
        });
      }

      return pago;
    });
  }

  async listarUsuarios(tenantId: string) {
    await this.validarTenantExiste(tenantId);

    return this.prisma.usuario.findMany({
      where: {
        tenantId,
        rol: {
          not: RolUsuario.SUPER_ADMIN,
        },
      },
      select: this.usuarioSelect(),
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async crearUsuario(tenantId: string, dto: CreateTenantUsuarioDto) {
    await this.validarTenantExiste(tenantId);
    this.validarRolTenant(dto.rol);

    const usuario = await this.usuariosService.create(
      {
        nombre: dto.nombre,
        correo: dto.correo,
        password: dto.password,
        rol: dto.rol,
      },
      tenantId,
    );

    if (dto.activo === false) {
      return this.usuariosService.updateEstado(
        usuario.id,
        {
          estado: EstadoEntidad.INACTIVO,
        },
        tenantId,
      );
    }

    return usuario;
  }

  async actualizarUsuario(
    tenantId: string,
    userId: string,
    dto: UpdateTenantUsuarioDto,
  ) {
    await this.validarTenantExiste(tenantId);
    await this.validarUsuarioPerteneceAlTenant(userId, tenantId);

    if (dto.rol !== undefined) {
      this.validarRolTenant(dto.rol);
    }

    const usuario = await this.usuariosService.update(
      userId,
      {
        nombre: dto.nombre,
        correo: dto.correo,
        rol: dto.rol,
      },
      tenantId,
    );

    if (dto.activo === undefined) {
      return usuario;
    }

    return this.usuariosService.updateEstado(
      userId,
      {
        estado: dto.activo ? EstadoEntidad.ACTIVO : EstadoEntidad.INACTIVO,
      },
      tenantId,
    );
  }

  private async validarTenantExiste(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('El tenant no existe.');
    }
  }

  private async validarUsuarioPerteneceAlTenant(userId: string, tenantId: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id: userId,
        tenantId,
        rol: {
          not: RolUsuario.SUPER_ADMIN,
        },
      },
      select: {
        id: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('El usuario no existe en este tenant.');
    }
  }

  private validarRolTenant(rol: RolUsuario) {
    if (rol === RolUsuario.SUPER_ADMIN) {
      throw new BadRequestException(
        'No se puede crear ni asignar SUPER_ADMIN desde un tenant.',
      );
    }
  }

  private usuarioSelect() {
    return {
      id: true,
      nombre: true,
      correo: true,
      rol: true,
      estado: true,
      tenantId: true,
      creadoEn: true,
      actualizadoEn: true,
    };
  }

  private async validarSlugDisponible(slug: string, tenantIdActual?: string) {
    if (!slug) {
      throw new BadRequestException('El slug del tenant es obligatorio.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });

    if (tenant && tenant.id !== tenantIdActual) {
      throw new ConflictException('Ya existe un tenant con ese slug.');
    }
  }

  private crearSlug(nombre: string) {
    const slug = nombre
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (!slug) {
      throw new BadRequestException('No fue posible generar el slug.');
    }

    return slug;
  }
}
