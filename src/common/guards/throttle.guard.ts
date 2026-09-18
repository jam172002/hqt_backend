import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { THROTTLE_KEY, type ThrottleOptions } from '../decorators/throttle.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory, fixed-window rate limiter, keyed by (route, caller IP).
 * Only acts on routes carrying @Throttle() - every other route is untouched.
 *
 * Not a general @nestjs/throttler replacement: no distributed/Redis backing,
 * so limits reset if the process restarts and aren't shared across horizontally
 * scaled instances. That's an acceptable tradeoff for a single-instance
 * deployment protecting a couple of public lead-capture endpoints from
 * scripted spam - @nestjs/throttler itself doesn't yet support NestJS 12
 * (its peerDependencies cap at ^11.0.0), so this avoids forcing an
 * unsupported peer-dependency install for a narrow, well-defined need.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const routePath = (request.route as { path?: string } | undefined)?.path ?? request.path;
    const routeKey = `${request.method} ${routePath}`;
    const clientIp = request.ip ?? 'unknown';
    const key = `${routeKey}:${clientIp}`;

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (bucket.count >= options.limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfterSeconds));
      // A plain string body (not an object) so AllExceptionsFilter's envelope
      // uses this exact message rather than falling back to the generic
      // "Too Many Requests" HTTP status text.
      throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    return true;
  }
}
