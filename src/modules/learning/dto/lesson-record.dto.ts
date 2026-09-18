import { IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpsertLessonRecordDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  teacherNotes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  performanceRating?: number;

  @IsOptional()
  @IsString()
  generalRemarks?: string;
}
