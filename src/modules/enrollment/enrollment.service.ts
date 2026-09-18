import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Enrollment } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChangeEnrollmentStatusDto } from './dto/change-enrollment-status.dto';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import type { EnrollmentQueryDto } from './dto/enrollment-query.dto';
import type { ReassignTeacherDto } from './dto/reassign-teacher.dto';
import type { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import type { EnrollmentResponse } from './interfaces/enrollment.interface';

type EnrollmentStatus = 'TRIAL' | 'PENDING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

/**
 * PENDING -> ACTIVE -> PAUSED -> ACTIVE -> COMPLETED, PENDING -> CANCELLED,
 * TRIAL -> ACTIVE are the documented edges (architecture spec Section 9).
 * ACTIVE/PAUSED -> CANCELLED is added on top for real-world withdrawal;
 * COMPLETED/CANCELLED are terminal - nothing transitions out of them.
 */
const ALLOWED_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  TRIAL: ['ACTIVE', 'CANCELLED'],
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const WITH_SUMMARIES = {
  student: { select: { firstName: true, lastName: true } },
  course: { select: { slug: true, name: true } },
  teacher: { select: { firstName: true, lastName: true } },
};

type EnrollmentWithSummaries = Enrollment & {
  student: { firstName: string; lastName: string | null };
  course: { slug: string; name: string };
  teacher: { firstName: string; lastName: string } | null;
};

@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEnrollmentDto): Promise<EnrollmentResponse> {
    const student = await this.prisma.studentProfile.findUnique({ where: { id: dto.studentId } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (dto.teacherId) {
      await this.assertActiveTeacher(dto.teacherId);
    }

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.enrollment.create({
        data: {
          studentId: dto.studentId,
          courseId: dto.courseId,
          teacherId: dto.teacherId,
          status: dto.status ?? 'PENDING',
          studentTimezone: dto.studentTimezone,
          notes: dto.notes,
        },
        include: WITH_SUMMARIES,
      });

      if (dto.teacherId) {
        await tx.enrollmentTeacherAssignment.create({
          data: { enrollmentId: created.id, teacherId: dto.teacherId, reason: 'Initial assignment' },
        });
      }

      return created;
    });

    return this.toResponse(enrollment);
  }

  async list(query: EnrollmentQueryDto): Promise<PaginatedResult<EnrollmentResponse>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = {
      studentId: query.studentId,
      courseId: query.courseId,
      teacherId: query.teacherId,
      status: query.status,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: WITH_SUMMARIES,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(id: string): Promise<EnrollmentResponse> {
    const enrollment = await this.findOrThrow(id);
    return this.toResponse(enrollment);
  }

  async update(id: string, dto: UpdateEnrollmentDto): Promise<EnrollmentResponse> {
    await this.findOrThrow(id);
    const enrollment = await this.prisma.enrollment.update({
      where: { id },
      data: { studentTimezone: dto.studentTimezone, notes: dto.notes },
      include: WITH_SUMMARIES,
    });
    return this.toResponse(enrollment);
  }

  async changeStatus(id: string, dto: ChangeEnrollmentStatusDto): Promise<EnrollmentResponse> {
    const enrollment = await this.findOrThrow(id);
    const current = enrollment.status;
    const target = dto.status;

    if (!ALLOWED_TRANSITIONS[current].includes(target)) {
      throw new ConflictException(
        `Cannot transition enrollment from ${current} to ${target}. ` +
          `Valid next states: ${ALLOWED_TRANSITIONS[current].join(', ') || '(none - terminal state)'}`,
      );
    }

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: {
        status: target,
        startedAt: target === 'ACTIVE' && !enrollment.startedAt ? new Date() : undefined,
        endedAt: target === 'COMPLETED' || target === 'CANCELLED' ? new Date() : undefined,
        notes: dto.reason ? this.appendNote(enrollment.notes, dto.reason) : undefined,
      },
      include: WITH_SUMMARIES,
    });

    return this.toResponse(updated);
  }

  async reassignTeacher(id: string, dto: ReassignTeacherDto): Promise<EnrollmentResponse> {
    const enrollment = await this.findOrThrow(id);

    if (enrollment.status === 'COMPLETED' || enrollment.status === 'CANCELLED') {
      throw new BadRequestException('Cannot reassign a teacher on a completed or cancelled enrollment');
    }
    if (enrollment.teacherId === dto.teacherId) {
      throw new BadRequestException('This teacher is already assigned to the enrollment');
    }

    await this.assertActiveTeacher(dto.teacherId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (enrollment.teacherId) {
        await tx.enrollmentTeacherAssignment.updateMany({
          where: { enrollmentId: id, teacherId: enrollment.teacherId, endedAt: null },
          data: { endedAt: new Date() },
        });
      }

      await tx.enrollmentTeacherAssignment.create({
        data: { enrollmentId: id, teacherId: dto.teacherId, reason: dto.reason },
      });

      return tx.enrollment.update({
        where: { id },
        data: { teacherId: dto.teacherId },
        include: WITH_SUMMARIES,
      });
    });

    return this.toResponse(updated);
  }

  async listOwnForStudent(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<EnrollmentResponse>> {
    const studentId = await this.studentIdForUser(userId);
    return this.listForStudentId(studentId, page, limit);
  }

  async getOwnForStudent(userId: string, id: string): Promise<EnrollmentResponse> {
    const studentId = await this.studentIdForUser(userId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, studentId },
      include: WITH_SUMMARIES,
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.toResponse(enrollment);
  }

  async listForChild(
    parentUserId: string,
    studentId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<EnrollmentResponse>> {
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

    return this.listForStudentId(studentId, page, limit);
  }

  private async listForStudentId(
    studentId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<EnrollmentResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const where = { studentId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: WITH_SUMMARIES,
      }),
      this.prisma.enrollment.count({ where }),
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

  private async assertActiveTeacher(teacherId: string): Promise<void> {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    if (teacher.status !== 'ACTIVE') {
      throw new BadRequestException('Teacher is not active');
    }
  }

  private async findOrThrow(id: string): Promise<EnrollmentWithSummaries> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: WITH_SUMMARIES,
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }

  private appendNote(existing: string | null, addition: string): string {
    return existing ? `${existing}\n${addition}` : addition;
  }

  private toResponse(enrollment: EnrollmentWithSummaries): EnrollmentResponse {
    return {
      id: enrollment.id,
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
      teacherId: enrollment.teacherId,
      status: enrollment.status,
      startedAt: enrollment.startedAt,
      endedAt: enrollment.endedAt,
      studentTimezone: enrollment.studentTimezone,
      notes: enrollment.notes,
      createdAt: enrollment.createdAt,
      updatedAt: enrollment.updatedAt,
      student: enrollment.student,
      course: enrollment.course,
      teacher: enrollment.teacher,
    };
  }
}
