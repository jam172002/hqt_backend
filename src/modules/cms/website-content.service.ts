import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, WebsiteContent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpsertWebsiteContentDto } from './dto/website-content.dto';
import type { WebsiteContentResponse } from './interfaces/cms.interface';

@Injectable()
export class WebsiteContentService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicByKey(key: string): Promise<WebsiteContentResponse> {
    const content = await this.prisma.websiteContent.findFirst({
      where: { key, status: 'PUBLISHED' },
    });
    if (!content) {
      throw new NotFoundException('Content not found');
    }
    return this.toResponse(content);
  }

  async adminList(): Promise<WebsiteContentResponse[]> {
    const rows = await this.prisma.websiteContent.findMany({ orderBy: { key: 'asc' } });
    return rows.map((row) => this.toResponse(row));
  }

  async adminGetByKey(key: string): Promise<WebsiteContentResponse> {
    const content = await this.prisma.websiteContent.findUnique({ where: { key } });
    if (!content) {
      throw new NotFoundException('Content not found');
    }
    return this.toResponse(content);
  }

  async upsert(key: string, dto: UpsertWebsiteContentDto): Promise<WebsiteContentResponse> {
    const data = dto.data as Prisma.InputJsonValue | undefined;
    const content = await this.prisma.websiteContent.upsert({
      where: { key },
      update: { title: dto.title, content: dto.content, data, status: dto.status },
      create: { key, title: dto.title, content: dto.content, data, status: dto.status },
    });
    return this.toResponse(content);
  }

  private toResponse(content: WebsiteContent): WebsiteContentResponse {
    return {
      id: content.id,
      key: content.key,
      title: content.title,
      content: content.content,
      data: content.data,
      status: content.status,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
    };
  }
}
