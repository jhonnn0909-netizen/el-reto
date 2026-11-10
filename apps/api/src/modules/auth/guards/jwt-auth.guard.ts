import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../../database/database.service';
import { AuthenticatedUser, UserRow } from '../auth.types';
import { toSafeUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guardia JWT (CONTRACTS.md §4.1; doc 05 §12.6, §13.1).
 * - Verifica el Bearer token con `jwt.accessSecret`.
 * - Resuelve el rol desde la base de datos (tabla `users`); el `role` del
 *   token es solo informativo y NUNCA se usa para autorizar.
 * - Comprueba que la sesión (`sid` del token) exista, no esté revocada
 *   ni caducada: la revocación tiene efecto inmediato aunque el access
 *   token aún no haya caducado.
 * - Una cuenta SUSPENDED no accede a nada (403).
 * - Deja `req.user: AuthenticatedUser` (SafeUser + sessionId).
 *
 * Compatible con el guardia provisional del módulo Wallet (misma forma
 * de `req.user`: id, role, status); este es el guardia compartido y el
 * de Wallet debe sustituirse por este en la integración (coordinador).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService,
    protected readonly db: DatabaseService,
    /**
     * Opcional para no romper construcciones manuales en tests: sin
     * Reflector no hay rutas públicas y todo exige token (como antes).
     */
    protected readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Ruta pública (@Public()): se entra sin token, pero si el cliente
    // trae uno válido se resuelve el usuario igual (así un usuario con
    // sesión ve también sus retos privados en la lista pública).
    // Un token ausente o inválido en ruta pública NO bloquea: se entra
    // como anónimo y el servicio decide qué ve (solo lo público).
    const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      try {
        const authed = await this.resolveUser(request);
        if (authed) request.user = authed;
      } catch {
        // Anónimo: sin usuario.
      }
      return true;
    }
    const authenticated = await this.resolveUser(request, true);
    request.user = authenticated;
    return true;
  }

  /**
   * Resuelve el usuario del Bearer token. Con `required=true` lanza
   * 401/403 como antes; con `required=false` devuelve null si no hay
   * token válido (ruta pública).
   */
  private async resolveUser(
    request: { headers?: Record<string, string | string[] | undefined> },
    required = false,
  ): Promise<AuthenticatedUser | null> {
    const token = JwtAuthGuard.extractToken(request);
    if (!token) {
      if (required) throw new UnauthorizedException('MISSING_TOKEN');
      return null;
    }
    let payload: { sub?: string; sid?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
    } catch {
      if (required) throw new UnauthorizedException('INVALID_TOKEN');
      return null;
    }
    if (!payload.sub || !payload.sid) {
      if (required) throw new UnauthorizedException('INVALID_TOKEN');
      return null;
    }
    const { rows } = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user) {
      if (required) throw new UnauthorizedException('INVALID_TOKEN');
      return null;
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('ACCOUNT_SUSPENDED');
    }
    const { rows: sessions } = await this.db.query<{ revoked_at: string | null }>(
      'SELECT revoked_at FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > now()',
      [payload.sid, user.id],
    );
    const session = sessions[0];
    if (!session || session.revoked_at) {
      if (required) throw new UnauthorizedException('SESSION_REVOKED');
      return null;
    }
    return {
      ...toSafeUser(user),
      sessionId: payload.sid,
    };
  }

  static extractToken(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | null {
    const header = request.headers?.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !value.startsWith('Bearer ')) {
      return null;
    }
    return value.slice('Bearer '.length).trim() || null;
  }
}
