import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateConversationDto, SendMessageDto } from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@Controller('messaging/conversations')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    return this.messagingService.create(user.id, dto);
  }

  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listOwn(user.id);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.messagingService.listMessages(user.id, id, query.page, query.limit);
  }

  @Post(':id/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(user.id, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.messagingService.markRead(user.id, id);
  }
}
