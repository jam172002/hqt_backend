import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.notificationsService.listOwn(user.id, query.page, query.limit);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @HttpCode(HttpStatus.OK)
  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.id);
  }
}
