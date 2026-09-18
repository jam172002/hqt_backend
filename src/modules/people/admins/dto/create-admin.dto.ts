import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * SUPER_ADMIN-only: provisions another ADMIN account. Kept separate from
 * the plain ADMIN role's own permissions - only a super admin can grow the
 * admin roster, preventing uncontrolled privilege escalation.
 */
export class CreateAdminDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}
