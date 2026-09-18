import { Body, Controller, Param, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_CODES } from '../auth/constants/roles.constant';
import { UpdateTrialSessionDto } from './dto/trial-session.dto';
import { TrialSessionService } from './trial-session.service';

@Controller('crm/trial-sessions')
@Roles(ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN)
export class TrialSessionController {
  constructor(private readonly trialSessionService: TrialSessionService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrialSessionDto) {
    return this.trialSessionService.update(id, dto);
  }
}
