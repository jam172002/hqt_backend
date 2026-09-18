import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateProgressDto } from './dto/progress.dto';
import { ProgressService } from './progress.service';

const ANY_LEARNING_ROLE = [
  ROLE_CODES.ADMIN,
  ROLE_CODES.SUPER_ADMIN,
  ROLE_CODES.TEACHER,
  ROLE_CODES.STUDENT,
  ROLE_CODES.PARENT,
];

@Controller('learning/progress/enrollment/:enrollmentId')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Roles(...ANY_LEARNING_ROLE)
  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('enrollmentId') enrollmentId: string) {
    return this.progressService.getForEnrollment(user, enrollmentId);
  }

  @Roles(...ANY_LEARNING_ROLE)
  @Get('history')
  getHistory(@CurrentUser() user: AuthenticatedUser, @Param('enrollmentId') enrollmentId: string) {
    return this.progressService.getHistoryForEnrollment(user, enrollmentId);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('enrollmentId') enrollmentId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progressService.update(user, enrollmentId, dto);
  }
}
