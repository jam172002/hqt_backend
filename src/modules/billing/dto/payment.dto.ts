import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Payments are admin-recorded (manual reconciliation) - see billing.module.ts header comment. */
export class RecordPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
