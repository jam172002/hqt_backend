import { IsIn, IsOptional } from 'class-validator';
import { UpdateStudentProfileDto } from './update-student-profile.dto';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/** Admin can additionally change status (activate/deactivate); students can't. */
export class AdminUpdateStudentDto extends UpdateStudentProfileDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
