import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CancelSessionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RescheduleSessionDto {
  @IsDateString()
  newStartAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateOneOffSessionDto {
  @IsUUID()
  enrollmentId!: string;

  @IsDateString()
  scheduledStartAt!: string;

  @IsDateString()
  scheduledEndAt!: string;
}
