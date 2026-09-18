import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpsertLessonRecordDto } from './dto/lesson-record.dto';
import { LessonRecordService } from './lesson-record.service';

@Controller('learning/sessions/:sessionId/lesson')
export class LessonRecordController {
  constructor(private readonly lessonRecordService: LessonRecordService) {}

  @Roles(ROLE_CODES.TEACHER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpsertLessonRecordDto,
  ) {
    return this.lessonRecordService.create(user, sessionId, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpsertLessonRecordDto,
  ) {
    return this.lessonRecordService.update(user, sessionId, dto);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN, ROLE_CODES.TEACHER, ROLE_CODES.STUDENT, ROLE_CODES.PARENT)
  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.lessonRecordService.getForSession(user, sessionId);
  }
}
