import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Public contact form (SRS Section 18). */
export class CreateContactInquiryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export class UpdateContactInquiryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}
