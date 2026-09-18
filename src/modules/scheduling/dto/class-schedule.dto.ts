import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ['ACTIVE', 'PAUSED', 'ENDED'] as const;

export class CreateClassScheduleDto {
  @IsUUID()
  enrollmentId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN, { message: 'localStartTime must be "HH:mm" (24-hour)' })
  localStartTime!: string;

  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes!: number;

  @IsIanaTimezone()
  timezone!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;
}

export class UpdateClassScheduleDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'localStartTime must be "HH:mm" (24-hour)' })
  localStartTime?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class GenerateSessionsDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
