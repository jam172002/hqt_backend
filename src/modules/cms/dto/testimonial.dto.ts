import { IsIn, IsInt, IsISO31661Alpha2, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

const CATEGORIES = ['PARENT', 'ADULT_STUDENT', 'HIFZ_STUDENT'] as const;
const STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;

export class CreateTestimonialDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsISO31661Alpha2()
  countryCode!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MinLength(1)
  review!: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class UpdateTestimonialDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  review?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
