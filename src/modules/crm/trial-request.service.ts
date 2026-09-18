import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TrialRequest } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { ConvertTrialRequestDto, CreateTrialRequestDto, UpdateTrialRequestDto } from './dto/trial-request.dto';
import type { TrialRequestQueryDto } from './dto/trial-request-query.dto';
import type { TrialRequestResponse } from './interfaces/crm.interface';

const WITH_COURSE = { course: { select: { slug: true, name: true } } };
type TrialRequestWithCourse = TrialRequest & { course: { slug: string; name: string } };

@Injectable()
export class TrialRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTrialRequestDto): Promise<TrialRequestResponse> {
    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const trialRequest = await this.prisma.trialRequest.create({
      data: {
        studentName: dto.studentName,
        studentAge: dto.studentAge,
        guardianName: dto.guardianName,
        countryCode: dto.countryCode,
        whatsapp: dto.whatsapp,
        email: dto.email,
        phone: dto.phone,
        courseId: dto.courseId,
        preferredDays: dto.preferredDays,
        preferredTime: dto.preferredTime ? this.toTimeDate(dto.preferredTime) : undefined,
        timezone: dto.timezone,
        message: dto.message,
        specialRequirements: dto.specialRequirements,
        source: 'website',
      },
      include: WITH_COURSE,
    });

    return this.toResponse(trialRequest);
  }

  async list(query: TrialRequestQueryDto): Promise<PaginatedResult<TrialRequestResponse>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = { status: query.status, courseId: query.courseId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trialRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: WITH_COURSE,
      }),
      this.prisma.trialRequest.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(id: string): Promise<TrialRequestResponse> {
    const trialRequest = await this.findOrThrow(id);
    return this.toResponse(trialRequest);
  }

  async update(id: string, dto: UpdateTrialRequestDto): Promise<TrialRequestResponse> {
    await this.findOrThrow(id);
    const trialRequest = await this.prisma.trialRequest.update({
      where: { id },
      data: { status: dto.status, assignedAdminId: dto.assignedAdminId },
      include: WITH_COURSE,
    });
    return this.toResponse(trialRequest);
  }

  /**
   * Visitor -> Lead -> Trial -> Student -> Enrollment (SRS Section 55).
   * If no existing student is given, creates a managed student profile
   * from the trial's own info (same "no login of their own" pattern as
   * a parent adding a child - see ParentsService.addChild).
   */
  async convert(
    id: string,
    dto: ConvertTrialRequestDto,
    adminUserId: string,
  ): Promise<TrialRequestResponse> {
    const trialRequest = await this.findOrThrow(id);
    if (trialRequest.status === 'ENROLLED') {
      throw new BadRequestException('This trial request has already been converted');
    }

    const studentRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: ROLE_CODES.STUDENT },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      let studentProfileId = dto.studentProfileId;
      let convertedUserId: string;

      if (studentProfileId) {
        const existing = await tx.studentProfile.findUnique({ where: { id: studentProfileId } });
        if (!existing) {
          throw new NotFoundException('Student not found');
        }
        convertedUserId = existing.userId;
      } else {
        const user = await tx.user.create({
          data: { status: 'ACTIVE', roles: { create: { roleId: studentRole.id } } },
        });
        const profile = await tx.studentProfile.create({
          data: {
            userId: user.id,
            firstName: trialRequest.studentName,
            countryCode: trialRequest.countryCode,
            timezone: trialRequest.timezone,
          },
        });
        studentProfileId = profile.id;
        convertedUserId = user.id;
      }

      const enrollment = await tx.enrollment.create({
        data: {
          studentId: studentProfileId,
          courseId: trialRequest.courseId,
          status: 'TRIAL',
          studentTimezone: trialRequest.timezone,
          notes: `Converted from trial request ${trialRequest.id}`,
        },
      });

      return tx.trialRequest.update({
        where: { id },
        data: {
          status: 'ENROLLED',
          assignedAdminId: adminUserId,
          convertedUserId,
          convertedEnrollmentId: enrollment.id,
        },
        include: WITH_COURSE,
      });
    });

    return this.toResponse(result);
  }

  private async findOrThrow(id: string): Promise<TrialRequestWithCourse> {
    const trialRequest = await this.prisma.trialRequest.findUnique({
      where: { id },
      include: WITH_COURSE,
    });
    if (!trialRequest) {
      throw new NotFoundException('Trial request not found');
    }
    return trialRequest;
  }

  private toTimeDate(hhmm: string): Date {
    return new Date(`1970-01-01T${hhmm}:00.000Z`);
  }

  private toResponse(trialRequest: TrialRequestWithCourse): TrialRequestResponse {
    return {
      id: trialRequest.id,
      studentName: trialRequest.studentName,
      studentAge: trialRequest.studentAge,
      guardianName: trialRequest.guardianName,
      countryCode: trialRequest.countryCode,
      whatsapp: trialRequest.whatsapp,
      email: trialRequest.email,
      phone: trialRequest.phone,
      courseId: trialRequest.courseId,
      preferredDays: trialRequest.preferredDays,
      preferredTime: trialRequest.preferredTime
        ? trialRequest.preferredTime.toISOString().slice(11, 16)
        : null,
      timezone: trialRequest.timezone,
      message: trialRequest.message,
      specialRequirements: trialRequest.specialRequirements,
      status: trialRequest.status,
      assignedAdminId: trialRequest.assignedAdminId,
      convertedUserId: trialRequest.convertedUserId,
      convertedEnrollmentId: trialRequest.convertedEnrollmentId,
      source: trialRequest.source,
      createdAt: trialRequest.createdAt,
      updatedAt: trialRequest.updatedAt,
      course: trialRequest.course,
    };
  }
}
