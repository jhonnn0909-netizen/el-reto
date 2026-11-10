import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guardia RBAC reutilizable por todos los módulos (CONTRACTS.md §4.6).
 * - Lee los roles exigidos del decorador `@Roles(...)`.
 * - Sin decorador, permite el paso (la autenticación la hace JwtAuthGuard).
 * - Compara contra `req.user.role`, que el JwtAuthGuard resolvió desde
 *   la base de datos; nunca contra lo que envíe el cliente.
 * - Debe usarse siempre DESPUÉS de JwtAuthGuard.
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
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }
    return true;
  }
}
