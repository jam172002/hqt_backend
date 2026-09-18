import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { asJwtDuration, parseDurationToMs } from '../../common/utils/duration.util';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_CODES } from './constants/roles.constant';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import type { AccessTokenPayload } from './interfaces/jwt-payload.interface';
import type { TokenPair } from './interfaces/token-pair.interface';

const PASSWORD_SALT_ROUNDS = 12;
const REFRESH_TOKEN_HASH_ROUNDS = 10;

export interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  static readonly roleCodes = ROLE_CODES;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ id: string; email: string | null; phone: string | null }> {
    return this.createUserWithRole(dto.email, dto.phone, dto.password, dto.role);
  }

  /**
   * Same account-creation path as self-service register(), but not
   * exposed on the public register endpoint and not restricted to
   * STUDENT/PARENT - used when an authenticated ADMIN provisions a
   * credentialed account for someone else (e.g. People module creating a
   * TEACHER account). Callers are responsible for the authorization check.
   */
  async createManagedAccount(
    email: string | undefined,
    phone: string | undefined,
    password: string,
    role: string,
  ): Promise<{ id: string; email: string | null; phone: string | null }> {
    return this.createUserWithRole(email, phone, password, role);
  }

  private async createUserWithRole(
    email: string | undefined,
    phone: string | undefined,
    password: string,
    roleCode: string,
  ): Promise<{ id: string; email: string | null; phone: string | null }> {
    if (!email && !phone) {
      throw new BadRequestException('Either email or phone is required');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });

    if (existing) {
      throw new ConflictException('An account with this email or phone already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      throw new BadRequestException(
        `Role "${roleCode}" is not seeded yet - run the Prisma seed script`,
      );
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        password: passwordHash,
        // Email/phone verification (OTP) is not wired up yet; treat new
        // accounts as active so login isn't a dead end. Revisit once the
        // verification flow lands.
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });

    return { id: user.id, email: user.email, phone: user.phone };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
      include: { roles: { include: { role: true } } },
    });

    if (!user || !user.password || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const roles = user.roles.map((userRole) => userRole.role.code);
    const tokens = await this.issueTokenPair(user.id, roles, meta);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return tokens;
  }

  /**
   * Refresh tokens are opaque, not JWTs: "<sessionId>.<randomSecret>". The
   * session id looks up the row; the secret is bcrypt-compared against
   * refresh_token_hash. This keeps refresh validation entirely DB-backed
   * (revocable per session/device) without a second signing secret.
   */
  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const [sessionId, secret] = rawRefreshToken.split('.');
    if (!sessionId || !secret) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const matches = await bcrypt.compare(secret, session.refreshTokenHash);
    if (!matches) {
      // Token reuse/mismatch: revoke the session defensively.
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token is invalid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Rotate: revoke the presented session, issue a brand new one.
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const roles = user.roles.map((userRole) => userRole.role.code);
    return this.issueTokenPair(user.id, roles, meta);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const [sessionId] = rawRefreshToken.split('.');
    if (!sessionId) {
      return;
    }

    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((userRole) => userRole.role.code),
    };
  }

  private async issueTokenPair(
    userId: string,
    roles: string[],
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const accessExpiresIn = this.configService.get('jwt.accessExpiresIn', { infer: true });
    const refreshExpiresIn = this.configService.get('jwt.refreshExpiresIn', { infer: true });

    const accessPayload: AccessTokenPayload = { sub: userId, roles };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get('jwt.accessSecret', { infer: true }),
      expiresIn: asJwtDuration(accessExpiresIn),
    });

    const secret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const refreshTokenHash = await bcrypt.hash(secret, REFRESH_TOKEN_HASH_ROUNDS);
    const expiresAt = new Date(Date.now() + parseDurationToMs(refreshExpiresIn));

    const session = await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash,
        deviceId: meta.deviceId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: `${session.id}.${secret}`,
      expiresIn: accessExpiresIn,
    };
  }
}
