import { IsInt, IsISO31661Alpha2, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';

/** Shared profile fields, no credentials - base for both create and update DTOs. */
export class TeacherProfileFieldsDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  bio!: string;

  @IsOptional()
  @IsString()
  shortBio?: string;

  @IsString()
  @MinLength(1)
  qualification!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsString()
  teachingPhilosophy?: string;

  @IsISO31661Alpha2()
  countryCode!: string;

  @IsIanaTimezone()
  timezone!: string;
}
