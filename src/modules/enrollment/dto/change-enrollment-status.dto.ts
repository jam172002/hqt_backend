import { IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['TRIAL', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

export class ChangeEnrollmentStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
