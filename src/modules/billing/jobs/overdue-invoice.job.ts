import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Sweeps PENDING invoices past their due date to OVERDUE (architecture
 * spec Section 18: "overdue invoice processing" must run as a
 * non-blocking background job, not be computed ad hoc on read). A plain
 * bulk update is sufficient here - there's no PaymentTransaction side
 * effect to a status flip, unlike recording a payment.
 */
@Injectable()
export class OverdueInvoiceJob {
  private readonly logger = new Logger(OverdueInvoiceJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run(): Promise<void> {
    const result = await this.prisma.invoice.updateMany({
      where: { status: 'PENDING', dueAt: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} invoice(s) OVERDUE`);
    }
  }
}
