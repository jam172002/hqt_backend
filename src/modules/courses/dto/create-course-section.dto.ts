import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCourseSectionDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
