import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import { SiteContentService } from './site-content.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

class SaveSectionDto {
  @IsObject()
  values!: Record<string, unknown>;
}

/**
 * Website wording, organised page -> section -> field (see site-content.schema.ts).
 * The public GET is what the website calls; the admin routes power the
 * "Site Content" screens in the admin panel.
 */
@Controller('cms/site')
export class SiteContentController {
  constructor(private readonly siteContent: SiteContentService) {}

  /** e.g. GET /cms/site?pages=global,home - omit `pages` to get every page. */
  @Public()
  @Get()
  getPublic(@Query('pages') pages?: string) {
    const keys = (pages ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return this.siteContent.getPublic(keys);
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  adminGetAll() {
    return this.siteContent.adminGetAll();
  }

  @Roles(...ADMIN_ROLES)
  @Put('admin/:page/:section')
  save(@Param('page') page: string, @Param('section') section: string, @Body() dto: SaveSectionDto) {
    return this.siteContent.save(page, section, dto.values);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @Delete('admin/:page/:section')
  reset(@Param('page') page: string, @Param('section') section: string) {
    return this.siteContent.reset(page, section);
  }
}
