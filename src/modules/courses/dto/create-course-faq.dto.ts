import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCourseFaqDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @IsString()
  @MinLength(1)
  answer!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
