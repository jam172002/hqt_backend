import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../config/configuration';

/**
 * PostgreSQL is the system of record for transactional business data
 * (see architecture spec, Section 7). This service is the single Prisma
 * entry point injected into every module's repositories.
 *
 * Prisma ORM 7 requires a driver adapter for the client connection - the
 * `datasource.url` in schema.prisma is only used by the CLI (via
 * prisma.config.ts), not by PrismaClient at runtime.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get('database.url', { infer: true }),
      }),
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    this.$on('warn' as never, (event: unknown) => this.logger.warn(event));
    this.$on('error' as never, (event: unknown) => this.logger.error(event));
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
