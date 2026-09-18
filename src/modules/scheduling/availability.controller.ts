import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityExceptionDto } from './dto/availability-exception.dto';
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from './dto/availability-rule.dto';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('scheduling/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Roles(ROLE_CODES.TEACHER)
  @Post('rules')
  addRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAvailabilityRuleDto) {
    return this.availabilityService.addRule(user.id, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Get('rules/me')
  listOwnRules(@CurrentUser() user: AuthenticatedUser) {
    return this.availabilityService.listOwnRules(user.id);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Patch('rules/:id')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityRuleDto,
  ) {
    return this.availabilityService.updateRule(user.id, id, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('rules/:id')
  removeRule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.availabilityService.removeRule(user.id, id);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Post('exceptions')
  addException(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAvailabilityExceptionDto) {
    return this.availabilityService.addException(user.id, dto);
  }

  @Roles(ROLE_CODES.TEACHER)
  @Get('exceptions/me')
  listOwnExceptions(@CurrentUser() user: AuthenticatedUser) {
    return this.availabilityService.listOwnExceptions(user.id);
  }

  @Roles(ROLE_CODES.TEACHER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('exceptions/:id')
  removeException(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.availabilityService.removeException(user.id, id);
  }

  // Admin needs a combined view when manually scheduling classes.
  @Roles(...ADMIN_ROLES)
  @Get('teachers/:teacherId')
  adminGetTeacherAvailability(@Param('teacherId') teacherId: string) {
    return this.availabilityService.adminGetTeacherAvailability(teacherId);
  }
}
