import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * Shared resource-ownership checks for the Learning domain (architecture
 * spec Section 15: role checks alone are not sufficient). Used by
 * attendance, lesson, homework, and progress services, all of which need
 * the same "admin, or the assigned teacher, or the owning student, or a
 * linked parent" rule. Throws NotFoundException rather than Forbidden so
 * unauthorized callers can't distinguish "not yours" from "doesn't exist".
 */
@Injectable()
export class LearningAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAccess(
    user: AuthenticatedUser,
    resource: { studentId: string; teacherId?: string },
  ): Promise<void> {
    if (user.roles.includes(ROLE_CODES.ADMIN) || user.roles.includes(ROLE_CODES.SUPER_ADMIN)) {
      return;
    }

    if (user.roles.includes(ROLE_CODES.TEACHER) && resource.teacherId) {
      const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
      if (teacher?.id === resource.teacherId) {
        return;
      }
    }

    if (user.roles.includes(ROLE_CODES.STUDENT)) {
      const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
      if (student?.id === resource.studentId) {
        return;
      }
    }

    if (user.roles.includes(ROLE_CODES.PARENT)) {
      const parent = await this.prisma.parentProfile.findUnique({ where: { userId: user.id } });
      if (parent) {
        const link = await this.prisma.parentStudentRelationship.findUnique({
          where: { parentId_studentId: { parentId: parent.id, studentId: resource.studentId } },
        });
        if (link) {
          return;
        }
      }
    }

    throw new NotFoundException('Resource not found');
  }

  /** For teacher-only mutation endpoints (mark attendance, write a lesson record, assign homework). */
  async assertIsAssignedTeacher(user: AuthenticatedUser, teacherId: string): Promise<void> {
    if (user.roles.includes(ROLE_CODES.ADMIN) || user.roles.includes(ROLE_CODES.SUPER_ADMIN)) {
      return;
    }
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
    if (teacher?.id !== teacherId) {
      throw new NotFoundException('Resource not found');
    }
  }
}
