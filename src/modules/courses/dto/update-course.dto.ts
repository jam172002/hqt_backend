import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateCourseDto } from './create-course.dto';

const STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;

/** Admin-only endpoint - covers edit, publish, and hide (status transitions) in one call. */
export class UpdateCourseDto extends PartialType(CreateCourseDto) {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
