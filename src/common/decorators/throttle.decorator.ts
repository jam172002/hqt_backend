import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'throttle';

export interface ThrottleOptions {
  /** Max requests allowed from one IP within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Rate-limits an endpoint per caller IP (SRS Section 46 "spam protection";
 * architecture Section 16 "rate-limiting on ... public forms"). Deliberately
 * opt-in per route, not a blanket global limit - see ThrottleGuard.
 */
export const Throttle = (limit: number, windowMs: number) =>
  SetMetadata(THROTTLE_KEY, { limit, windowMs } satisfies ThrottleOptions);
