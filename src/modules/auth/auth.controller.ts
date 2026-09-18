import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, type RequestMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import type { TokenPair } from './interfaces/token-pair.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<TokenPair> {
    return this.authService.login(dto, this.buildMeta(req, dto.deviceId));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken, this.buildMeta(req));
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedUser> {
    return this.authService.me(user.id);
  }

  private buildMeta(req: Request, deviceId?: string): RequestMeta {
    return {
      deviceId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
