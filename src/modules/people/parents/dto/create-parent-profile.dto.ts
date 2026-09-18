import { IsISO31661Alpha2, IsOptional, IsString, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';

export class CreateParentProfileDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsISO31661Alpha2()
  countryCode!: string;

  @IsIanaTimezone()
  timezone!: string;
}
