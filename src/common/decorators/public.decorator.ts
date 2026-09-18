import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as not requiring authentication. Everything else is
 * protected by default via the global JwtAccessGuard (architecture spec
 * Section 2: "Every write path must be authorized server-side").
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
