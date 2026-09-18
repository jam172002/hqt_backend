import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CanActivate } from '@nestjs/common';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Role check only. Resource ownership/relationship checks (parent-child,
 * teacher-student assignment) are additional and enforced per-domain
 * (architecture spec Section 15) - this guard does not replace them.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !requiredRoles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException('Insufficient role for this operation');
    }

    return true;
  }
}
