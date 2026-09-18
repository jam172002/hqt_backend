import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StudentProfile } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../../common/pagination/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AdminUpdateStudentDto } from './dto/admin-update-student.dto';
import type { CreateStudentProfileDto } from './dto/create-student-profile.dto';
import type { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import type { StudentProfileResponse } from './interfaces/student-profile.interface';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOwnProfile(
    userId: string,
    dto: CreateStudentProfileDto,
  ): Promise<StudentProfileResponse> {
    const existing = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException('A student profile already exists for this account');
    }

    const profile = await this.prisma.studentProfile.create({
      data: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  async getOwnProfile(userId: string): Promise<StudentProfileResponse> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No student profile exists for this account yet');
    }
    return this.toResponse(profile);
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateStudentProfileDto,
  ): Promise<StudentProfileResponse> {
    const existing = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!existing) {
      throw new NotFoundException('No student profile exists for this account yet');
    }

    const profile = await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  async getById(id: string): Promise<StudentProfileResponse> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException('Student not found');
    }
    return this.toResponse(profile);
  }

  async list(page: number, limit: number): Promise<PaginatedResult<StudentProfileResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentProfile.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.studentProfile.count(),
    ]);

    return { data: rows.map((row) => this.toResponse(row)), meta: buildPaginationMeta(page, limit, total) };
  }

  async adminUpdate(id: string, dto: AdminUpdateStudentDto): Promise<StudentProfileResponse> {
    const existing = await this.prisma.studentProfile.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Student not found');
    }

    const profile = await this.prisma.studentProfile.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
        status: dto.status,
      },
    });

    return this.toResponse(profile);
  }

  private toResponse(profile: StudentProfile): StudentProfileResponse {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
      gender: profile.gender,
      countryCode: profile.countryCode,
      timezone: profile.timezone,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
