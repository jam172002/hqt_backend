import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContactInquiry } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateContactInquiryDto, UpdateContactInquiryDto } from './dto/contact-inquiry.dto';
import type { ContactInquiryResponse } from './interfaces/crm.interface';

@Injectable()
export class ContactInquiryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContactInquiryDto): Promise<ContactInquiryResponse> {
    const inquiry = await this.prisma.contactInquiry.create({ data: dto });
    return this.toResponse(inquiry);
  }

  async list(page: number, limit: number): Promise<PaginatedResult<ContactInquiryResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contactInquiry.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.contactInquiry.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getById(id: string): Promise<ContactInquiryResponse> {
    const inquiry = await this.findOrThrow(id);
    return this.toResponse(inquiry);
  }

  async update(id: string, dto: UpdateContactInquiryDto): Promise<ContactInquiryResponse> {
    await this.findOrThrow(id);
    const inquiry = await this.prisma.contactInquiry.update({
      where: { id },
      data: { status: dto.status, assignedAdminId: dto.assignedAdminId },
    });
    return this.toResponse(inquiry);
  }

  private async findOrThrow(id: string): Promise<ContactInquiry> {
    const inquiry = await this.prisma.contactInquiry.findUnique({ where: { id } });
    if (!inquiry) {
      throw new NotFoundException('Contact inquiry not found');
    }
    return inquiry;
  }

  private toResponse(inquiry: ContactInquiry): ContactInquiryResponse {
    return {
      id: inquiry.id,
      name: inquiry.name,
      email: inquiry.email,
      phone: inquiry.phone,
      whatsapp: inquiry.whatsapp,
      subject: inquiry.subject,
      message: inquiry.message,
      status: inquiry.status,
      assignedAdminId: inquiry.assignedAdminId,
      createdAt: inquiry.createdAt,
      updatedAt: inquiry.updatedAt,
    };
  }
}
