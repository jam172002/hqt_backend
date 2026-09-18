import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminUpdateTeacherDto } from './dto/admin-update-teacher.dto';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { TeachersService } from './teachers.service';

@Controller('people/teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Post()
  adminCreate(@Body() dto: CreateTeacherDto) {
    return this.teachersService.adminCreate(dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.teachersService.getOwnProfile(user.id);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateTeacherProfileDto) {
    return this.teachersService.updateOwnProfile(user.id, dto);
  }

  // Public website "Teachers" page (SRS Section 14) - visitors browse without logging in.
  @Public()
  @Get()
  listPublic(@Query() query: PaginationQueryDto) {
    return this.teachersService.listPublic(query.page, query.limit);
  }

  @Public()
  @Get(':id')
  getPublicById(@Param('id') id: string) {
    return this.teachersService.getPublicById(id);
  }

  // Distinct "admin/..." path, not reused GET '/:id' or GET '/' above:
  // admin needs to see INACTIVE teachers too, which the public routes hide.
  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get('admin/list')
  adminList(@Query() query: PaginationQueryDto) {
    return this.teachersService.adminList(query.page, query.limit);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get('admin/:id')
  adminGetById(@Param('id') id: string) {
    return this.teachersService.adminGetById(id);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Patch(':id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateTeacherDto) {
    return this.teachersService.adminUpdate(id, dto);
  }
}
