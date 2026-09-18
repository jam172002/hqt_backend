import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

const STATUSES = [
  'NEW',
  'CONTACTED',
  'TRIAL_SCHEDULED',
  'TRIAL_COMPLETED',
  'ENROLLED',
  'REJECTED',
  'CLOSED',
] as const;

export class TrialRequestQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsUUID()
  courseId?: string;
}
