import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import { AuditService } from './audit.service';

@Controller('audit/logs')
@Roles(ROLE_CODES.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.auditService.list(query.page, query.limit);
  }
}
