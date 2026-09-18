import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  enrollmentId!: string;

  @IsOptional()
  @IsUUID()
  packageId?: string;

  @IsString()
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsDateString()
  dueAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

const STATUSES = ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'] as const;

export class UpdateInvoiceDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
