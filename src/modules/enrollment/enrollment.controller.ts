import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ChangeEnrollmentStatusDto } from './dto/change-enrollment-status.dto';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentQueryDto } from './dto/enrollment-query.dto';
import { ReassignTeacherDto } from './dto/reassign-teacher.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { EnrollmentService } from './enrollment.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@Body() dto: CreateEnrollmentDto) {
    return this.enrollmentService.create(dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get()
  list(@Query() query: EnrollmentQueryDto) {
    return this.enrollmentService.list(query);
  }

  // SRS: "Student > View enrolled courses" - own enrollments only.
  @Roles(ROLE_CODES.STUDENT)
  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.enrollmentService.listOwnForStudent(user.id, query.page, query.limit);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Get('me/:id')
  getOwn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.enrollmentService.getOwnForStudent(user.id, id);
  }

  // SRS: "Parent > View child's courses" - relationship-checked, not just role-checked.
  @Roles(ROLE_CODES.PARENT)
  @Get('children/:studentId')
  listForChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.enrollmentService.listForChild(user.id, studentId, query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.enrollmentService.getById(id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.enrollmentService.update(id, dto);
  }

  // 200, not POST's default 201: this transitions an existing enrollment,
  // it doesn't create a new resource (same convention as the PATCH below).
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @Post(':id/status')
  changeStatus(@Param('id') id: string, @Body() dto: ChangeEnrollmentStatusDto) {
    return this.enrollmentService.changeStatus(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id/teacher')
  reassignTeacher(@Param('id') id: string, @Body() dto: ReassignTeacherDto) {
    return this.enrollmentService.reassignTeacher(id, dto);
  }
}
