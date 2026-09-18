import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { ClassScheduleService } from './class-schedule.service';
import { CreateClassScheduleDto, GenerateSessionsDto, UpdateClassScheduleDto } from './dto/class-schedule.dto';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('scheduling/schedules')
@Roles(...ADMIN_ROLES)
export class ClassScheduleController {
  constructor(private readonly classScheduleService: ClassScheduleService) {}

  @Post()
  create(@Body() dto: CreateClassScheduleDto) {
    return this.classScheduleService.create(dto);
  }

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.classScheduleService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.classScheduleService.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClassScheduleDto) {
    return this.classScheduleService.update(id, dto);
  }

  @Post(':id/generate-sessions')
  generateSessions(@Param('id') id: string, @Body() dto: GenerateSessionsDto) {
    return this.classScheduleService.generateSessions(id, dto.from, dto.to);
  }
}
