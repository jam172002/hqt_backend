import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const REDACTED_FIELDS = new Set(['password', 'refreshToken', 'accessToken']);

/**
 * Automatically logs every successful, *authenticated* mutation
 * (architecture spec Section 22's "minimum audit scope": role changes,
 * student/teacher admin, enrollment/teacher assignment, attendance
 * edits, progress edits, billing changes, CMS publishing, destructive
 * actions - all of which require auth). Registered globally so no
 * individual service needs manual instrumentation.
 *
 * Not covered here: authentication events themselves (register/login/
 * logout are @Public(), so there's no authenticated actor yet at that
 * point) - those would need dedicated instrumentation inside AuthService
 * if/when that audit sub-scope becomes a priority.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!MUTATING_METHODS.has(request.method) || !request.user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const routePath = (request.route as { path?: string } | undefined)?.path ?? request.path;
        // route.path includes the global prefix (e.g. "/api/v1/settings/:key"), so the
        // first meaningful segment is the domain/resource name, not "api"/"v1".
        const segments = routePath.split('/').filter(Boolean);
        while (segments.length > 1 && (segments[0] === 'api' || /^v\d+$/i.test(segments[0]))) {
          segments.shift();
        }
        const entityType = segments[0] ?? 'unknown';
        const entityId = typeof request.params.id === 'string' ? request.params.id : undefined;

        void this.auditService.log({
          actorUserId: request.user!.id,
          action: `${request.method} ${routePath}`,
          entityType,
          entityId,
          newValues: this.redact(request.body as Record<string, unknown>),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }),
    );
  }

  private redact(body: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    if (!body || typeof body !== 'object') {
      return undefined;
    }
    const clone: Record<string, unknown> = { ...body };
    for (const field of REDACTED_FIELDS) {
      if (field in clone) {
        clone[field] = '[REDACTED]';
      }
    }
    return clone as Prisma.InputJsonValue;
  }
}
