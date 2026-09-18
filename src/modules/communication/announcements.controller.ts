import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(user.id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  adminList(@Query() query: PaginationQueryDto) {
    return this.announcementsService.adminList(query.page, query.limit);
  }

  // Any authenticated role - personalized feed (own role/targeting only).
  @Get('me')
  listForUser(@CurrentUser() user: AuthenticatedUser) {
    return this.announcementsService.listForUser(user);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcementsService.update(id, dto);
  }
}
