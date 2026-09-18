import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { CreateFaqDto, UpdateFaqDto } from './dto/faq.dto';
import { FaqsService } from './faqs.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('cms/faqs')
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.faqsService.create(dto);
  }

  @Public()
  @Get()
  listPublic() {
    return this.faqsService.listPublic();
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  adminList() {
    return this.faqsService.adminList();
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.faqsService.update(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.faqsService.remove(id);
  }
}
