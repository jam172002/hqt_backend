import { Injectable, NotFoundException } from '@nestjs/common';
import type { Faq } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';
import type { FaqResponse } from './interfaces/cms.interface';

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFaqDto): Promise<FaqResponse> {
    const faq = await this.prisma.faq.create({
      data: {
        question: dto.question,
        answer: dto.answer,
        category: dto.category,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return this.toResponse(faq);
  }

  async listPublic(): Promise<FaqResponse[]> {
    const faqs = await this.prisma.faq.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
    });
    return faqs.map((faq) => this.toResponse(faq));
  }

  async adminList(): Promise<FaqResponse[]> {
    const faqs = await this.prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } });
    return faqs.map((faq) => this.toResponse(faq));
  }

  async update(id: string, dto: UpdateFaqDto): Promise<FaqResponse> {
    await this.findOrThrow(id);
    const faq = await this.prisma.faq.update({
      where: { id },
      data: {
        question: dto.question,
        answer: dto.answer,
        category: dto.category,
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
    });
    return this.toResponse(faq);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.faq.delete({ where: { id } });
  }

  private async findOrThrow(id: string): Promise<Faq> {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    return faq;
  }

  private toResponse(faq: Faq): FaqResponse {
    return {
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sortOrder: faq.sortOrder,
      status: faq.status,
      createdAt: faq.createdAt,
      updatedAt: faq.updatedAt,
    };
  }
}
