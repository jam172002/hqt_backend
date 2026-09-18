import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const TYPES = ['UNAVAILABLE', 'EXTRA_AVAILABLE'] as const;

export class CreateAvailabilityExceptionDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
