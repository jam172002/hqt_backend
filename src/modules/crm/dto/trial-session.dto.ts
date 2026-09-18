import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

export class ScheduleTrialSessionDto {
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsDateString()
  scheduledStartAt!: string;

  @IsDateString()
  scheduledEndAt!: string;

  @IsIanaTimezone()
  timezone!: string;
}

const STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'] as const;

export class UpdateTrialSessionDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
