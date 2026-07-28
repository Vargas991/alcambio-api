import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';

import { existsSync, mkdirSync } from 'node:fs';

import { randomUUID } from 'node:crypto';

import { extname, join } from 'node:path';

import { ConfiguracionService } from './configuracion.service';

import { ActualizarConfiguracionOrganizacionDto } from './dto/actualizar-configuracion-organizacion.dto';

// Ajusta estas rutas según tu proyecto.
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { successResponse } from 'src/common/responses/api-responses';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

const directorioLogos = join(process.cwd(), 'uploads', 'organizacion');

if (!existsSync(directorioLogos)) {
  mkdirSync(directorioLogos, {
    recursive: true,
  });
}

const extensionesPermitidas = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const mimeTypesPermitidos = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Controller('configuracion/organizacion')
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  /**
   * GET /api/configuracion/organizacion
   */

  @Get('publica')
  async obtenerIdentidadPublica() {
    const data = await this.configuracionService.obtenerIdentidadPublica();
    return successResponse(data,"Informacion publica.")
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  obtenerOrganizacion() {
    return this.configuracionService.obtenerOrganizacion();
  }

  /**
   * PATCH /api/configuracion/organizacion
   */
  // @Roles('ADMIN')
  @UseGuards(JwtAuthGuard)
  @Patch()
  actualizarOrganizacion(
    @Body()
    dto: ActualizarConfiguracionOrganizacionDto,
  ) {
    return this.configuracionService.actualizarOrganizacion(dto);
  }

  /**
   * POST /api/configuracion/organizacion/logo
   *
   * Body multipart/form-data:
   * logo: File
   */
  // @Roles('ADMIN')
  @UseGuards(JwtAuthGuard)
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          callback(null, directorioLogos);
        },

        filename: (_request, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();

          const nombreArchivo = `logo-${Date.now()}-${randomUUID()}${extension}`;

          callback(null, nombreArchivo);
        },
      }),

      limits: {
        fileSize: 2 * 1024 * 1024,
      },

      fileFilter: (_request, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();

        const archivoPermitido =
          mimeTypesPermitidos.has(file.mimetype) &&
          extensionesPermitidas.has(extension);

        if (!archivoPermitido) {
          callback(
            new BadRequestException(
              'El logo debe ser un archivo PNG, JPG, JPEG o WEBP.',
            ),
            false,
          );

          return;
        }

        callback(null, true);
      },
    }),
  )
  actualizarLogo(
    @UploadedFile()
    archivo?: Express.Multer.File,
  ) {
    if (!archivo) {
      throw new BadRequestException(
        'Debes seleccionar un archivo para el logo.',
      );
    }

    return this.configuracionService.actualizarLogo(archivo.filename);
  }

  /**
   * DELETE /api/configuracion/organizacion/logo
   */
  // @Roles('ADMIN')
  @UseGuards(JwtAuthGuard)
  @Delete('logo')
  eliminarLogo() {
    return this.configuracionService.eliminarLogo();
  }
}
