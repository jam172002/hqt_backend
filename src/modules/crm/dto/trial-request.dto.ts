import { ArrayMinSize, IsArray, IsIn, IsInt, IsISO31661Alpha2, IsOptional, IsString, IsUUID, Matches, Max, Min, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Public "Book Free Trial" form (SRS Section 8). */
export class CreateTrialRequestDto {
  @IsString()
  @MinLength(1)
  studentName!: string;

  @IsInt()
  @Min(1)
  @Max(120)
  studentAge!: number;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsISO31661Alpha2()
  countryCode!: string;

  @IsString()
  @MinLength(5)
  whatsapp!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsUUID()
  courseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  preferredDays!: string[];

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'preferredTime must be "HH:mm" (24-hour)' })
  preferredTime?: string;

  @IsIanaTimezone()
  timezone!: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  specialRequirements?: string;
}

const STATUSES = [
  'NEW',
  'CONTACTED',
  'TRIAL_SCHEDULED',
  'TRIAL_COMPLETED',
  'ENROLLED',
  'REJECTED',
  'CLOSED',
] as const;

export class UpdateTrialRequestDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}

export class ConvertTrialRequestDto {
  /** Links to an existing student instead of creating a new managed one. */
  @IsOptional()
  @IsUUID()
  studentProfileId?: string;
}
