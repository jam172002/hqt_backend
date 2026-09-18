import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { OverdueInvoiceJob } from './jobs/overdue-invoice.job';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Owns packages, invoices, and payments (architecture spec Section 5/13).
 * Online payment provider is TBD (SRS Section 53) - payments are
 * admin-recorded rather than processed through a real gateway; see
 * PaymentsService's header comment for the intended provider seam
 * (PaymentTransaction).
 */
@Module({
  controllers: [PackagesController, InvoicesController, PaymentsController],
  providers: [PackagesService, InvoicesService, PaymentsService, OverdueInvoiceJob],
})
export class BillingModule {}
