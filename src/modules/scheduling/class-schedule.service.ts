import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClassSchedule } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import type { CreateClassScheduleDto, UpdateClassScheduleDto } from './dto/class-schedule.dto';
import type { ClassScheduleResponse, ClassSessionResponse } from './interfaces/scheduling.interface';

const WITH_SUMMARIES = {
  student: { select: { firstName: true, lastName: true } },
  teacher: { select: { firstName: true, lastName: true } },
  course: { select: { slug: true, name: true } },
};

type ClassScheduleWithSummaries = ClassSchedule & {
  student: { firstName: string; lastName: string | null };
  teacher: { firstName: string; lastName: string };
  course: { slug: string; name: string };
};

@Injectable()
export class ClassScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClassScheduleDto): Promise<ClassScheduleResponse> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: dto.enrollmentId } });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (!enrollment.teacherId) {
      throw new BadRequestException('Enrollment has no teacher assigned yet - assign one first');
    }
    if (enrollment.status === 'COMPLETED' || enrollment.status === 'CANCELLED') {
      throw new BadRequestException('Cannot schedule classes for a completed or cancelled enrollment');
    }

    const schedule = await this.prisma.classSchedule.create({
      data: {
        enrollmentId: dto.enrollmentId,
        studentId: enrollment.studentId,
        teacherId: enrollment.teacherId,
        courseId: enrollment.courseId,
        dayOfWeek: dto.dayOfWeek,
        localStartTime: this.toTimeDate(dto.localStartTime),
        durationMinutes: dto.durationMinutes,
        timezone: dto.timezone,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
      },
      include: WITH_SUMMARIES,
    });

    return this.toResponse(schedule);
  }

  async list(query: PaginationQueryDto): Promise<PaginatedResult<ClassScheduleResponse>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.classSchedule.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: WITH_SUMMARIES,
      }),
      this.prisma.classSchedule.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(id: string): Promise<ClassScheduleResponse> {
    const schedule = await this.findOrThrow(id);
    return this.toResponse(schedule);
  }

  async update(id: string, dto: UpdateClassScheduleDto): Promise<ClassScheduleResponse> {
    await this.findOrThrow(id);
    const schedule = await this.prisma.classSchedule.update({
      where: { id },
      data: {
        dayOfWeek: dto.dayOfWeek,
        localStartTime: dto.localStartTime ? this.toTimeDate(dto.localStartTime) : undefined,
        durationMinutes: dto.durationMinutes,
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
        status: dto.status,
      },
      include: WITH_SUMMARIES,
    });
    return this.toResponse(schedule);
  }

  /**
   * Resolves the recurring local weekday/time into concrete UTC session
   * instants (architecture spec Section 8: "resolve the recurring
   * schedule in its IANA timezone, calculate the UTC instant, and persist
   * the occurrence"). Idempotent - re-running over an overlapping range
   * skips dates that already have a session.
   */
  async generateSessions(
    id: string,
    from: string,
    to: string,
  ): Promise<ClassSessionResponse[]> {
    const schedule = await this.findOrThrow(id);
    if (schedule.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot generate sessions for a non-active schedule');
    }

    const rangeStart = DateTime.fromISO(from, { zone: schedule.timezone }).startOf('day');
    const rangeEnd = DateTime.fromISO(to, { zone: schedule.timezone }).endOf('day');
    if (!rangeStart.isValid || !rangeEnd.isValid || rangeStart > rangeEnd) {
      throw new BadRequestException('Invalid date range');
    }

    const effectiveFrom = DateTime.fromJSDate(schedule.effectiveFrom, { zone: schedule.timezone });
    const effectiveUntil = schedule.effectiveUntil
      ? DateTime.fromJSDate(schedule.effectiveUntil, { zone: schedule.timezone })
      : null;

    const localTime = DateTime.fromJSDate(schedule.localStartTime, { zone: 'utc' });

    const candidates: DateTime[] = [];
    for (let day = rangeStart; day <= rangeEnd; day = day.plus({ days: 1 })) {
      const isTargetWeekday = day.weekday % 7 === schedule.dayOfWeek;
      const isWithinEffectiveRange =
        day >= effectiveFrom.startOf('day') && (!effectiveUntil || day <= effectiveUntil.endOf('day'));
      if (isTargetWeekday && isWithinEffectiveRange) {
        candidates.push(
          day.set({ hour: localTime.hour, minute: localTime.minute, second: 0, millisecond: 0 }),
        );
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    const existing = await this.prisma.classSession.findMany({
      where: {
        classScheduleId: id,
        scheduledStartAt: { gte: candidates[0].toUTC().toJSDate(), lte: candidates[candidates.length - 1].toUTC().toJSDate() },
      },
      select: { scheduledStartAt: true },
    });
    const existingTimes = new Set(existing.map((session) => session.scheduledStartAt.getTime()));

    const toCreate = candidates
      .map((local) => local.toUTC())
      .filter((utc) => !existingTimes.has(utc.toJSDate().getTime()));

    if (toCreate.length === 0) {
      return [];
    }

    await this.prisma.classSession.createMany({
      data: toCreate.map((utc) => ({
        classScheduleId: id,
        enrollmentId: schedule.enrollmentId,
        studentId: schedule.studentId,
        teacherId: schedule.teacherId,
        courseId: schedule.courseId,
        scheduledStartAt: utc.toJSDate(),
        scheduledEndAt: utc.plus({ minutes: schedule.durationMinutes }).toJSDate(),
        status: 'SCHEDULED',
        meetingProvider: 'MANUAL',
      })),
    });

    const created = await this.prisma.classSession.findMany({
      where: {
        classScheduleId: id,
        scheduledStartAt: { in: toCreate.map((utc) => utc.toJSDate()) },
      },
      include: WITH_SUMMARIES,
      orderBy: { scheduledStartAt: 'asc' },
    });

    return created.map((session) => ({
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
    }));
  }

  private async findOrThrow(id: string): Promise<ClassScheduleWithSummaries> {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id },
      include: WITH_SUMMARIES,
    });
    if (!schedule) {
      throw new NotFoundException('Class schedule not found');
    }
    return schedule;
  }

  private toTimeDate(hhmm: string): Date {
    return new Date(`1970-01-01T${hhmm}:00.000Z`);
  }

  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  private toResponse(schedule: ClassScheduleWithSummaries): ClassScheduleResponse {
    return {
      id: schedule.id,
      enrollmentId: schedule.enrollmentId,
      studentId: schedule.studentId,
      teacherId: schedule.teacherId,
      courseId: schedule.courseId,
      timezone: schedule.timezone,
      dayOfWeek: schedule.dayOfWeek,
      localStartTime: this.formatTime(schedule.localStartTime),
      durationMinutes: schedule.durationMinutes,
      effectiveFrom: schedule.effectiveFrom.toISOString().slice(0, 10),
      effectiveUntil: schedule.effectiveUntil ? schedule.effectiveUntil.toISOString().slice(0, 10) : null,
      status: schedule.status,
      student: schedule.student,
      teacher: schedule.teacher,
      course: schedule.course,
    };
  }
}
