import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SystemSetting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { UpsertSettingDto } from './dto/upsert-setting.dto';
import type { SystemSettingResponse } from './interfaces/setting.interface';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SystemSettingResponse[]> {
    const settings = await this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    return settings.map((setting) => this.toResponse(setting));
  }

  async getByKey(key: string): Promise<SystemSettingResponse> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return this.toResponse(setting);
  }

  async upsert(key: string, dto: UpsertSettingDto, updatedBy: string): Promise<SystemSettingResponse> {
    const value = dto.value as Prisma.InputJsonValue;
    const setting = await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value, description: dto.description, updatedBy },
      create: { key, value, description: dto.description, updatedBy },
    });
    return this.toResponse(setting);
  }

  private toResponse(setting: SystemSetting): SystemSettingResponse {
    return {
      id: setting.id,
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedBy: setting.updatedBy,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    };
  }
}
