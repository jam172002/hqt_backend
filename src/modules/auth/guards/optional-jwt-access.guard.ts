import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Like JwtAccessGuard, but never rejects the request for a missing or
 * invalid token - it just leaves request.user undefined. For use on
 * @Public() routes that still want to recognize a caller when a valid
 * token IS present (e.g. Media: PUBLIC files are readable by anyone, but
 * a PRIVATE file should still only be readable by its owner or an admin -
 * both cases need to know who, if anyone, is calling).
 */
@Injectable()
export class OptionalJwtAccessGuard extends AuthGuard('jwt-access') {
  // Explicit no-arg constructor, matching JwtAccessGuard's pattern: without
  // one, Nest's DI tries to resolve the mixin base class's own
  // AuthModuleOptions constructor param against *this* module's providers
  // and fails, even though that param is @Optional() on the base class -
  // declaring our own (parameter-less) constructor here is what actually
  // stops Nest from attempting that resolution.
  constructor() {
    super();
  }

  handleRequest<TUser = AuthenticatedUser | undefined>(_err: unknown, user: AuthenticatedUser | false): TUser {
    return (user || undefined) as TUser;
  }
}
