import { PartialType } from '@nestjs/mapped-types';
import { CreateSalidaDto } from './create-salida.dto';

export class UpdateSalidaDto extends PartialType(CreateSalidaDto) {}
