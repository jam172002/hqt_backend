import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts an endpoint to the given role codes on top of authentication
 * (e.g. @Roles('ADMIN', 'SUPER_ADMIN')). Role checks are still not
 * sufficient alone for resource ownership - see RolesGuard and the
 * per-domain resource policies called out in the architecture spec
 * Section 15.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
