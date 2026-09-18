import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClassSession } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { CreateOneOffSessionDto, RescheduleSessionDto } from './dto/session-actions.dto';
import type { SessionQueryDto } from './dto/session-query.dto';
import type { ClassSessionResponse } from './interfaces/scheduling.interface';

const WITH_SUMMARIES = {
  student: { select: { firstName: true, lastName: true } },
  teacher: { select: { firstName: true, lastName: true } },
  course: { select: { slug: true, name: true } },
};

type ClassSessionWithSummaries = ClassSession & {
  student: { firstName: string; lastName: string | null };
  teacher: { firstName: string; lastName: string };
  course: { slug: string; name: string };
};

@Injectable()
export class ClassSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createOneOff(dto: CreateOneOffSessionDto): Promise<ClassSessionResponse> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: dto.enrollmentId } });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (!enrollment.teacherId) {
      throw new BadRequestException('Enrollment has no teacher assigned yet - assign one first');
    }

    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);
    if (start >= end) {
      throw new BadRequestException('scheduledStartAt must be before scheduledEndAt');
    }

    const session = await this.prisma.classSession.create({
      data: {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        teacherId: enrollment.teacherId,
        courseId: enrollment.courseId,
        scheduledStartAt: start,
        scheduledEndAt: end,
        status: 'SCHEDULED',
        meetingProvider: 'MANUAL',
      },
      include: WITH_SUMMARIES,
    });

    return this.toResponse(session);
  }

  async list(query: SessionQueryDto): Promise<PaginatedResult<ClassSessionResponse>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = {
      studentId: query.studentId,
      teacherId: query.teacherId,
      enrollmentId: query.enrollmentId,
      status: query.status,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.classSession.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledStartAt: 'desc' },
        include: WITH_SUMMARIES,
      }),
      this.prisma.classSession.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(id: string): Promise<ClassSessionResponse> {
    const session = await this.findOrThrow(id);
    return this.toResponse(session);
  }

  async listForStudent(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClassSessionResponse>> {
    const studentId = await this.studentIdForUser(userId);
    return this.listForFilter({ studentId }, page, limit);
  }

  async listForTeacher(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClassSessionResponse>> {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) {
      throw new NotFoundException('No teacher profile exists for this account yet');
    }
    return this.listForFilter({ teacherId: teacher.id }, page, limit);
  }

  async listForChild(
    parentUserId: string,
    studentId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClassSessionResponse>> {
    const parentProfile = await this.prisma.parentProfile.findUnique({
      where: { userId: parentUserId },
    });
    if (!parentProfile) {
      throw new NotFoundException('No parent profile exists for this account yet');
    }
    const link = await this.prisma.parentStudentRelationship.findUnique({
      where: { parentId_studentId: { parentId: parentProfile.id, studentId } },
    });
    if (!link) {
      throw new NotFoundException('Student not found');
    }
    return this.listForFilter({ studentId }, page, limit);
  }

  async cancel(
    user: AuthenticatedUser,
    id: string,
    reason: string | undefined,
  ): Promise<ClassSessionResponse> {
    const session = await this.findOrThrow(id);
    await this.assertCanManageSession(user, session.teacherId);
    if (session.status !== 'SCHEDULED') {
      throw new BadRequestException(`Cannot cancel a session with status ${session.status}`);
    }

    const updated = await this.prisma.classSession.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: user.id,
        cancellationReason: reason,
      },
      include: WITH_SUMMARIES,
    });
    return this.toResponse(updated);
  }

  /**
   * Reschedules by creating a new session row and marking the old one
   * RESCHEDULED - past sessions are never silently rewritten
   * (architecture spec Section 8.1).
   */
  async reschedule(
    user: AuthenticatedUser,
    id: string,
    dto: RescheduleSessionDto,
  ): Promise<ClassSessionResponse> {
    const session = await this.findOrThrow(id);
    await this.assertCanManageSession(user, session.teacherId);
    if (session.status !== 'SCHEDULED') {
      throw new BadRequestException(`Cannot reschedule a session with status ${session.status}`);
    }

    const newStart = new Date(dto.newStartAt);
    const durationMs = session.scheduledEndAt.getTime() - session.scheduledStartAt.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.classSession.update({
        where: { id },
        data: { status: 'RESCHEDULED', cancellationReason: dto.reason },
      });

      return tx.classSession.create({
        data: {
          classScheduleId: session.classScheduleId,
          enrollmentId: session.enrollmentId,
          studentId: session.studentId,
          teacherId: session.teacherId,
          courseId: session.courseId,
          scheduledStartAt: newStart,
          scheduledEndAt: newEnd,
          originalStartAt: session.originalStartAt ?? session.scheduledStartAt,
          status: 'SCHEDULED',
          meetingProvider: session.meetingProvider,
          rescheduledFromId: session.id,
        },
        include: WITH_SUMMARIES,
      });
    });

    return this.toResponse(created);
  }

  private async listForFilter(
    where: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClassSessionResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.classSession.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledStartAt: 'desc' },
        include: WITH_SUMMARIES,
      }),
      this.prisma.classSession.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async studentIdForUser(userId: string): Promise<string> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No student profile exists for this account yet');
    }
    return profile.id;
  }

  private async findOrThrow(id: string): Promise<ClassSessionWithSummaries> {
    const session = await this.prisma.classSession.findUnique({
      where: { id },
      include: WITH_SUMMARIES,
    });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    return session;
  }

  /**
   * Admins may manage any session; a teacher may only manage sessions
   * assigned to them. Without this, any authenticated teacher could
   * cancel or reschedule any other teacher's sessions, since @Roles only
   * checks role membership, not resource ownership - same convention as
   * LearningAccessService.assertIsAssignedTeacher in the learning domain.
   * Throws NotFoundException (not Forbidden) so a teacher can't use this
   * to probe for the existence of another teacher's sessions.
   */
  private async assertCanManageSession(user: AuthenticatedUser, teacherId: string): Promise<void> {
    if (user.roles.includes(ROLE_CODES.ADMIN) || user.roles.includes(ROLE_CODES.SUPER_ADMIN)) {
      return;
    }
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
    if (teacher?.id !== teacherId) {
      throw new NotFoundException('Class session not found');
    }
  }

  private toResponse(session: ClassSessionWithSummaries): ClassSessionResponse {
    return {
      id: session.id,
      classScheduleId: session.classScheduleId,
      enrollmentId: session.enrollmentId,
      studentId: session.studentId,
      teacherId: session.teacherId,
      courseId: session.courseId,
      scheduledStartAt: session.scheduledStartAt,
      scheduledEndAt: session.scheduledEndAt,
      originalStartAt: session.originalStartAt,
      status: session.status,
      meetingProvider: session.meetingProvider,
      meetingUrl: session.meetingUrl,
      cancelledAt: session.cancelledAt,
      cancelledBy: session.cancelledBy,
      cancellationReason: session.cancellationReason,
      rescheduledFromId: session.rescheduledFromId,
      student: session.student,
      teacher: session.teacher,
      course: session.course,
    };
  }
}
