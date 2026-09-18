import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { asJwtDuration } from '../../common/utils/duration.util';
import type { AppConfig } from '../../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('jwt.accessSecret', { infer: true }),
        signOptions: {
          expiresIn: asJwtDuration(configService.get('jwt.accessExpiresIn', { infer: true })),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    // Registered globally: every route requires authentication unless
    // explicitly marked @Public(), and every role-restricted route is
    // enforced consistently (architecture spec Section 2 & 15). Order
    // matters - JwtAccessGuard must run before RolesGuard so req.user
    // is populated by the time role checks happen.
    { provide: APP_GUARD, useClass: JwtAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
