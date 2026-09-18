import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminUpdateStudentDto } from './dto/admin-update-student.dto';
import { CreateStudentProfileDto } from './dto/create-student-profile.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { StudentsService } from './students.service';

@Controller('people/students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Roles(ROLE_CODES.STUDENT)
  @Post('me')
  createOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStudentProfileDto) {
    return this.studentsService.createOwnProfile(user.id, dto);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.studentsService.getOwnProfile(user.id);
  }

  @Roles(ROLE_CODES.STUDENT)
  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateStudentProfileDto) {
    return this.studentsService.updateOwnProfile(user.id, dto);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.studentsService.list(query.page, query.limit);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.studentsService.getById(id);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Patch(':id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateStudentDto) {
    return this.studentsService.adminUpdate(id, dto);
  }
}
