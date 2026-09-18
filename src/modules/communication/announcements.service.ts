import { Injectable, NotFoundException } from '@nestjs/common';
import type { Announcement, AnnouncementTarget, AnnouncementTargetType } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';
import type { AnnouncementResponse } from './interfaces/communication.interface';
import { NotificationsService } from './notifications.service';

const WITH_TARGETS = { targets: true };
type AnnouncementWithTargets = Announcement & { targets: AnnouncementTarget[] };

const ROLE_TO_TARGET_TYPE: Record<string, AnnouncementTargetType> = {
  [ROLE_CODES.STUDENT]: 'ALL_STUDENTS',
  [ROLE_CODES.PARENT]: 'ALL_PARENTS',
  [ROLE_CODES.TEACHER]: 'ALL_TEACHERS',
};

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(createdBy: string, dto: CreateAnnouncementDto): Promise<AnnouncementResponse> {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        createdBy,
        targets: dto.targets?.length
          ? {
              create: dto.targets.map((target) => ({
                targetType: target.targetType,
                userId: target.userId,
                courseId: target.courseId,
              })),
            }
          : undefined,
      },
      include: WITH_TARGETS,
    });
    return this.toResponse(announcement);
  }

  async adminList(page: number, limit: number): Promise<PaginatedResult<AnnouncementResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: WITH_TARGETS,
      }),
      this.prisma.announcement.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  /**
   * A simplified per-user feed: published announcements targeted at
   * ALL_USERS, the caller's role-based bucket, or the caller
   * specifically. COURSE-targeted announcements aren't matched against
   * enrollments here yet - a reasonable scope trim, documented as a
   * follow-up once this feed needs richer targeting.
   */
  async listForUser(user: AuthenticatedUser): Promise<AnnouncementResponse[]> {
    const roleTargetTypes = user.roles
      .map((role) => ROLE_TO_TARGET_TYPE[role])
      .filter((value): value is AnnouncementTargetType => Boolean(value));

    const announcements = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        targets: {
          some: {
            OR: [
              { targetType: 'ALL_USERS' },
              { targetType: { in: roleTargetTypes } },
              { targetType: 'SPECIFIC_USER', userId: user.id },
            ],
          },
        },
      },
      include: WITH_TARGETS,
      orderBy: { publishedAt: 'desc' },
    });

    return announcements.map((announcement) => this.toResponse(announcement));
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<AnnouncementResponse> {
    const existing = await this.findOrThrow(id);
    const wasPublished = existing.status === 'PUBLISHED';

    const announcement = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        status: dto.status,
        publishedAt: dto.status === 'PUBLISHED' && !existing.publishedAt ? new Date() : undefined,
      },
      include: WITH_TARGETS,
    });

    if (!wasPublished && announcement.status === 'PUBLISHED') {
      await this.fanOutNotifications(announcement);
    }

    return this.toResponse(announcement);
  }

  private async fanOutNotifications(announcement: AnnouncementWithTargets): Promise<void> {
    const userIds = new Set<string>();

    for (const target of announcement.targets) {
      if (target.targetType === 'SPECIFIC_USER' && target.userId) {
        userIds.add(target.userId);
      } else if (target.targetType === 'ALL_USERS') {
        const users = await this.prisma.user.findMany({ select: { id: true } });
        users.forEach((user) => userIds.add(user.id));
      } else if (target.targetType in this.reverseRoleMap()) {
        const roleCode = this.reverseRoleMap()[target.targetType];
        const users = await this.prisma.user.findMany({
          where: { roles: { some: { role: { code: roleCode } } } },
          select: { id: true },
        });
        users.forEach((user) => userIds.add(user.id));
      }
      // COURSE targeting is not fanned out to notifications yet - see listForUser's comment.
    }

    await Promise.all(
      Array.from(userIds).map((userId) =>
        this.notifications.create({
          userId,
          type: 'ANNOUNCEMENT',
          title: announcement.title,
          body: announcement.body,
        }),
      ),
    );
  }

  private reverseRoleMap(): Record<string, string> {
    return {
      ALL_STUDENTS: ROLE_CODES.STUDENT,
      ALL_PARENTS: ROLE_CODES.PARENT,
      ALL_TEACHERS: ROLE_CODES.TEACHER,
    };
  }

  private async findOrThrow(id: string): Promise<AnnouncementWithTargets> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: WITH_TARGETS,
    });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }

  private toResponse(announcement: AnnouncementWithTargets): AnnouncementResponse {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      status: announcement.status,
      publishedAt: announcement.publishedAt,
      createdBy: announcement.createdBy,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
      targets: announcement.targets.map((target) => ({
        id: target.id,
        targetType: target.targetType,
        userId: target.userId,
        courseId: target.courseId,
      })),
    };
  }
}
