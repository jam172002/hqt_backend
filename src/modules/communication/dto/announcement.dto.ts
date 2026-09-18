import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const TARGET_TYPES = [
  'ALL_USERS',
  'ALL_STUDENTS',
  'ALL_PARENTS',
  'ALL_TEACHERS',
  'SPECIFIC_USER',
  'COURSE',
] as const;

export class AnnouncementTargetDto {
  @IsIn(TARGET_TYPES)
  targetType!: (typeof TARGET_TYPES)[number];

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnnouncementTargetDto)
  targets?: AnnouncementTargetDto[];
}

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
