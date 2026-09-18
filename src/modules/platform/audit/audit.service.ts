import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../../common/pagination/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuditLogResponse } from './interfaces/audit.interface';

export interface AuditLogInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit trail (architecture spec Section 22). Entries are
 * written by AuditInterceptor for every successful mutation on a
 * @Roles()-guarded route, so every admin/teacher/etc. write is covered
 * without hand-instrumenting each service individually.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          oldValues: input.oldValues,
          newValues: input.newValues,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
    } catch (error) {
      // Never let audit logging break the actual request.
      this.logger.error('Failed to write audit log', error instanceof Error ? error.stack : error);
    }
  }

  async list(page: number, limit: number): Promise<PaginatedResult<AuditLogResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count(),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        oldValues: row.oldValues,
        newValues: row.newValues,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }
}
