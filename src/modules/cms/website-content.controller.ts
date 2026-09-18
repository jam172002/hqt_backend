import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { UpsertWebsiteContentDto } from './dto/website-content.dto';
import { WebsiteContentService } from './website-content.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('cms/content')
export class WebsiteContentController {
  constructor(private readonly websiteContentService: WebsiteContentService) {}

  @Public()
  @Get(':key')
  getPublicByKey(@Param('key') key: string) {
    return this.websiteContentService.getPublicByKey(key);
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin/list')
  adminList() {
    return this.websiteContentService.adminList();
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin/:key')
  adminGetByKey(@Param('key') key: string) {
    return this.websiteContentService.adminGetByKey(key);
  }

  @Roles(...ADMIN_ROLES)
  @Put(':key')
  upsert(@Param('key') key: string, @Body() dto: UpsertWebsiteContentDto) {
    return this.websiteContentService.upsert(key, dto);
  }
}
