import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ReassignTeacherDto {
  @IsUUID()
  teacherId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
