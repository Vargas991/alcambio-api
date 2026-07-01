import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UsuariosService } from './usuarios.service';
import { successResponse } from 'src/common/responses/api-responses';

@Controller('usuarios')
export class UsuariosController {

  constructor(private readonly usuariosService: UsuariosService){}

  @Post()
  create(@Body() dto: CreateUsuarioDto) {
    const data =  this.usuariosService.create(dto);
    return successResponse(data, 'Usuario creado correctamente.');
  }

  @Get()
  async findAll() {
    const data = await this.usuariosService.findAll();
    return successResponse(data, 'Usuarios encontrados correctamente.');
  }
}
