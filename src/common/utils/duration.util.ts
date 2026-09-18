import type { StringValue } from 'ms';

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses simple durations like "15m", "30d", "1h" into milliseconds. */
export function parseDurationToMs(input: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration format: "${input}"`);
  }

  const [, amount, unit] = match;
  return Number(amount) * UNIT_TO_MS[unit];
}

/**
 * Validates a config duration string (e.g. "15m") against our own format
 * and casts it to `ms`'s `StringValue`, which is what @nestjs/jwt /
 * jsonwebtoken require for `expiresIn`. Throws on an invalid format
 * instead of silently passing a bad value into token signing.
 */
export function asJwtDuration(input: string): StringValue {
  parseDurationToMs(input); // throws if the format is invalid
  return input as StringValue;
}
