import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import { ActualizarConfiguracionOrganizacionDto } from './dto/actualizar-configuracion-organizacion.dto';
import { isValidTimeZone } from '../common/helpers/date-range.helper';

@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerOrganizacion(tenantId?: string | null) {
    if (tenantId) {
      return this.obtenerOrganizacionPorTenant(tenantId);
    }

    const configuracion =
      await this.prisma.configuracionOrganizacion.findFirst({
        orderBy: {
          creadoEn: 'asc',
        },
      });

    if (configuracion) {
      return configuracion;
    }

    const tenant = await this.obtenerOCrearTenantDefault();

    return this.crearConfiguracionDefault(tenant.id, tenant.nombre);
  }

  async obtenerOrganizacionPorTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
    });

    if (!tenant) {
      throw new NotFoundException('El tenant no existe.');
    }

    const configuracion =
      await this.prisma.configuracionOrganizacion.findUnique({
        where: {
          tenantId,
        },
      });

    if (configuracion) {
      return configuracion;
    }

    return this.crearConfiguracionDefault(tenant.id, tenant.nombre);
  }

  async obtenerIdentidadPublica() {
    const configuracion = await this.obtenerOrganizacion();

    return {
      nombre: configuracion.nombre,
      logoUrl: configuracion.logoUrl,
    };
  }

  async actualizarOrganizacion(
    dto: ActualizarConfiguracionOrganizacionDto,
    tenantId?: string | null,
  ) {
    const configuracion = await this.obtenerOrganizacion(tenantId);
    const zonaHoraria = this.normalizarZonaHoraria(dto.zonaHoraria);

    return this.prisma.configuracionOrganizacion.update({
      where: {
        id: configuracion.id,
      },
      data: {
        nombre: dto.nombre === undefined ? undefined : dto.nombre.trim(),
        telefono:
          dto.telefono === undefined
            ? undefined
            : this.normalizarTextoOpcional(dto.telefono),
        correo:
          dto.correo === undefined
            ? undefined
            : this.normalizarTextoOpcional(dto.correo),
        direccion:
          dto.direccion === undefined
            ? undefined
            : this.normalizarTextoOpcional(dto.direccion),
        monedaBase: dto.monedaBase,
        zonaHoraria,
      },
    });
  }

  async actualizarLogo(nombreArchivo: string, tenantId?: string | null) {
    const configuracion = await this.obtenerOrganizacion(tenantId);
    const logoUrl = `/uploads/organizacion/${nombreArchivo}`;

    try {
      await this.eliminarArchivoLogo(configuracion.logoUrl, nombreArchivo);

      return await this.prisma.configuracionOrganizacion.update({
        where: {
          id: configuracion.id,
        },
        data: {
          logoUrl,
        },
      });
    } catch (error) {
      await this.eliminarArchivoLogo(logoUrl).catch(() => undefined);
      throw error;
    }
  }

  async eliminarLogo(tenantId?: string | null) {
    const configuracion = await this.obtenerOrganizacion(tenantId);

    if (configuracion.logoUrl) {
      await this.eliminarArchivoLogo(configuracion.logoUrl);
    }

    return this.prisma.configuracionOrganizacion.update({
      where: {
        id: configuracion.id,
      },
      data: {
        logoUrl: null,
      },
    });
  }

  private async obtenerOCrearTenantDefault() {
    return this.prisma.tenant.upsert({
      where: {
        slug: 'default',
      },
      update: {},
      create: {
        nombre: 'AlCambio',
        slug: 'default',
        activo: true,
      },
    });
  }

  private crearConfiguracionDefault(tenantId: string, nombre: string) {
    return this.prisma.configuracionOrganizacion.create({
      data: {
        tenantId,
        nombre,
        monedaBase: 'COP',
        zonaHoraria: 'America/Caracas',
      },
    });
  }

  private normalizarTextoOpcional(valor: string | null) {
    if (valor === null) {
      return null;
    }

    const valorNormalizado = valor.trim();

    return valorNormalizado.length > 0 ? valorNormalizado : null;
  }

  private normalizarZonaHoraria(zonaHoraria: string | undefined) {
    if (zonaHoraria === undefined) {
      return undefined;
    }

    const zonaHorariaNormalizada = zonaHoraria.trim();

    if (
      zonaHorariaNormalizada.length === 0 ||
      !isValidTimeZone(zonaHorariaNormalizada)
    ) {
      throw new BadRequestException(
        'La zona horaria debe ser un identificador IANA valido.',
      );
    }

    return zonaHorariaNormalizada;
  }

  private async eliminarArchivoLogo(
    logoUrl: string | null,
    nuevoNombreArchivo?: string,
  ) {
    if (!logoUrl) {
      return;
    }

    const nombreArchivo = basename(logoUrl);

    if (nuevoNombreArchivo && nombreArchivo === nuevoNombreArchivo) {
      return;
    }

    const rutaArchivo = join(
      process.cwd(),
      'uploads',
      'organizacion',
      nombreArchivo,
    );

    if (!existsSync(rutaArchivo)) {
      return;
    }

    try {
      await unlink(rutaArchivo);
    } catch {
      throw new InternalServerErrorException(
        'No fue posible eliminar el archivo del logo anterior.',
      );
    }
  }
}
