import { PartialType } from '@nestjs/mapped-types';
import { CreateStudentProfileDto } from './create-student-profile.dto';

/** Self-service update: same fields as creation, all optional. */
export class UpdateStudentProfileDto extends PartialType(CreateStudentProfileDto) {}
