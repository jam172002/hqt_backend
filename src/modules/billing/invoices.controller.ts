import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { RecordPaymentDto } from './dto/payment.dto';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('billing/invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get()
  list(@Query() query: InvoiceQueryDto) {
    return this.invoicesService.list(query.page, query.limit, query.status);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.invoicesService.listForStudent(user.id, query.page, query.limit);
  }

  @Roles(ROLE_CODES.PARENT)
  @Get('children/:studentId')
  listForChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.invoicesService.listForChild(user.id, studentId, query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.invoicesService.getById(id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.record(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id/payments')
  listPayments(@Param('id') id: string) {
    return this.paymentsService.listForInvoice(id);
  }
}
