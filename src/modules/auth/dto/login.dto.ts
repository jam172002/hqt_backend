import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((dto: LoginDto) => !dto.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((dto: LoginDto) => !dto.email)
  @IsString()
  phone?: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
