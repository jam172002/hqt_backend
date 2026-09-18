import { Injectable, NotFoundException } from '@nestjs/common';
import type { TeacherProfile } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../../common/pagination/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AdminUpdateTeacherDto } from './dto/admin-update-teacher.dto';
import type { CreateTeacherDto } from './dto/create-teacher.dto';
import type { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import type { TeacherProfileResponse } from './interfaces/teacher-profile.interface';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Admin-only: provisions a login-capable teacher account plus their profile. */
  async adminCreate(dto: CreateTeacherDto): Promise<TeacherProfileResponse> {
    const account = await this.authService.createManagedAccount(
      dto.email,
      dto.phone,
      dto.password,
      ROLE_CODES.TEACHER,
    );

    const profile = await this.prisma.teacherProfile.create({
      data: {
        userId: account.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio,
        shortBio: dto.shortBio,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        teachingPhilosophy: dto.teachingPhilosophy,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  async getOwnProfile(userId: string): Promise<TeacherProfileResponse> {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No teacher profile exists for this account yet');
    }
    return this.toResponse(profile);
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateTeacherProfileDto,
  ): Promise<TeacherProfileResponse> {
    const existing = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!existing) {
      throw new NotFoundException('No teacher profile exists for this account yet');
    }

    const profile = await this.prisma.teacherProfile.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio,
        shortBio: dto.shortBio,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        teachingPhilosophy: dto.teachingPhilosophy,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  /** Public website teacher listing - active teachers only. */
  async listPublic(page: number, limit: number): Promise<PaginatedResult<TeacherProfileResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const where = { status: 'ACTIVE' as const };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teacherProfile.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.teacherProfile.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getPublicById(id: string): Promise<TeacherProfileResponse> {
    const profile = await this.prisma.teacherProfile.findFirst({
      where: { id, status: 'ACTIVE' },
    });
    if (!profile) {
      throw new NotFoundException('Teacher not found');
    }
    return this.toResponse(profile);
  }

  async adminList(page: number, limit: number): Promise<PaginatedResult<TeacherProfileResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teacherProfile.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.teacherProfile.count(),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async adminGetById(id: string): Promise<TeacherProfileResponse> {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException('Teacher not found');
    }
    return this.toResponse(profile);
  }

  async adminUpdate(id: string, dto: AdminUpdateTeacherDto): Promise<TeacherProfileResponse> {
    const existing = await this.prisma.teacherProfile.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Teacher not found');
    }

    const profile = await this.prisma.teacherProfile.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio,
        shortBio: dto.shortBio,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        teachingPhilosophy: dto.teachingPhilosophy,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
        status: dto.status,
      },
    });

    return this.toResponse(profile);
  }

  private toResponse(profile: TeacherProfile): TeacherProfileResponse {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      bio: profile.bio,
      shortBio: profile.shortBio,
      qualification: profile.qualification,
      experienceYears: profile.experienceYears,
      teachingPhilosophy: profile.teachingPhilosophy,
      countryCode: profile.countryCode,
      timezone: profile.timezone,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
