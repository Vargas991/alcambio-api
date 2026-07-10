import { IsOptional, IsString } from 'class-validator';

export class FilterDashboardDto {
  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;
}