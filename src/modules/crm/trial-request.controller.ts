import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Throttle } from '../../common/decorators/throttle.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TrialRequestQueryDto } from './dto/trial-request-query.dto';
import { ConvertTrialRequestDto, CreateTrialRequestDto, UpdateTrialRequestDto } from './dto/trial-request.dto';
import { ScheduleTrialSessionDto } from './dto/trial-session.dto';
import { TrialRequestService } from './trial-request.service';
import { TrialSessionService } from './trial-session.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('crm/trial-requests')
export class TrialRequestController {
  constructor(
    private readonly trialRequestService: TrialRequestService,
    private readonly trialSessionService: TrialSessionService,
  ) {}

  // The "Book Free Trial" form - the primary lead-generation entry point (SRS Section 8).
  // Rate-limited: public, unauthenticated, and the most likely public-form spam target.
  @Public()
  @Throttle(20, 10 * 60 * 1000)
  @Post()
  create(@Body() dto: CreateTrialRequestDto) {
    return this.trialRequestService.create(dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get()
  list(@Query() query: TrialRequestQueryDto) {
    return this.trialRequestService.list(query);
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.trialRequestService.getById(id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrialRequestDto) {
    return this.trialRequestService.update(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/convert')
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConvertTrialRequestDto,
  ) {
    return this.trialRequestService.convert(id, dto, user.id);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/sessions')
  scheduleSession(@Param('id') id: string, @Body() dto: ScheduleTrialSessionDto) {
    return this.trialSessionService.schedule(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Get(':id/sessions')
  listSessions(@Param('id') id: string) {
    return this.trialSessionService.listForTrialRequest(id);
  }
}
