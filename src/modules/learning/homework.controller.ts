import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateHomeworkDto,
  ReviewHomeworkSubmissionDto,
  SubmitHomeworkDto,
  UpdateHomeworkDto,
} from './dto/homework.dto';
import { HomeworkService } from './homework.service';

const ANY_LEARNING_ROLE = [
  ROLE_CODES.ADMIN,
  ROLE_CODES.SUPER_ADMIN,
  ROLE_CODES.TEACHER,
  ROLE_CODES.STUDENT,
  ROLE_CODES.PARENT,
];

@Controller('learning/homework')
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Roles(ROLE_CODES.TEACHER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHomeworkDto) {
    return this.homeworkService.create(user, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Get('teacher/me')
  listForTeacher(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.homeworkService.listForTeacher(user.id, query.page, query.limit);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Get('student/me')
  listForStudent(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.homeworkService.listForStudent(user.id, query.page, query.limit);
  }

  @Roles(ROLE_CODES.PARENT)
  @Get('children/:studentId')
  listForChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.homeworkService.listForChild(user.id, studentId, query.page, query.limit);
  }

  @Roles(...ANY_LEARNING_ROLE)
  @Get(':id')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.homeworkService.getById(user, id);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateHomeworkDto,
  ) {
    return this.homeworkService.update(user, id, dto);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Post(':id/submissions')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitHomeworkDto,
  ) {
    return this.homeworkService.submit(user, id, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch('submissions/:submissionId/review')
  reviewSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('submissionId') submissionId: string,
    @Body() dto: ReviewHomeworkSubmissionDto,
  ) {
    return this.homeworkService.reviewSubmission(user, submissionId, dto);
  }
}
