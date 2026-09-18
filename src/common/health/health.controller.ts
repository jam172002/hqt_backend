import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Liveness/readiness endpoints (architecture spec Section 21/23). Not
 * behind the versioned /api/v1 prefix on purpose - infra probes hit these
 * directly and don't need to track API versioning. Public: infra probes
 * don't carry a JWT.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res() res: Response): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(HttpStatus.OK).json({ status: 'ok', database: 'up' });
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'error', database: 'down' });
    }
  }
}
