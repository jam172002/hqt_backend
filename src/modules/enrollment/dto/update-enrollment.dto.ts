import { IsOptional, IsString } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

/** Plain field edits only - status changes go through the dedicated status-transition endpoint. */
export class UpdateEnrollmentDto {
  @IsOptional()
  @IsIanaTimezone()
  studentTimezone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
