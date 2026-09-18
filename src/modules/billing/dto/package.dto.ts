import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

const BILLING_PERIODS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

export class CreatePackageDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  classesPerPeriod?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  classDurationMin?: number;

  @IsIn(BILLING_PERIODS)
  billingPeriod!: (typeof BILLING_PERIODS)[number];

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  currency!: string;
}

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  classesPerPeriod?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  classDurationMin?: number;

  @IsOptional()
  @IsIn(BILLING_PERIODS)
  billingPeriod?: (typeof BILLING_PERIODS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
