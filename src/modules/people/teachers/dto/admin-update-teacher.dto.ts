import { IsIn, IsOptional } from 'class-validator';
import { UpdateTeacherProfileDto } from './update-teacher-profile.dto';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/** Admin can additionally activate/deactivate a teacher (SRS: "Admin Teacher Management"). */
export class AdminUpdateTeacherDto extends UpdateTeacherProfileDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
