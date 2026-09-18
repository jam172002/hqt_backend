import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ClassSessionService } from './class-session.service';
import { CancelSessionDto, CreateOneOffSessionDto, RescheduleSessionDto } from './dto/session-actions.dto';
import { SessionQueryDto } from './dto/session-query.dto';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];
const ADMIN_OR_TEACHER = [...ADMIN_ROLES, ROLE_CODES.TEACHER];

@Controller('scheduling/sessions')
export class ClassSessionController {
  constructor(private readonly classSessionService: ClassSessionService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  createOneOff(@Body() dto: CreateOneOffSessionDto) {
    return this.classSessionService.createOneOff(dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get()
  list(@Query() query: SessionQueryDto) {
    return this.classSessionService.list(query);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Get('student/me')
  listForStudent(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.classSessionService.listForStudent(user.id, query.page, query.limit);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Get('teacher/me')
  listForTeacher(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.classSessionService.listForTeacher(user.id, query.page, query.limit);
  }

  @Roles(ROLE_CODES.PARENT)
  @Get('children/:studentId')
  listForChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.classSessionService.listForChild(user.id, studentId, query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.classSessionService.getById(id);
  }

  @Roles(...ADMIN_OR_TEACHER)
  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
  ) {
    return this.classSessionService.cancel(user, id, dto.reason);
  }

  @Roles(...ADMIN_OR_TEACHER)
  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleSessionDto,
  ) {
    return this.classSessionService.reschedule(user, id, dto);
  }
}
