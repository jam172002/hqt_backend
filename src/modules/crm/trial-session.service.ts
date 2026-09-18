import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TrialSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ScheduleTrialSessionDto, UpdateTrialSessionDto } from './dto/trial-session.dto';
import type { TrialSessionResponse } from './interfaces/crm.interface';

@Injectable()
export class TrialSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async schedule(
    trialRequestId: string,
    dto: ScheduleTrialSessionDto,
  ): Promise<TrialSessionResponse> {
    const trialRequest = await this.prisma.trialRequest.findUnique({
      where: { id: trialRequestId },
    });
    if (!trialRequest) {
      throw new NotFoundException('Trial request not found');
    }

    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);
    if (start >= end) {
      throw new BadRequestException('scheduledStartAt must be before scheduledEndAt');
    }

    if (dto.teacherId) {
      const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: dto.teacherId } });
      if (!teacher || teacher.status !== 'ACTIVE') {
        throw new BadRequestException('Teacher not found or not active');
      }
    }

    const [session] = await this.prisma.$transaction([
      this.prisma.trialSession.create({
        data: {
          trialRequestId,
          teacherId: dto.teacherId,
          courseId: trialRequest.courseId,
          scheduledStartAt: start,
          scheduledEndAt: end,
          timezone: dto.timezone,
          meetingProvider: 'MANUAL',
        },
      }),
      this.prisma.trialRequest.update({
        where: { id: trialRequestId },
        data: { status: 'TRIAL_SCHEDULED' },
      }),
    ]);

    return this.toResponse(session);
  }

  async listForTrialRequest(trialRequestId: string): Promise<TrialSessionResponse[]> {
    const sessions = await this.prisma.trialSession.findMany({
      where: { trialRequestId },
      orderBy: { scheduledStartAt: 'desc' },
    });
    return sessions.map((session) => this.toResponse(session));
  }

  async update(id: string, dto: UpdateTrialSessionDto): Promise<TrialSessionResponse> {
    const session = await this.prisma.trialSession.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException('Trial session not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.trialSession.update({
        where: { id },
        data: { status: dto.status, notes: dto.notes },
      });

      if (dto.status === 'COMPLETED') {
        await tx.trialRequest.update({
          where: { id: session.trialRequestId },
          data: { status: 'TRIAL_COMPLETED' },
        });
      }

      return saved;
    });

    return this.toResponse(updated);
  }

  private toResponse(session: TrialSession): TrialSessionResponse {
    return {
      id: session.id,
      trialRequestId: session.trialRequestId,
      teacherId: session.teacherId,
      courseId: session.courseId,
      scheduledStartAt: session.scheduledStartAt,
      scheduledEndAt: session.scheduledEndAt,
      timezone: session.timezone,
      status: session.status,
      notes: session.notes,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
