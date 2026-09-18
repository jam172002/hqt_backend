import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { RecordPaymentDto } from './dto/payment.dto';
import type { PaymentResponse } from './interfaces/billing.interface';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Online payment provider is TBD (SRS Section 53) - this records a
   * payment an admin has already reconciled manually (e.g. bank
   * transfer), rather than charging a card. PaymentTransaction exists in
   * the schema for a real gateway to plug into later without reshaping
   * this table.
   */
  async record(invoiceId: string, dto: RecordPaymentDto): Promise<PaymentResponse> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status === 'CANCELLED' || invoice.status === 'REFUNDED') {
      throw new BadRequestException(`Cannot record a payment against a ${invoice.status.toLowerCase()} invoice`);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId,
          studentId: invoice.studentId,
          parentId: invoice.parentId,
          amount: dto.amount,
          currency: invoice.currency,
          status: 'COMPLETED',
          paymentMethod: dto.paymentMethod,
          paidAt: new Date(),
          notes: dto.notes,
        },
      });

      const totalPaid = await tx.payment.aggregate({
        where: { invoiceId, status: 'COMPLETED' },
        _sum: { amount: true },
      });
      const paidSoFar = Number(totalPaid._sum.amount ?? 0);

      if (paidSoFar >= Number(invoice.total)) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }

      return created;
    });

    return this.toResponse(payment);
  }

  async list(page: number, limit: number): Promise<PaginatedResult<PaymentResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async listForInvoice(invoiceId: string): Promise<PaymentResponse[]> {
    const payments = await this.prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map((payment) => this.toResponse(payment));
  }

  private toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      studentId: payment.studentId,
      parentId: payment.parentId,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.paidAt,
      notes: payment.notes,
      createdAt: payment.createdAt,
    };
  }
}
