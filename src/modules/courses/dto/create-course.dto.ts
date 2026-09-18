import { IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateCourseDto {
  /** URL-friendly identifier for the public course page, e.g. "quran-reading". */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, hyphen-separated (e.g. "quran-reading")',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  shortDescription!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  suitableFor?: string;

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsString()
  teachingMethod?: string;

  @IsOptional()
  @IsString()
  classFormat?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
