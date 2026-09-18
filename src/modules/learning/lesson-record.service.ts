import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LessonRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { UpsertLessonRecordDto } from './dto/lesson-record.dto';
import type { LessonRecordResponse } from './interfaces/learning.interface';
import { LearningAccessService } from './learning-access.service';

@Injectable()
export class LessonRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LearningAccessService,
  ) {}

  async create(
    user: AuthenticatedUser,
    classSessionId: string,
    dto: UpsertLessonRecordDto,
  ): Promise<LessonRecordResponse> {
    const session = await this.prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    await this.access.assertIsAssignedTeacher(user, session.teacherId);

    const existing = await this.prisma.lessonRecord.findUnique({ where: { classSessionId } });
    if (existing) {
      throw new ConflictException('A lesson record already exists for this session');
    }

    const record = await this.prisma.lessonRecord.create({
      data: {
        classSessionId,
        studentId: session.studentId,
        teacherId: session.teacherId,
        enrollmentId: session.enrollmentId,
        title: dto.title,
        content: dto.content,
        teacherNotes: dto.teacherNotes,
        performanceRating: dto.performanceRating,
        generalRemarks: dto.generalRemarks,
      },
    });

    return this.toResponse(record);
  }

  async update(
    user: AuthenticatedUser,
    classSessionId: string,
    dto: UpsertLessonRecordDto,
  ): Promise<LessonRecordResponse> {
    const session = await this.prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    await this.access.assertIsAssignedTeacher(user, session.teacherId);

    const existing = await this.prisma.lessonRecord.findUnique({ where: { classSessionId } });
    if (!existing) {
      throw new NotFoundException('No lesson record exists for this session yet');
    }

    const record = await this.prisma.lessonRecord.update({
      where: { classSessionId },
      data: {
        title: dto.title,
        content: dto.content,
        teacherNotes: dto.teacherNotes,
        performanceRating: dto.performanceRating,
        generalRemarks: dto.generalRemarks,
      },
    });
    return this.toResponse(record);
  }

  async getForSession(
    user: AuthenticatedUser,
    classSessionId: string,
  ): Promise<LessonRecordResponse> {
    const session = await this.prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    await this.access.assertCanAccess(user, session);

    const record = await this.prisma.lessonRecord.findUnique({ where: { classSessionId } });
    if (!record) {
      throw new NotFoundException('No lesson record exists for this session yet');
    }
    return this.toResponse(record);
  }

  private toResponse(record: LessonRecord): LessonRecordResponse {
    return {
      id: record.id,
      classSessionId: record.classSessionId,
      studentId: record.studentId,
      teacherId: record.teacherId,
      enrollmentId: record.enrollmentId,
      title: record.title,
      content: record.content,
      teacherNotes: record.teacherNotes,
      performanceRating: record.performanceRating ? Number(record.performanceRating) : null,
      generalRemarks: record.generalRemarks,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
