import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Stamps every request with a correlation/request ID (architecture spec
 * Section 21 - Observability) so it can be tied together across logs,
 * error responses and downstream provider calls.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
