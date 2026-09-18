import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AttendanceRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { MarkAttendanceDto } from './dto/attendance.dto';
import type { AttendanceRecordResponse } from './interfaces/learning.interface';
import { LearningAccessService } from './learning-access.service';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LearningAccessService,
  ) {}

  async mark(
    user: AuthenticatedUser,
    classSessionId: string,
    dto: MarkAttendanceDto,
  ): Promise<AttendanceRecordResponse> {
    const session = await this.prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    await this.access.assertIsAssignedTeacher(user, session.teacherId);

    const teacher = await this.prisma.teacherProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { classSessionId },
    });
    if (existing) {
      throw new ConflictException('Attendance has already been marked for this session');
    }

    const record = await this.prisma.attendanceRecord.create({
      data: {
        classSessionId,
        studentId: session.studentId,
        status: dto.status,
        markedByTeacherId: teacher.id,
        notes: dto.notes,
      },
    });

    return this.toResponse(record);
  }

  async update(
    user: AuthenticatedUser,
    classSessionId: string,
    dto: MarkAttendanceDto,
  ): Promise<AttendanceRecordResponse> {
    const session = await this.prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    await this.access.assertIsAssignedTeacher(user, session.teacherId);

    const existing = await this.prisma.attendanceRecord.findUnique({ where: { classSessionId } });
    if (!existing) {
      throw new NotFoundException('No attendance record exists for this session yet');
    }

    const record = await this.prisma.attendanceRecord.update({
      where: { classSessionId },
      data: { status: dto.status, notes: dto.notes },
    });
    return this.toResponse(record);
  }

  async getForSession(
    user: AuthenticatedUser,
    classSessionId: string,
  ): Promise<AttendanceRecordResponse> {
    const session = await this.prisma.classSession.findUnique({ where: { id: classSessionId } });
    if (!session) {
      throw new NotFoundException('Class session not found');
    }
    await this.access.assertCanAccess(user, session);

    const record = await this.prisma.attendanceRecord.findUnique({ where: { classSessionId } });
    if (!record) {
      throw new NotFoundException('No attendance record exists for this session yet');
    }
    return this.toResponse(record);
  }

  private toResponse(record: AttendanceRecord): AttendanceRecordResponse {
    return {
      id: record.id,
      classSessionId: record.classSessionId,
      studentId: record.studentId,
      status: record.status,
      markedByTeacherId: record.markedByTeacherId,
      markedAt: record.markedAt,
      notes: record.notes,
    };
  }
}
