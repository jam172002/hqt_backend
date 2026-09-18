import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertSettingDto {
  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  description?: string;
}
