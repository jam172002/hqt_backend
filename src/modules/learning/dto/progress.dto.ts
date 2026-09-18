import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsOptional()
  @IsString()
  currentLesson?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(114)
  currentSurah?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  currentAyah?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tajweedProgress?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  hifzProgress?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  performance?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
