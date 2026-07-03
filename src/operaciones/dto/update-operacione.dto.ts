import { PartialType } from '@nestjs/mapped-types';
import { CreateOperacionDto } from './create-operacion.dto';

export class UpdateOperacionDto extends PartialType(CreateOperacionDto) {}
