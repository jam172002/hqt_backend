import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { PaymentsService } from './payments.service';

@Controller('billing/payments')
@Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.paymentsService.list(query.page, query.limit);
  }
}
