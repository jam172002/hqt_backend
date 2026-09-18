import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ParentProfile } from '@prisma/client';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../../common/pagination/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AddChildDto } from './dto/add-child.dto';
import type { CreateParentProfileDto } from './dto/create-parent-profile.dto';
import type { UpdateParentProfileDto } from './dto/update-parent-profile.dto';
import type { ChildResponse, ParentProfileResponse } from './interfaces/parent-profile.interface';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOwnProfile(
    userId: string,
    dto: CreateParentProfileDto,
  ): Promise<ParentProfileResponse> {
    const existing = await this.prisma.parentProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException('A parent profile already exists for this account');
    }

    const profile = await this.prisma.parentProfile.create({
      data: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  async getOwnProfile(userId: string): Promise<ParentProfileResponse> {
    const profile = await this.findOwnProfileOrThrow(userId);
    return this.toResponse(profile);
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateParentProfileDto,
  ): Promise<ParentProfileResponse> {
    await this.findOwnProfileOrThrow(userId);

    const profile = await this.prisma.parentProfile.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  /**
   * Creates a child the parent manages directly: a bare `users` row with
   * no credentials, a student profile, and the relationship link, all in
   * one transaction (SRS: "A parent should potentially be able to manage
   * multiple children under one account").
   */
  async addChild(parentUserId: string, dto: AddChildDto): Promise<ChildResponse> {
    const parentProfile = await this.findOwnProfileOrThrow(parentUserId);

    const studentRole = await this.prisma.role.findUnique({
      where: { code: ROLE_CODES.STUDENT },
    });
    if (!studentRole) {
      throw new BadRequestException('STUDENT role is not seeded yet - run the Prisma seed script');
    }

    const relationship = await this.prisma.$transaction(async (tx) => {
      const childUser = await tx.user.create({
        data: { status: 'ACTIVE', roles: { create: { roleId: studentRole.id } } },
      });

      const studentProfile = await tx.studentProfile.create({
        data: {
          userId: childUser.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          countryCode: dto.countryCode,
          timezone: dto.timezone,
        },
      });

      return tx.parentStudentRelationship.create({
        data: {
          parentId: parentProfile.id,
          studentId: studentProfile.id,
          relationshipType: dto.relationshipType,
          isPrimary: dto.isPrimary ?? true,
          canViewProgress: dto.canViewProgress ?? true,
          canViewPayments: dto.canViewPayments ?? true,
          canJoinClass: dto.canJoinClass ?? true,
        },
        include: { student: true },
      });
    });

    return this.toChildResponse(relationship);
  }

  async listChildren(parentUserId: string): Promise<ChildResponse[]> {
    const parentProfile = await this.findOwnProfileOrThrow(parentUserId);

    const relationships = await this.prisma.parentStudentRelationship.findMany({
      where: { parentId: parentProfile.id },
      include: { student: true },
      orderBy: { createdAt: 'asc' },
    });

    return relationships.map((relationship) => this.toChildResponse(relationship));
  }

  async adminList(page: number, limit: number): Promise<PaginatedResult<ParentProfileResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.parentProfile.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.parentProfile.count(),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async adminGetById(id: string): Promise<ParentProfileResponse> {
    const profile = await this.prisma.parentProfile.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException('Parent not found');
    }
    return this.toResponse(profile);
  }

  async adminUpdate(id: string, dto: UpdateParentProfileDto): Promise<ParentProfileResponse> {
    const existing = await this.prisma.parentProfile.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Parent not found');
    }

    const profile = await this.prisma.parentProfile.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        countryCode: dto.countryCode,
        timezone: dto.timezone,
      },
    });

    return this.toResponse(profile);
  }

  private async findOwnProfileOrThrow(userId: string): Promise<ParentProfile> {
    const profile = await this.prisma.parentProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No parent profile exists for this account yet');
    }
    return profile;
  }

  private toResponse(profile: ParentProfile): ParentProfileResponse {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      countryCode: profile.countryCode,
      timezone: profile.timezone,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private toChildResponse(relationship: {
    id: string;
    relationshipType: string;
    isPrimary: boolean;
    canViewProgress: boolean;
    canViewPayments: boolean;
    canJoinClass: boolean;
    student: {
      id: string;
      userId: string;
      firstName: string;
      lastName: string | null;
      dateOfBirth: Date | null;
      gender: string | null;
      countryCode: string;
      timezone: string;
      status: string;
    };
  }): ChildResponse {
    return {
      relationshipId: relationship.id,
      relationshipType: relationship.relationshipType,
      isPrimary: relationship.isPrimary,
      canViewProgress: relationship.canViewProgress,
      canViewPayments: relationship.canViewPayments,
      canJoinClass: relationship.canJoinClass,
      student: {
        id: relationship.student.id,
        userId: relationship.student.userId,
        firstName: relationship.student.firstName,
        lastName: relationship.student.lastName,
        dateOfBirth: relationship.student.dateOfBirth
          ? relationship.student.dateOfBirth.toISOString().slice(0, 10)
          : null,
        gender: relationship.student.gender,
        countryCode: relationship.student.countryCode,
        timezone: relationship.student.timezone,
        status: relationship.student.status,
      },
    };
  }
}
