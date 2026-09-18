import { Injectable, NotFoundException } from '@nestjs/common';
import type { Invoice, InvoiceItem } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import type { InvoiceResponse } from './interfaces/billing.interface';

const WITH_ITEMS = { items: true };
type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInvoiceDto): Promise<InvoiceResponse> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: dto.enrollmentId } });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    const primaryParentLink = await this.prisma.parentStudentRelationship.findFirst({
      where: { studentId: enrollment.studentId, isPrimary: true },
      select: { parentId: true },
    });

    const itemAmounts = dto.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
    }));
    const subtotal = Math.round(itemAmounts.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = Math.round((subtotal - discount + tax) * 100) / 100;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: this.generateInvoiceNumber(),
        studentId: enrollment.studentId,
        parentId: primaryParentLink?.parentId,
        enrollmentId: dto.enrollmentId,
        packageId: dto.packageId,
        currency: dto.currency,
        subtotal,
        discount,
        tax,
        total,
        issuedAt: new Date(),
        dueAt: new Date(dto.dueAt),
        status: 'PENDING',
        notes: dto.notes,
        items: { create: itemAmounts },
      },
      include: WITH_ITEMS,
    });

    return this.toResponse(invoice);
  }

  async list(page: number, limit: number): Promise<PaginatedResult<InvoiceResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ skip, take, orderBy: { createdAt: 'desc' }, include: WITH_ITEMS }),
      this.prisma.invoice.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getById(id: string): Promise<InvoiceResponse> {
    const invoice = await this.findOrThrow(id);
    return this.toResponse(invoice);
  }

  async listForStudent(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<InvoiceResponse>> {
    const student = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) {
      throw new NotFoundException('No student profile exists for this account yet');
    }
    return this.listForFilter({ studentId: student.id }, page, limit);
  }

  async listForChild(
    parentUserId: string,
    studentId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<InvoiceResponse>> {
    const parent = await this.prisma.parentProfile.findUnique({ where: { userId: parentUserId } });
    if (!parent) {
      throw new NotFoundException('No parent profile exists for this account yet');
    }
    const link = await this.prisma.parentStudentRelationship.findUnique({
      where: { parentId_studentId: { parentId: parent.id, studentId } },
    });
    if (!link?.canViewPayments) {
      throw new NotFoundException('Student not found');
    }
    return this.listForFilter({ studentId }, page, limit);
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceResponse> {
    await this.findOrThrow(id);
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: dto.status, notes: dto.notes },
      include: WITH_ITEMS,
    });
    return this.toResponse(invoice);
  }

  private async listForFilter(
    where: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<InvoiceResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: WITH_ITEMS }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async findOrThrow(id: string): Promise<InvoiceWithItems> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: WITH_ITEMS });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  private generateInvoiceNumber(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = randomBytes(3).toString('hex').toUpperCase();
    return `INV-${datePart}-${randomPart}`;
  }

  private toResponse(invoice: InvoiceWithItems): InvoiceResponse {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.studentId,
      parentId: invoice.parentId,
      enrollmentId: invoice.enrollmentId,
      packageId: invoice.packageId,
      currency: invoice.currency,
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      status: invoice.status,
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      })),
    };
  }
}
