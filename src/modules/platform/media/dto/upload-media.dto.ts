import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;

export class UploadMediaDto {
  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: (typeof VISIBILITIES)[number];

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class AttachMediaDto {
  @IsString()
  entityType!: string;

  @IsUUID()
  entityId!: string;
}
