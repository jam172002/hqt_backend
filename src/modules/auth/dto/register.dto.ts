import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Self-service registration is limited to STUDENT and PARENT (the SRS's
 * "Visitor -> Lead -> Trial -> Student" journey and parent self-signup).
 * Teacher accounts are created by an admin (SRS Section 14 "Admin Teacher
 * Management"); admin/super-admin accounts are provisioned out of band.
 */
const SELF_REGISTERABLE_ROLES = ['STUDENT', 'PARENT'] as const;
export type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];

export class RegisterDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(SELF_REGISTERABLE_ROLES)
  role!: SelfRegisterableRole;
}
