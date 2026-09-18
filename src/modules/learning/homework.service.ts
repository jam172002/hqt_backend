import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Homework, HomeworkSubmission } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type {
  CreateHomeworkDto,
  ReviewHomeworkSubmissionDto,
  SubmitHomeworkDto,
  UpdateHomeworkDto,
} from './dto/homework.dto';
import type { HomeworkResponse, HomeworkSubmissionResponse } from './interfaces/learning.interface';
import { LearningAccessService } from './learning-access.service';

const WITH_SUBMISSIONS = { submissions: { orderBy: { submittedAt: 'desc' as const } } };

type HomeworkWithSubmissions = Homework & { submissions: HomeworkSubmission[] };

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LearningAccessService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateHomeworkDto): Promise<HomeworkResponse> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: dto.enrollmentId } });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (!enrollment.teacherId) {
      throw new BadRequestException('Enrollment has no teacher assigned yet');
    }
    await this.access.assertIsAssignedTeacher(user, enrollment.teacherId);

    const homework = await this.prisma.homework.create({
      data: {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        teacherId: enrollment.teacherId,
        classSessionId: dto.classSessionId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: WITH_SUBMISSIONS,
    });

    return this.toResponse(homework);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateHomeworkDto,
  ): Promise<HomeworkResponse> {
    const homework = await this.findOrThrow(id);
    await this.access.assertIsAssignedTeacher(user, homework.teacherId);

    const updated = await this.prisma.homework.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: dto.status,
      },
      include: WITH_SUBMISSIONS,
    });
    return this.toResponse(updated);
  }

  async getById(user: AuthenticatedUser, id: string): Promise<HomeworkResponse> {
    const homework = await this.findOrThrow(id);
    await this.access.assertCanAccess(user, homework);
    return this.toResponse(homework);
  }

  async listForTeacher(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<HomeworkResponse>> {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher) {
      throw new NotFoundException('No teacher profile exists for this account yet');
    }
    return this.listForFilter({ teacherId: teacher.id }, page, limit);
  }

  async listForStudent(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<HomeworkResponse>> {
    const student = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) {
      throw new NotFoundException('No student profile exists for this account yet');
    }
    return this.listForFilter({ studentId: student.id }, page, limit);
  }

  async listForChild(
    parentUserId: string,
    studentId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<HomeworkResponse>> {
    const parent = await this.prisma.parentProfile.findUnique({ where: { userId: parentUserId } });
    if (!parent) {
      throw new NotFoundException('No parent profile exists for this account yet');
    }
    const link = await this.prisma.parentStudentRelationship.findUnique({
      where: { parentId_studentId: { parentId: parent.id, studentId } },
    });
    if (!link) {
      throw new NotFoundException('Student not found');
    }
    return this.listForFilter({ studentId }, page, limit);
  }

  async submit(
    user: AuthenticatedUser,
    homeworkId: string,
    dto: SubmitHomeworkDto,
  ): Promise<HomeworkSubmissionResponse> {
    const homework = await this.findOrThrow(homeworkId);

    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
    if (student?.id !== homework.studentId) {
      throw new NotFoundException('Homework not found');
    }

    if (homework.status === 'COMPLETED') {
      throw new BadRequestException('This homework has already been completed');
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.homeworkSubmission.create({
        data: { homeworkId, studentId: homework.studentId, content: dto.content },
      });
      await tx.homework.update({ where: { id: homeworkId }, data: { status: 'SUBMITTED' } });
      return created;
    });

    return this.toSubmissionResponse(submission);
  }

  async reviewSubmission(
    user: AuthenticatedUser,
    submissionId: string,
    dto: ReviewHomeworkSubmissionDto,
  ): Promise<HomeworkSubmissionResponse> {
    const submission = await this.prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: { homework: true },
    });
    if (!submission) {
      throw new NotFoundException('Homework submission not found');
    }
    await this.access.assertIsAssignedTeacher(user, submission.homework.teacherId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSubmission = await tx.homeworkSubmission.update({
        where: { id: submissionId },
        data: {
          status: dto.status,
          teacherFeedback: dto.teacherFeedback,
          reviewedAt: new Date(),
        },
      });
      await tx.homework.update({
        where: { id: submission.homeworkId },
        data: { status: dto.status === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS' },
      });
      return updatedSubmission;
    });

    return this.toSubmissionResponse(updated);
  }

  private async listForFilter(
    where: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<HomeworkResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.homework.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: WITH_SUBMISSIONS,
      }),
      this.prisma.homework.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async findOrThrow(id: string): Promise<HomeworkWithSubmissions> {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: WITH_SUBMISSIONS,
    });
    if (!homework) {
      throw new NotFoundException('Homework not found');
    }
    return homework;
  }

  private toResponse(homework: HomeworkWithSubmissions): HomeworkResponse {
    return {
      id: homework.id,
      enrollmentId: homework.enrollmentId,
      studentId: homework.studentId,
      teacherId: homework.teacherId,
      classSessionId: homework.classSessionId,
      title: homework.title,
      description: homework.description,
      dueAt: homework.dueAt,
      status: homework.status,
      createdAt: homework.createdAt,
      updatedAt: homework.updatedAt,
      submissions: homework.submissions.map((submission) => this.toSubmissionResponse(submission)),
    };
  }

  private toSubmissionResponse(submission: HomeworkSubmission): HomeworkSubmissionResponse {
    return {
      id: submission.id,
      homeworkId: submission.homeworkId,
      studentId: submission.studentId,
      submittedAt: submission.submittedAt,
      content: submission.content,
      status: submission.status,
      teacherFeedback: submission.teacherFeedback,
      reviewedAt: submission.reviewedAt,
    };
  }
}
