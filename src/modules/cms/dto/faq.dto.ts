import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;

export class CreateFaqDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @IsString()
  @MinLength(1)
  answer!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
