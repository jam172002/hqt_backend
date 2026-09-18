import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { NotificationResponse } from './interfaces/communication.interface';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  channel?: 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS' | 'WHATSAPP';
}

/**
 * IN_APP is the only channel actually delivered right now (stored and
 * queryable) - PUSH/EMAIL/SMS/WHATSAPP rows are recorded as PENDING but
 * not dispatched, matching the SRS's "Notification provider: TBD"
 * (Section 53). Real dispatch belongs behind a provider adapter per the
 * architecture spec's external-integration boundaries (Section 30),
 * which is future work once a provider is chosen.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput): Promise<void> {
    const channel = input.channel ?? 'IN_APP';
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        channel,
        status: channel === 'IN_APP' ? 'SENT' : 'PENDING',
        sentAt: channel === 'IN_APP' ? new Date() : undefined,
      },
    });
  }

  async listOwn(userId: string, page: number, limit: number): Promise<PaginatedResult<NotificationResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return this.toResponse(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private toResponse(notification: Notification): NotificationResponse {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      channel: notification.channel,
      status: notification.status,
      readAt: notification.readAt,
      sentAt: notification.sentAt,
      createdAt: notification.createdAt,
    };
  }
}
