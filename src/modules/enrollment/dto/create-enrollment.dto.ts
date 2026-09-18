import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

const INITIAL_STATUSES = ['TRIAL', 'PENDING'] as const;

export class CreateEnrollmentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  courseId!: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  /** An enrollment can only ever be *created* as TRIAL or PENDING - every other status is reached via a transition. */
  @IsOptional()
  @IsIn(INITIAL_STATUSES)
  status?: (typeof INITIAL_STATUSES)[number];

  @IsIanaTimezone()
  studentTimezone!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
