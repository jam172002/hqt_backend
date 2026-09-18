import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export class UpsertWebsiteContentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}
