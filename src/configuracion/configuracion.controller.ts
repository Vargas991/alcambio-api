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
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { diskStorage } from 'multer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  TenantContext,
  requireTenantId,
} from '../common/tenant/tenant-context.decorator';
import type { TenantContextValue } from '../common/tenant/tenant-context.decorator';
import { successResponse } from 'src/common/responses/api-responses';
import { ActualizarConfiguracionOrganizacionDto } from './dto/actualizar-configuracion-organizacion.dto';
import { ConfiguracionService } from './configuracion.service';

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

  @Get('publica')
  async obtenerIdentidadPublica() {
    const data = await this.configuracionService.obtenerIdentidadPublica();
    return successResponse(data, 'Informacion publica.');
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  obtenerOrganizacion(@TenantContext() context: TenantContextValue) {
    return this.configuracionService.obtenerOrganizacion(requireTenantId(context));
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  actualizarOrganizacion(
    @TenantContext() context: TenantContextValue,
    @Body() dto: ActualizarConfiguracionOrganizacionDto,
  ) {
    return this.configuracionService.actualizarOrganizacion(
      dto,
      requireTenantId(context),
    );
  }

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
    @TenantContext() context: TenantContextValue,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    if (!archivo) {
      throw new BadRequestException(
        'Debes seleccionar un archivo para el logo.',
      );
    }

    return this.configuracionService.actualizarLogo(
      archivo.filename,
      requireTenantId(context),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('logo')
  eliminarLogo(@TenantContext() context: TenantContextValue) {
    return this.configuracionService.eliminarLogo(requireTenantId(context));
  }
}
