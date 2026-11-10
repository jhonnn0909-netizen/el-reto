import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../../database/database.service';
import { AuthenticatedUser, UserRow } from '../auth.types';
import { toSafeUser } from '../auth.types';

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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = JwtAuthGuard.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('MISSING_TOKEN');
    }
    let payload: { sub?: string; sid?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    const { rows } = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user) {
      throw new UnauthorizedException('INVALID_TOKEN');
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
      throw new UnauthorizedException('SESSION_REVOKED');
    }
    const authenticated: AuthenticatedUser = {
      ...toSafeUser(user),
      sessionId: payload.sid,
    };
    request.user = authenticated;
    return true;
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
