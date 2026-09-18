import { IsDateString, IsIn, IsISO31661Alpha2, IsOptional, IsString, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';

const GENDERS = ['MALE', 'FEMALE'] as const;

export class CreateStudentProfileDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  /** ISO date string, e.g. "2015-04-12". Age is derived from this, never stored. */
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @IsISO31661Alpha2()
  countryCode!: string;

  @IsIanaTimezone()
  timezone!: string;
}
