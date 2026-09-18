import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { Throttle } from '../../common/decorators/throttle.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { ContactInquiryService } from './contact-inquiry.service';
import { CreateContactInquiryDto, UpdateContactInquiryDto } from './dto/contact-inquiry.dto';

@Controller('crm/contact-inquiries')
export class ContactInquiryController {
  constructor(private readonly contactInquiryService: ContactInquiryService) {}

  // The public "Contact Us" form (SRS Section 18). Rate-limited for the same
  // spam-protection reason as trial-request creation.
  @Public()
  @Throttle(20, 10 * 60 * 1000)
  @Post()
  create(@Body() dto: CreateContactInquiryDto) {
    return this.contactInquiryService.create(dto);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.contactInquiryService.list(query.page, query.limit);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.contactInquiryService.getById(id);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactInquiryDto) {
    return this.contactInquiryService.update(id, dto);
  }
}
