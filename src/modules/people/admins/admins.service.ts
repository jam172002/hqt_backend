import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminProfile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { CreateAdminDto } from './dto/create-admin.dto';
import type { AdminProfileResponse } from './interfaces/admin-profile.interface';

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** SUPER_ADMIN-only: provisions a plain ADMIN account, never another SUPER_ADMIN via API. */
  async create(dto: CreateAdminDto): Promise<AdminProfileResponse> {
    const account = await this.authService.createManagedAccount(
      dto.email,
      dto.phone,
      dto.password,
      ROLE_CODES.ADMIN,
    );

    const profile = await this.prisma.adminProfile.create({
      data: {
        userId: account.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jobTitle: dto.jobTitle,
      },
    });

    return this.toResponse(profile);
  }

  async getOwnProfile(userId: string): Promise<AdminProfileResponse> {
    const profile = await this.prisma.adminProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No admin profile exists for this account');
    }
    return this.toResponse(profile);
  }

  private toResponse(profile: AdminProfile): AdminProfileResponse {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      jobTitle: profile.jobTitle,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
