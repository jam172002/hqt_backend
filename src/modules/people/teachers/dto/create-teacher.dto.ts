import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { TeacherProfileFieldsDto } from './teacher-profile-fields.dto';

/** Admin-only: provisions login credentials plus the profile in one call. */
export class CreateTeacherDto extends TeacherProfileFieldsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
