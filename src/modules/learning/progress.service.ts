import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProgressHistory, StudentProgress } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { UpdateProgressDto } from './dto/progress.dto';
import type { ProgressHistoryEntryResponse, StudentProgressResponse } from './interfaces/learning.interface';
import { LearningAccessService } from './learning-access.service';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LearningAccessService,
  ) {}

  async getForEnrollment(
    user: AuthenticatedUser,
    enrollmentId: string,
  ): Promise<StudentProgressResponse> {
    const enrollment = await this.enrollmentOrThrow(enrollmentId);
    await this.assertCanView(user, enrollment);

    const progress = await this.prisma.studentProgress.findUnique({ where: { enrollmentId } });
    if (!progress) {
      throw new NotFoundException('No progress has been recorded for this enrollment yet');
    }
    return this.toResponse(progress);
  }

  async getHistoryForEnrollment(
    user: AuthenticatedUser,
    enrollmentId: string,
  ): Promise<ProgressHistoryEntryResponse[]> {
    const enrollment = await this.enrollmentOrThrow(enrollmentId);
    await this.assertCanView(user, enrollment);

    const history = await this.prisma.progressHistory.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: 'desc' },
    });
    return history.map((entry) => this.toHistoryResponse(entry));
  }

  /** Upserts current progress and appends a history snapshot in one transaction. */
  async update(
    user: AuthenticatedUser,
    enrollmentId: string,
    dto: UpdateProgressDto,
  ): Promise<StudentProgressResponse> {
    const enrollment = await this.enrollmentOrThrow(enrollmentId);
    if (!enrollment.teacherId) {
      throw new NotFoundException('Enrollment has no teacher assigned yet');
    }
    await this.access.assertIsAssignedTeacher(user, enrollment.teacherId);

    const teacher = await this.prisma.teacherProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });

    const progress = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.studentProgress.upsert({
        where: { enrollmentId },
        update: {
          currentLesson: dto.currentLesson,
          currentSurah: dto.currentSurah,
          currentAyah: dto.currentAyah,
          tajweedProgress: dto.tajweedProgress,
          hifzProgress: dto.hifzProgress,
          performance: dto.performance,
          remarks: dto.remarks,
          updatedByTeacherId: teacher.id,
        },
        create: {
          enrollmentId,
          currentLesson: dto.currentLesson,
          currentSurah: dto.currentSurah,
          currentAyah: dto.currentAyah,
          tajweedProgress: dto.tajweedProgress,
          hifzProgress: dto.hifzProgress,
          performance: dto.performance,
          remarks: dto.remarks,
          updatedByTeacherId: teacher.id,
        },
      });

      await tx.progressHistory.create({
        data: {
          studentProgressId: saved.id,
          enrollmentId,
          currentLesson: saved.currentLesson,
          currentSurah: saved.currentSurah,
          currentAyah: saved.currentAyah,
          tajweedProgress: saved.tajweedProgress,
          hifzProgress: saved.hifzProgress,
          performance: saved.performance,
          remarks: saved.remarks,
          changedByTeacherId: teacher.id,
        },
      });

      return saved;
    });

    return this.toResponse(progress);
  }

  private async enrollmentOrThrow(
    id: string,
  ): Promise<{ id: string; studentId: string; teacherId: string | null }> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      select: { id: true, studentId: true, teacherId: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }

  /**
   * Same as LearningAccessService.assertCanAccess, except a linked
   * parent additionally needs canViewProgress on the relationship - the
   * one flag on ParentStudentRelationship that maps directly to a
   * specific piece of data (progress), so it's checked here rather than
   * in the generic helper.
   */
  private async assertCanView(
    user: AuthenticatedUser,
    enrollment: { studentId: string; teacherId: string | null },
  ): Promise<void> {
    if (user.roles.includes(ROLE_CODES.ADMIN) || user.roles.includes(ROLE_CODES.SUPER_ADMIN)) {
      return;
    }
    if (user.roles.includes(ROLE_CODES.TEACHER) && enrollment.teacherId) {
      const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
      if (teacher?.id === enrollment.teacherId) return;
    }
    if (user.roles.includes(ROLE_CODES.STUDENT)) {
      const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
      if (student?.id === enrollment.studentId) return;
    }
    if (user.roles.includes(ROLE_CODES.PARENT)) {
      const parent = await this.prisma.parentProfile.findUnique({ where: { userId: user.id } });
      if (parent) {
        const link = await this.prisma.parentStudentRelationship.findUnique({
          where: { parentId_studentId: { parentId: parent.id, studentId: enrollment.studentId } },
        });
        if (link?.canViewProgress) return;
      }
    }
    throw new NotFoundException('Progress not found');
  }

  private toResponse(progress: StudentProgress): StudentProgressResponse {
    return {
      id: progress.id,
      enrollmentId: progress.enrollmentId,
      currentLesson: progress.currentLesson,
      currentSurah: progress.currentSurah,
      currentAyah: progress.currentAyah,
      tajweedProgress: progress.tajweedProgress ? Number(progress.tajweedProgress) : null,
      hifzProgress: progress.hifzProgress ? Number(progress.hifzProgress) : null,
      performance: progress.performance ? Number(progress.performance) : null,
      remarks: progress.remarks,
      updatedByTeacherId: progress.updatedByTeacherId,
      createdAt: progress.createdAt,
      updatedAt: progress.updatedAt,
    };
  }

  private toHistoryResponse(entry: ProgressHistory): ProgressHistoryEntryResponse {
    return {
      id: entry.id,
      currentLesson: entry.currentLesson,
      currentSurah: entry.currentSurah,
      currentAyah: entry.currentAyah,
      tajweedProgress: entry.tajweedProgress ? Number(entry.tajweedProgress) : null,
      hifzProgress: entry.hifzProgress ? Number(entry.hifzProgress) : null,
      performance: entry.performance ? Number(entry.performance) : null,
      remarks: entry.remarks,
      changedByTeacherId: entry.changedByTeacherId,
      createdAt: entry.createdAt,
    };
  }
}
