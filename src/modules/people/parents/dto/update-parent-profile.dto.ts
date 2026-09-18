import { PartialType } from '@nestjs/mapped-types';
import { CreateParentProfileDto } from './create-parent-profile.dto';

/** Used for both self-service and admin updates - parent_profiles has no status field to gate. */
export class UpdateParentProfileDto extends PartialType(CreateParentProfileDto) {}
