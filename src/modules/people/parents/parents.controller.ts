import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AddChildDto } from './dto/add-child.dto';
import { CreateParentProfileDto } from './dto/create-parent-profile.dto';
import { UpdateParentProfileDto } from './dto/update-parent-profile.dto';
import { ParentsService } from './parents.service';

@Controller('people/parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Roles(ROLE_CODES.PARENT)
  @Post('me')
  createOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateParentProfileDto) {
    return this.parentsService.createOwnProfile(user.id, dto);
  }

  @Roles(ROLE_CODES.PARENT)
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.parentsService.getOwnProfile(user.id);
  }

  @Roles(ROLE_CODES.PARENT)
  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateParentProfileDto) {
    return this.parentsService.updateOwnProfile(user.id, dto);
  }

  @Roles(ROLE_CODES.PARENT)
  @Post('me/children')
  addChild(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddChildDto) {
    return this.parentsService.addChild(user.id, dto);
  }

  @Roles(ROLE_CODES.PARENT)
  @Get('me/children')
  listChildren(@CurrentUser() user: AuthenticatedUser) {
    return this.parentsService.listChildren(user.id);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get()
  adminList(@Query() query: PaginationQueryDto) {
    return this.parentsService.adminList(query.page, query.limit);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Get(':id')
  adminGetById(@Param('id') id: string) {
    return this.parentsService.adminGetById(id);
  }

  @Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
  @Patch(':id')
  adminUpdate(@Param('id') id: string, @Body() dto: UpdateParentProfileDto) {
    return this.parentsService.adminUpdate(id, dto);
  }
}
