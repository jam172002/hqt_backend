import { Injectable, NotFoundException } from '@nestjs/common';
import type { Testimonial } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateTestimonialDto, UpdateTestimonialDto } from './dto/testimonial.dto';
import type { TestimonialResponse } from './interfaces/cms.interface';

@Injectable()
export class TestimonialsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTestimonialDto): Promise<TestimonialResponse> {
    const testimonial = await this.prisma.testimonial.create({
      data: {
        name: dto.name,
        countryCode: dto.countryCode,
        rating: dto.rating,
        review: dto.review,
        category: dto.category,
        courseId: dto.courseId,
      },
    });
    return this.toResponse(testimonial);
  }

  async listPublic(page: number, limit: number): Promise<PaginatedResult<TestimonialResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const where = { status: 'PUBLISHED' as const };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.testimonial.findMany({ where, skip, take, orderBy: { sortOrder: 'asc' } }),
      this.prisma.testimonial.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async adminList(page: number, limit: number): Promise<PaginatedResult<TestimonialResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.testimonial.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.testimonial.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async update(id: string, dto: UpdateTestimonialDto): Promise<TestimonialResponse> {
    await this.findOrThrow(id);
    const testimonial = await this.prisma.testimonial.update({
      where: { id },
      data: {
        name: dto.name,
        rating: dto.rating,
        review: dto.review,
        category: dto.category,
        status: dto.status,
        sortOrder: dto.sortOrder,
      },
    });
    return this.toResponse(testimonial);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.testimonial.delete({ where: { id } });
  }

  private async findOrThrow(id: string): Promise<Testimonial> {
    const testimonial = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!testimonial) {
      throw new NotFoundException('Testimonial not found');
    }
    return testimonial;
  }

  private toResponse(testimonial: Testimonial): TestimonialResponse {
    return {
      id: testimonial.id,
      name: testimonial.name,
      countryCode: testimonial.countryCode,
      rating: testimonial.rating,
      review: testimonial.review,
      category: testimonial.category,
      courseId: testimonial.courseId,
      status: testimonial.status,
      sortOrder: testimonial.sortOrder,
      createdAt: testimonial.createdAt,
      updatedAt: testimonial.updatedAt,
    };
  }
}
