import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  list() {
    return this.settingsService.list();
  }

  @Get(':key')
  getByKey(@Param('key') key: string) {
    return this.settingsService.getByKey(key);
  }

  // SUPER_ADMIN only, tighter than the controller's default ADMIN+SUPER_ADMIN read access.
  @Roles(ROLE_CODES.SUPER_ADMIN)
  @Put(':key')
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
  ) {
    return this.settingsService.upsert(key, dto, user.id);
  }
}
