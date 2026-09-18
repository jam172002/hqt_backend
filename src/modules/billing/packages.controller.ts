import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { CreatePackageDto, UpdatePackageDto } from './dto/package.dto';
import { PackagesService } from './packages.service';

const ADMIN_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN];

@Controller('billing/packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Roles(...ADMIN_ROLES)
  @Post()
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  // Public pricing page (SRS Section 15).
  @Public()
  @Get()
  listPublic() {
    return this.packagesService.listPublic();
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  adminList(@Query() query: PaginationQueryDto) {
    return this.packagesService.adminList(query.page, query.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packagesService.update(id, dto);
  }
}
