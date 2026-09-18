import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

const STATUSES = ['TRIAL', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

export class EnrollmentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
