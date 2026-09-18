import { IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

export class MarkAttendanceDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
