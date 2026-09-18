import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so every domain module's infrastructure layer (repositories) can
 * inject PrismaService without re-importing this module everywhere.
 * Domain/application layers must never import Prisma directly — only the
 * infrastructure layer (per architecture spec Section 4 / 5.1).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
