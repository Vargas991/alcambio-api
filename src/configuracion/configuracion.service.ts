import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  existsSync,
} from 'node:fs';

import {
  unlink,
} from 'node:fs/promises';

import {
  basename,
  join,
} from 'node:path';

import { PrismaService } from '../prisma/prisma.service';

import { ActualizarConfiguracionOrganizacionDto } from './dto/actualizar-configuracion-organizacion.dto';
import { isValidTimeZone } from '../common/helpers/date-range.helper';

@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * El sistema actualmente maneja una sola
   * organización.
   *
   * Si todavía no existe la configuración,
   * se crea automáticamente.
   */
  async obtenerOrganizacion() {
    const configuracion =
      await this.prisma
        .configuracionOrganizacion
        .findFirst({
          orderBy: {
            creadoEn: 'asc',
          },
        });

    if (configuracion) {
      return configuracion;
    }

    return this.prisma
      .configuracionOrganizacion
      .create({
        data: {
          nombre: 'Mi organización',
          monedaBase: 'COP',
          zonaHoraria:
            'America/Caracas',
        },
      });
  }

  async obtenerIdentidadPublica() {
  const configuracion =
    await this.obtenerOrganizacion();

  return {
    nombre: configuracion.nombre,
    logoUrl: configuracion.logoUrl,
  };
}

  /**
   * Actualiza la información general.
   *
   * El logo se administra mediante un endpoint
   * independiente.
   */
  async actualizarOrganizacion(
    dto: ActualizarConfiguracionOrganizacionDto,
  ) {
    const configuracion =
      await this.obtenerOrganizacion();
    const zonaHoraria =
      this.normalizarZonaHoraria(
        dto.zonaHoraria,
      );

    return this.prisma
      .configuracionOrganizacion
      .update({
        where: {
          id: configuracion.id,
        },

        data: {
          nombre:
            dto.nombre === undefined
              ? undefined
              : dto.nombre.trim(),

          telefono:
            dto.telefono === undefined
              ? undefined
              : this.normalizarTextoOpcional(
                  dto.telefono,
                ),

          correo:
            dto.correo === undefined
              ? undefined
              : this.normalizarTextoOpcional(
                  dto.correo,
                ),

          direccion:
            dto.direccion === undefined
              ? undefined
              : this.normalizarTextoOpcional(
                  dto.direccion,
                ),

          monedaBase:
            dto.monedaBase,

          zonaHoraria,
        },
      });
  }

  /**
   * Guarda la URL del nuevo logo y elimina
   * el archivo anterior.
   */
  async actualizarLogo(
    nombreArchivo: string,
  ) {
    const configuracion =
      await this.obtenerOrganizacion();

    const logoUrl =
      `/uploads/organizacion/${nombreArchivo}`;

    try {
      await this.eliminarArchivoLogo(
        configuracion.logoUrl,
        nombreArchivo,
      );

      return await this.prisma
        .configuracionOrganizacion
        .update({
          where: {
            id: configuracion.id,
          },

          data: {
            logoUrl,
          },
        });
    } catch (error) {
      /**
       * Si falla la actualización en base de datos,
       * intentamos borrar el archivo recién subido
       * para evitar archivos huérfanos.
       */
      await this.eliminarArchivoLogo(
        logoUrl,
      ).catch(() => undefined);

      throw error;
    }
  }

  /**
   * Elimina el logo físico y limpia logoUrl.
   */
  async eliminarLogo() {
    const configuracion =
      await this.obtenerOrganizacion();

    if (configuracion.logoUrl) {
      await this.eliminarArchivoLogo(
        configuracion.logoUrl,
      );
    }

    return this.prisma
      .configuracionOrganizacion
      .update({
        where: {
          id: configuracion.id,
        },

        data: {
          logoUrl: null,
        },
      });
  }

  private normalizarTextoOpcional(
    valor: string | null,
  ) {
    if (valor === null) {
      return null;
    }

    const valorNormalizado =
      valor.trim();

    return valorNormalizado.length > 0
      ? valorNormalizado
      : null;
  }

  private normalizarZonaHoraria(
    zonaHoraria: string | undefined,
  ) {
    if (zonaHoraria === undefined) {
      return undefined;
    }

    const zonaHorariaNormalizada =
      zonaHoraria.trim();

    if (
      zonaHorariaNormalizada.length === 0 ||
      !isValidTimeZone(
        zonaHorariaNormalizada,
      )
    ) {
      throw new BadRequestException(
        'La zona horaria debe ser un identificador IANA valido.',
      );
    }

    return zonaHorariaNormalizada;
  }

  /**
   * Elimina un logo del directorio permitido.
   *
   * basename evita que una URL manipulada pueda
   * apuntar fuera de uploads/organizacion.
   */
  private async eliminarArchivoLogo(
    logoUrl: string | null,
    nuevoNombreArchivo?: string,
  ) {
    if (!logoUrl) {
      return;
    }

    const nombreArchivo =
      basename(logoUrl);

    if (
      nuevoNombreArchivo &&
      nombreArchivo ===
        nuevoNombreArchivo
    ) {
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
