import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';

@Controller('people/admins')
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Roles(ROLE_CODES.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.adminsService.create(dto);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.adminsService.getOwnProfile(user.id);
  }
}
