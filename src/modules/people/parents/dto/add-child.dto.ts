import { IsBoolean, IsDateString, IsIn, IsISO31661Alpha2, IsOptional, IsString, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';

const GENDERS = ['MALE', 'FEMALE'] as const;
const RELATIONSHIP_TYPES = ['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER'] as const;

/**
 * Adds a child the parent manages directly - no login credentials of the
 * child's own. This creates a bare `users` row (email/phone/password all
 * null, which the schema allows) purely to satisfy student_profiles'
 * required user_id FK, plus the student profile and the relationship link.
 */
export class AddChildDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

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

  @IsIn(RELATIONSHIP_TYPES)
  relationshipType!: (typeof RELATIONSHIP_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewProgress?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewPayments?: boolean;

  @IsOptional()
  @IsBoolean()
  canJoinClass?: boolean;
}
