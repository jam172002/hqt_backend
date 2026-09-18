import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { CreateTestimonialDto, UpdateTestimonialDto } from './dto/testimonial.dto';
import { TestimonialsService } from './testimonials.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('cms/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@Body() dto: CreateTestimonialDto) {
    return this.testimonialsService.create(dto);
  }

  @Public()
  @Get()
  listPublic(@Query() query: PaginationQueryDto) {
    return this.testimonialsService.listPublic(query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  adminList(@Query() query: PaginationQueryDto) {
    return this.testimonialsService.adminList(query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestimonialDto) {
    return this.testimonialsService.update(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.testimonialsService.remove(id);
  }
}
