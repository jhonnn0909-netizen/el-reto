import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

class TestController {
  @Roles('ADMIN')
  adminOnly() {
    return 'admin';
  }

  open() {
    return 'open';
  }
}

function mockContext(role: string | undefined, handler: () => unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (RBAC en servidor)', () => {
  const guard = new RolesGuard(new Reflector());

  it('un usuario normal (USER) no puede acceder a un endpoint ADMIN (403)', () => {
    const ctx = mockContext('USER', TestController.prototype.adminOnly);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('un invitado (GUEST) tampoco puede acceder a un endpoint ADMIN (403)', () => {
    const ctx = mockContext('GUEST', TestController.prototype.adminOnly);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('un ADMIN sí puede acceder a un endpoint ADMIN', () => {
    const ctx = mockContext('ADMIN', TestController.prototype.adminOnly);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('sin decorador @Roles permite el paso (la autenticación la hace JwtAuthGuard)', () => {
    const ctx = mockContext(undefined, TestController.prototype.open);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
