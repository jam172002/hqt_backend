import { PartialType } from '@nestjs/mapped-types';
import { TeacherProfileFieldsDto } from './teacher-profile-fields.dto';

/** Self-service update - no credentials, no status. */
export class UpdateTeacherProfileDto extends PartialType(TeacherProfileFieldsDto) {}
