/**
 * Tipos del módulo de autenticación.
 *
 * CONTRATO: CONTRACTS.md §3.1, §4.1 y §9.2.
 * - Nunca se devuelve `password_hash`, `mfa_secret` ni hashes de tokens.
 * - `SafeUser` es la única forma de usuario que sale por la API.
 */

export type UserRole = 'USER' | 'ADMIN' | 'GUEST';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  email_verified_at: string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    mfaEnabled: row.mfa_enabled,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Par de tokens que devuelven login, refresh, guest y OAuth. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

/** Datos mínimos de la petición para auditoría y rate limiting. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Usuario autenticado que el JwtAuthGuard deja en `req.user`. */
export interface AuthenticatedUser extends SafeUser {
  /** Id de la fila de `sessions` que respalda el access token. */
  sessionId: string;
}

/** Fila de `sessions` (solo los campos que usa este módulo). */
export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

/** Proveedores OAuth admitidos (CONTRACTS: ampliación 2026-11-10). */
export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';

export interface OAuthAccountRow {
  id: string;
  user_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  email: string | null;
  created_at: string;
}

/** Perfil normalizado que devuelve cada proveedor OAuth. */
export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  displayName: string;
}
