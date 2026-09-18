import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'OVERDUE'] as const;

export class CreateHomeworkDto {
  @IsUUID()
  enrollmentId!: string;

  @IsOptional()
  @IsUUID()
  classSessionId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateHomeworkDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class SubmitHomeworkDto {
  @IsOptional()
  @IsString()
  content?: string;
}

const SUBMISSION_STATUSES = ['APPROVED', 'NEEDS_REVISION'] as const;

export class ReviewHomeworkSubmissionDto {
  @IsIn(SUBMISSION_STATUSES)
  status!: (typeof SUBMISSION_STATUSES)[number];

  @IsOptional()
  @IsString()
  teacherFeedback?: string;
}
