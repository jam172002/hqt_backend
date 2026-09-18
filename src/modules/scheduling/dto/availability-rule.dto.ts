import { IsBoolean, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleDto {
  /** 0 = Sunday ... 6 = Saturday, matching JS Date/Luxon weekday conventions used elsewhere in this module. */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN, { message: 'startTime must be "HH:mm" (24-hour)' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be "HH:mm" (24-hour)' })
  endTime!: string;

  @IsIanaTimezone()
  timezone!: string;
}

export class UpdateAvailabilityRuleDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
