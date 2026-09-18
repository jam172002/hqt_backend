import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { CoursesService } from './courses.service';
import { CreateCourseFaqDto } from './dto/create-course-faq.dto';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseFaqDto } from './dto/update-course-faq.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  // Public website course listing/detail (SRS Section 13) - only published
  // courses are visible; visitors never see DRAFT/HIDDEN ones.
  @Public()
  @Get()
  listPublished(@Query() query: PaginationQueryDto) {
    return this.coursesService.listPublished(query.page, query.limit);
  }

  @Public()
  @Get(':slug')
  getPublishedBySlug(@Param('slug') slug: string) {
    return this.coursesService.getPublishedBySlug(slug);
  }

  // Distinct "admin/..." path: admin needs DRAFT/HIDDEN courses too, which
  // the public routes above (keyed by slug, published-only) don't expose.
  @Roles(...ADMIN_ROLES)
  @Get('admin/list')
  adminList(@Query() query: PaginationQueryDto) {
    return this.coursesService.adminList(query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin/:id')
  adminGetById(@Param('id') id: string) {
    return this.coursesService.adminGetById(id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.coursesService.remove(id);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':courseId/sections')
  addSection(@Param('courseId') courseId: string, @Body() dto: CreateCourseSectionDto) {
    return this.coursesService.addSection(courseId, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':courseId/sections/:sectionId')
  updateSection(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateCourseSectionDto,
  ) {
    return this.coursesService.updateSection(courseId, sectionId, dto);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':courseId/sections/:sectionId')
  removeSection(@Param('courseId') courseId: string, @Param('sectionId') sectionId: string) {
    return this.coursesService.removeSection(courseId, sectionId);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':courseId/faqs')
  addFaq(@Param('courseId') courseId: string, @Body() dto: CreateCourseFaqDto) {
    return this.coursesService.addFaq(courseId, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':courseId/faqs/:faqId')
  updateFaq(
    @Param('courseId') courseId: string,
    @Param('faqId') faqId: string,
    @Body() dto: UpdateCourseFaqDto,
  ) {
    return this.coursesService.updateFaq(courseId, faqId, dto);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':courseId/faqs/:faqId')
  removeFaq(@Param('courseId') courseId: string, @Param('faqId') faqId: string) {
    return this.coursesService.removeFaq(courseId, faqId);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':courseId/teachers/:teacherId')
  assignTeacher(@Param('courseId') courseId: string, @Param('teacherId') teacherId: string) {
    return this.coursesService.assignTeacher(courseId, teacherId);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':courseId/teachers/:teacherId')
  unassignTeacher(@Param('courseId') courseId: string, @Param('teacherId') teacherId: string) {
    return this.coursesService.unassignTeacher(courseId, teacherId);
  }
}
