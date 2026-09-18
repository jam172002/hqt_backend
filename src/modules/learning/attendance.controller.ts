import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/attendance.dto';

@Controller('learning/sessions/:sessionId/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Roles(ROLE_CODES.TEACHER)
  @Post()
  mark(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.mark(user, sessionId, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.update(user, sessionId, dto);
  }

  // Role-open: LearningAccessService enforces admin / assigned teacher /
  // owning student / linked parent - not a role-only check.
  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN, ROLE_CODES.TEACHER, ROLE_CODES.STUDENT, ROLE_CODES.PARENT)
  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.attendanceService.getForSession(user, sessionId);
  }
}
