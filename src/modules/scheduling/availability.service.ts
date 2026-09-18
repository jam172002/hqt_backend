import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TeacherAvailabilityException, TeacherAvailabilityRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateAvailabilityExceptionDto } from './dto/availability-exception.dto';
import type {
  CreateAvailabilityRuleDto,
  UpdateAvailabilityRuleDto,
} from './dto/availability-rule.dto';
import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
} from './interfaces/scheduling.interface';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async addRule(
    teacherUserId: string,
    dto: CreateAvailabilityRuleDto,
  ): Promise<AvailabilityRuleResponse> {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    const teacherId = await this.teacherIdForUser(teacherUserId);
    const rule = await this.prisma.teacherAvailabilityRule.create({
      data: {
        teacherId,
        dayOfWeek: dto.dayOfWeek,
        startTime: this.toTimeDate(dto.startTime),
        endTime: this.toTimeDate(dto.endTime),
        timezone: dto.timezone,
      },
    });

    return this.toRuleResponse(rule);
  }

  async listOwnRules(teacherUserId: string): Promise<AvailabilityRuleResponse[]> {
    const teacherId = await this.teacherIdForUser(teacherUserId);
    const rules = await this.prisma.teacherAvailabilityRule.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return rules.map((rule) => this.toRuleResponse(rule));
  }

  async updateRule(
    teacherUserId: string,
    ruleId: string,
    dto: UpdateAvailabilityRuleDto,
  ): Promise<AvailabilityRuleResponse> {
    const teacherId = await this.teacherIdForUser(teacherUserId);
    const rule = await this.prisma.teacherAvailabilityRule.findFirst({
      where: { id: ruleId, teacherId },
    });
    if (!rule) {
      throw new NotFoundException('Availability rule not found');
    }

    const updated = await this.prisma.teacherAvailabilityRule.update({
      where: { id: ruleId },
      data: { isActive: dto.isActive },
    });
    return this.toRuleResponse(updated);
  }

  async removeRule(teacherUserId: string, ruleId: string): Promise<void> {
    const teacherId = await this.teacherIdForUser(teacherUserId);
    const rule = await this.prisma.teacherAvailabilityRule.findFirst({
      where: { id: ruleId, teacherId },
    });
    if (!rule) {
      throw new NotFoundException('Availability rule not found');
    }
    await this.prisma.teacherAvailabilityRule.delete({ where: { id: ruleId } });
  }

  async addException(
    teacherUserId: string,
    dto: CreateAvailabilityExceptionDto,
  ): Promise<AvailabilityExceptionResponse> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }

    const teacherId = await this.teacherIdForUser(teacherUserId);
    const exception = await this.prisma.teacherAvailabilityException.create({
      data: { teacherId, startsAt, endsAt, type: dto.type, reason: dto.reason },
    });
    return this.toExceptionResponse(exception);
  }

  async listOwnExceptions(teacherUserId: string): Promise<AvailabilityExceptionResponse[]> {
    const teacherId = await this.teacherIdForUser(teacherUserId);
    const exceptions = await this.prisma.teacherAvailabilityException.findMany({
      where: { teacherId },
      orderBy: { startsAt: 'asc' },
    });
    return exceptions.map((exception) => this.toExceptionResponse(exception));
  }

  async removeException(teacherUserId: string, exceptionId: string): Promise<void> {
    const teacherId = await this.teacherIdForUser(teacherUserId);
    const exception = await this.prisma.teacherAvailabilityException.findFirst({
      where: { id: exceptionId, teacherId },
    });
    if (!exception) {
      throw new NotFoundException('Availability exception not found');
    }
    await this.prisma.teacherAvailabilityException.delete({ where: { id: exceptionId } });
  }

  async adminGetTeacherAvailability(teacherId: string): Promise<{
    rules: AvailabilityRuleResponse[];
    exceptions: AvailabilityExceptionResponse[];
  }> {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const [rules, exceptions] = await this.prisma.$transaction([
      this.prisma.teacherAvailabilityRule.findMany({
        where: { teacherId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.teacherAvailabilityException.findMany({
        where: { teacherId },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    return {
      rules: rules.map((rule) => this.toRuleResponse(rule)),
      exceptions: exceptions.map((exception) => this.toExceptionResponse(exception)),
    };
  }

  private async teacherIdForUser(userId: string): Promise<string> {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No teacher profile exists for this account yet');
    }
    return profile.id;
  }

  /** Stores a "HH:mm" wall-clock time using Postgres TIME (Prisma requires a Date carrier, year/month/day are ignored). */
  private toTimeDate(hhmm: string): Date {
    return new Date(`1970-01-01T${hhmm}:00.000Z`);
  }

  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  private toRuleResponse(rule: TeacherAvailabilityRule): AvailabilityRuleResponse {
    return {
      id: rule.id,
      dayOfWeek: rule.dayOfWeek,
      startTime: this.formatTime(rule.startTime),
      endTime: this.formatTime(rule.endTime),
      timezone: rule.timezone,
      isActive: rule.isActive,
    };
  }

  private toExceptionResponse(
    exception: TeacherAvailabilityException,
  ): AvailabilityExceptionResponse {
    return {
      id: exception.id,
      startsAt: exception.startsAt,
      endsAt: exception.endsAt,
      type: exception.type,
      reason: exception.reason,
    };
  }
}
