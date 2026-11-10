import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { WalletService } from '../wallet/wallet.service';
import { TotpService } from './totp.service';
import {
  AuthTokens,
  AuthenticatedUser,
  OAuthAccountRow,
  OAuthProfile,
  OAuthProvider,
  RequestMeta,
  SafeUser,
  SessionRow,
  UserRow,
  toSafeUser,
} from './auth.types';
import { ConvertGuestDto, GuestDto } from './dto/guest.dto';
import { ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto, VerifyEmailDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * Nombres reservados (doc 05 §4.3): no se pueden registrar ni usar como
 * nombre de usuario, para que nadie imite al equipo de El Reto.
 */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrador',
  'elreto',
  'el-reto',
  'soporte',
  'sistema',
  'oficial',
]);

/** CONTRACTS.md §4.1: 3–30 caracteres, letras, números, `_` y `.`. */
export function isValidUsername(username: string): boolean {
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    return false;
  }
  if (username.startsWith('.') || username.startsWith('_')) {
    return false;
  }
  if (username.endsWith('.') || username.endsWith('_')) {
    return false;
  }
  if (/\.\.|__|\._|_\./.test(username)) {
    return false;
  }
  return !RESERVED_USERNAMES.has(username.toLowerCase());
}

/** CONTRACTS.md §4.1: mínimo 8 caracteres, con letra y número. */
export function validatePasswordPolicy(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new BadRequestException(
      'La contraseña debe tener entre 8 y 128 caracteres.',
    );
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new BadRequestException(
      'La contraseña debe contener al menos una letra y un número.',
    );
  }
}

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;
const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 60;
const MFA_CHALLENGE_TTL = '5m';
const MFA_MAX_ATTEMPTS = 3;
const OAUTH_STATE_TTL = '10m';

interface PendingMfa {
  secret: string;
  expiresAt: number;
}

interface MfaChallengeAttempts {
  count: number;
  expiresAt: number;
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Autenticación y usuarios (CONTRACTS.md §4.1, §4.2 y §9.2; ampliación
 * OAuth con Google y Facebook, 2026-11-10).
 *
 * - Contraseñas con bcrypt (BCRYPT_ROUNDS). Tokens de verificación y
 *   recuperación con hash SHA-256, caducidad y un solo uso.
 * - Refresh tokens opacos con rotación; la reutilización de uno ya
 *   rotado revoca TODAS las sesiones (posible robo, doc 05 §12.1).
 * - Sin SMTP en desarrollo: el enlace se registra en el log SOLO si no
 *   hay SMTP configurado y NODE_ENV no es production (DECISIONS.md D3).
 *   En producción el enlace se envía por correo y no se registra.
 * - Nunca se registran secretos ni tokens completos en logs, salvo el
 *   enlace de desarrollo anterior, exigido por el encargo.
 * - Nunca se devuelven password_hash, mfa_secret ni hashes de tokens.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Secretos TOTP pendientes de verificar (setup sin confirmar). */
  private readonly pendingMfa = new Map<string, PendingMfa>();
  /** Intentos fallidos de código MFA por desafío (doc 05 §11.3: 3 intentos). */
  private readonly mfaAttempts = new Map<string, MfaChallengeAttempts>();

  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly totpService: TotpService,
    // Opcional + forwardRef (AuthModule <-> WalletModule): en los tests
    // unitarios de AuthService no se inyecta y el bono se omite.
    @Optional()
    @Inject(forwardRef(() => WalletService))
    private readonly wallet?: WalletService,
  ) {}

  /**
   * Concede el bono de bienvenida DEMO (integración auth↔billetera,
   * CONTRACTS.md §4.1/§9.2). Si la billetera no está cableada (tests
   * unitarios), no hace nada. Si falla, registra el error y NO bloquea
   * el registro/conversión: el usuario queda creado y el bono se puede
   * conceder después llamando a `grantWelcomeBonus(userId)` (idempotente).
   */
  private async grantWelcomeBonusBestEffort(userId: string): Promise<void> {
    if (!this.wallet) return;
    try {
      await this.wallet.grantWelcomeBonus(userId);
    } catch (err) {
      this.logger.error(
        `No se pudo conceder el bono de bienvenida a ${userId}: ${err}`,
      );
    }
  }

  // ---------------------------------------------------------------- registro

  async register(dto: RegisterDto, meta: RequestMeta = {}): Promise<{ user: SafeUser; message: string }> {
    validatePasswordPolicy(dto.password);
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    if (!isValidUsername(username)) {
      throw new BadRequestException('El nombre de usuario no es válido.');
    }
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());
    const user = await this.db.transaction(async (client) => {
      const { rows: byUsername } = await client.query<UserRow>(
        'SELECT id FROM users WHERE lower(username) = lower($1)',
        [username],
      );
      const { rows: byEmail } = await client.query<UserRow>(
        'SELECT id FROM users WHERE email = $1',
        [email],
      );
      if (byUsername.length > 0 || byEmail.length > 0) {
        // Mensaje genérico: no revela si el problema es el nombre o el correo (doc 05 §5.3).
        throw new ConflictException('USERNAME_OR_EMAIL_TAKEN');
      }
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (username, email, password_hash, display_name, role, status)
         VALUES ($1, $2, $3, $4, 'USER', 'PENDING_VERIFICATION') RETURNING *`,
        [username, email, passwordHash, dto.displayName.trim()],
      );
      const created = rows[0];
      await client.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [created.id]);
      return created;
    });
    const rawToken = await this.createEmailVerificationToken(user.id);
    // Billetera demo con bienvenida (CONTRACTS.md §4.1).
    await this.grantWelcomeBonusBestEffort(user.id);
    await this.logSecurityEvent(user.id, 'REGISTER', meta);
    this.logDevLink('verificación de correo', user.id, rawToken);
    return {
      user: toSafeUser(user),
      message:
        'Cuenta creada. Revisa tu correo para verificarla; sin verificarla no acumulas ranking.',
    };
  }

  // ------------------------------------------------------------------ login

  async login(
    dto: LoginDto,
    meta: RequestMeta = {},
  ): Promise<AuthTokens | { mfaRequired: true; mfaToken: string }> {
    const email = dto.email.trim().toLowerCase();
    await this.checkLoginRateLimit(email, meta.ip);
    const user = await this.findUserByEmail(email);
    if (!user || !user.password_hash) {
      await this.recordLoginAttempt(email, meta.ip, false);
      await this.logSecurityEvent(null, 'LOGIN_FAILED', meta, { email });
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('ACCOUNT_SUSPENDED');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordOk) {
      await this.recordLoginAttempt(email, meta.ip, false);
      await this.logSecurityEvent(user.id, 'LOGIN_FAILED', meta);
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    if (user.mfa_enabled) {
      // Doc 05 §6.1 paso 4: la contraseña correcta no basta; se emite un
      // desafío MFA de un solo uso y 5 minutos, sin crear sesión todavía.
      const challengeId = randomBytes(16).toString('hex');
      const mfaToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: 'mfa-challenge', jti: challengeId },
        { secret: this.accessSecret(), expiresIn: MFA_CHALLENGE_TTL },
      );
      this.mfaAttempts.set(challengeId, {
        count: 0,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      await this.recordLoginAttempt(email, meta.ip, true);
      return { mfaRequired: true, mfaToken };
    }
    await this.recordLoginAttempt(email, meta.ip, true);
    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await this.logSecurityEvent(user.id, 'LOGIN_SUCCESS', meta);
    return this.issueTokens(user, meta);
  }

  /** Completa el inicio de sesión con MFA (desafío de /auth/login + TOTP). */
  async loginWithMfa(
    mfaToken: string,
    code: string,
    meta: RequestMeta = {},
  ): Promise<AuthTokens> {
    let payload: { sub?: string; purpose?: string; jti?: string };
    try {
      payload = await this.jwtService.verifyAsync(mfaToken, {
        secret: this.accessSecret(),
      });
    } catch {
      throw new UnauthorizedException('MFA_TOKEN_INVALID');
    }
    if (payload.purpose !== 'mfa-challenge' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('MFA_TOKEN_INVALID');
    }
    const attempts = this.mfaAttempts.get(payload.jti);
    if (!attempts || attempts.expiresAt < Date.now()) {
      this.mfaAttempts.delete(payload.jti);
      throw new UnauthorizedException('MFA_TOKEN_INVALID');
    }
    if (attempts.count >= MFA_MAX_ATTEMPTS) {
      this.mfaAttempts.delete(payload.jti);
      throw new UnauthorizedException('MFA_ATTEMPTS_EXCEEDED');
    }
    const user = await this.findUserById(payload.sub);
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      throw new UnauthorizedException('MFA_TOKEN_INVALID');
    }
    const ok = this.totpService.verifyCode(user.mfa_secret, code, 1);
    if (!ok) {
      attempts.count += 1;
      if (attempts.count >= MFA_MAX_ATTEMPTS) {
        this.mfaAttempts.delete(payload.jti);
        await this.logSecurityEvent(user.id, 'MFA_FAILED', meta);
        throw new UnauthorizedException('MFA_ATTEMPTS_EXCEEDED');
      }
      this.mfaAttempts.set(payload.jti, attempts);
      await this.logSecurityEvent(user.id, 'MFA_FAILED', meta);
      throw new UnauthorizedException('MFA_CODE_INVALID');
    }
    this.mfaAttempts.delete(payload.jti);
    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await this.logSecurityEvent(user.id, 'MFA_SUCCESS', meta);
    return this.issueTokens(user, meta);
  }

  async logout(user: AuthenticatedUser): Promise<{ message: string }> {
    await this.db.query(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [user.sessionId, user.id],
    );
    await this.logSecurityEvent(user.id, 'LOGOUT', {});
    return { message: 'Sesión cerrada.' };
  }

  // ---------------------------------------------------------------- refresh

  async refresh(dto: RefreshDto, meta: RequestMeta = {}): Promise<AuthTokens> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const { rows } = await this.db.query<SessionRow>(
      `SELECT s.* FROM sessions s
       WHERE s.refresh_token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }
    const user = await this.findUserById(row.user_id);
    if (!user) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }
    if (row.revoked_at) {
      // Reutilización de un refresh token ya rotado: posible robo.
      // Se revocan TODAS las sesiones de la cuenta (doc 05 §12.1, §12.5).
      await this.db.query(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id],
      );
      await this.logSecurityEvent(user.id, 'REFRESH_TOKEN_REUSED', meta);
      throw new UnauthorizedException('REFRESH_TOKEN_REUSED');
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('ACCOUNT_SUSPENDED');
    }
    // Rotación: revoca el token presentado y emite un par nuevo.
    await this.db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [row.id]);
    await this.logSecurityEvent(user.id, 'SESSION_REFRESHED', meta);
    return this.issueTokens(user, meta);
  }

  // ------------------------------------------------- verificación / recupero

  async verifyEmail(dto: VerifyEmailDto): Promise<{ verified: boolean; alreadyVerified?: boolean }> {
    const tokenHash = this.hashToken(dto.token);
    const { rows } = await this.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>('SELECT * FROM email_verification_tokens WHERE token_hash = $1', [tokenHash]);
    const token = rows[0];
    if (!token) {
      throw new BadRequestException('INVALID_VERIFICATION_TOKEN');
    }
    if (token.used_at) {
      throw new BadRequestException('VERIFICATION_TOKEN_ALREADY_USED');
    }
    if (new Date(token.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('VERIFICATION_TOKEN_EXPIRED');
    }
    const user = await this.findUserById(token.user_id);
    if (!user) {
      throw new BadRequestException('INVALID_VERIFICATION_TOKEN');
    }
    if (user.status === 'ACTIVE' && user.email_verified_at) {
      await this.db.query(
        'UPDATE email_verification_tokens SET used_at = now() WHERE id = $1',
        [token.id],
      );
      return { verified: true, alreadyVerified: true };
    }
    await this.db.transaction(async (client) => {
      await client.query(
        "UPDATE users SET status = 'ACTIVE', email_verified_at = now() WHERE id = $1",
        [user.id],
      );
      await client.query(
        'UPDATE email_verification_tokens SET used_at = now() WHERE id = $1',
        [token.id],
      );
    });
    await this.logSecurityEvent(user.id, 'EMAIL_VERIFIED', {});
    return { verified: true };
  }

  async forgotPassword(dto: ForgotPasswordDto, meta: RequestMeta = {}): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findUserByEmail(email);
    // Respuesta siempre idéntica, exista o no la cuenta (doc 05 §8.1).
    if (user && user.status !== 'SUSPENDED' && user.password_hash) {
      const rawToken = await this.createPasswordResetToken(user.id);
      this.logDevLink('recuperación de contraseña', user.id, rawToken);
      await this.logSecurityEvent(user.id, 'PASSWORD_RESET_REQUESTED', meta);
    }
    return {
      message:
        'Si existe una cuenta con ese correo, recibirás un mensaje con instrucciones.',
    };
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta = {}): Promise<{ message: string }> {
    validatePasswordPolicy(dto.newPassword);
    const tokenHash = this.hashToken(dto.token);
    const { rows } = await this.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    const token = rows[0];
    if (!token) {
      throw new BadRequestException('INVALID_RESET_TOKEN');
    }
    if (token.used_at) {
      throw new BadRequestException('RESET_TOKEN_ALREADY_USED');
    }
    if (new Date(token.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('RESET_TOKEN_EXPIRED');
    }
    const user = await this.findUserById(token.user_id);
    if (!user) {
      throw new BadRequestException('INVALID_RESET_TOKEN');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds());
    await this.db.transaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        passwordHash,
        user.id,
      ]);
      await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [
        token.id,
      ]);
      // El restablecimiento revoca TODAS las sesiones (doc 05 §8.1 paso 4).
      await client.query(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id],
      );
    });
    await this.logSecurityEvent(user.id, 'PASSWORD_RESET', meta);
    return { message: 'Contraseña actualizada. Inicia sesión con tu contraseña nueva.' };
  }

  /** Reenvío del correo de verificación (doc 05 §7.2). Respuesta genérica. */
  async resendVerification(
    dto: ForgotPasswordDto,
    meta: RequestMeta = {},
  ): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findUserByEmail(email);
    if (user && user.status === 'PENDING_VERIFICATION') {
      const rawToken = await this.createEmailVerificationToken(user.id);
      this.logDevLink('verificación de correo', user.id, rawToken);
      await this.logSecurityEvent(user.id, 'VERIFICATION_RESENT', meta);
    }
    return {
      message:
        'Si la cuenta existe y está pendiente de verificación, recibirás un mensaje nuevo.',
    };
  }

  async me(userId: string): Promise<SafeUser> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    return toSafeUser(user);
  }

  // -------------------------------------------------------------------- MFA

  async mfaSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    if (user.role === 'GUEST') {
      throw new ForbiddenException('GUEST_MFA_NOT_ALLOWED');
    }
    const secret = this.totpService.generateSecret();
    this.pendingMfa.set(userId, { secret, expiresAt: Date.now() + 10 * 60 * 1000 });
    return {
      secret,
      otpauthUrl: this.totpService.buildOtpauthUrl(secret, user.username),
    };
  }

  async mfaVerify(userId: string, code: string): Promise<{ mfaEnabled: boolean }> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    if (user.role === 'GUEST') {
      throw new ForbiddenException('GUEST_MFA_NOT_ALLOWED');
    }
    const pending = this.pendingMfa.get(userId);
    let secret: string | null = null;
    if (pending && pending.expiresAt > Date.now()) {
      secret = pending.secret;
    } else if (user.mfa_enabled && user.mfa_secret) {
      secret = user.mfa_secret;
    }
    if (!secret) {
      throw new BadRequestException('MFA_SETUP_REQUIRED');
    }
    if (!this.totpService.verifyCode(secret, code, 1)) {
      throw new BadRequestException('MFA_CODE_INVALID');
    }
    await this.db.query(
      'UPDATE users SET mfa_secret = $1, mfa_enabled = TRUE WHERE id = $2',
      [secret, user.id],
    );
    this.pendingMfa.delete(userId);
    await this.logSecurityEvent(user.id, 'MFA_ENABLED', {});
    return { mfaEnabled: true };
  }

  // --------------------------------------------------------------- sesiones

  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<
    Array<{
      id: string;
      userAgent: string | null;
      ipAddress: string | null;
      createdAt: string;
      expiresAt: string;
      lastUsedAt: string | null;
      current: boolean;
    }>
  > {
    const { rows } = await this.db.query<SessionRow>(
      `SELECT * FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      lastUsedAt: s.last_used_at,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ revoked: boolean }> {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
      [sessionId, userId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('SESSION_NOT_FOUND');
    }
    await this.logSecurityEvent(userId, 'SESSION_REVOKED', {});
    return { revoked: true };
  }

  // --------------------------------------------------------- invitado (§9.2)

  async guest(dto: GuestDto, meta: RequestMeta = {}): Promise<AuthTokens> {
    const displayName = dto.displayName.trim();
    if (
      displayName.length < 3 ||
      displayName.length > 30 ||
      /[<>&\p{C}]/u.test(displayName)
    ) {
      throw new BadRequestException('El nombre debe tener entre 3 y 30 caracteres.');
    }
    const user = await this.createGuestUser(displayName);
    await this.logSecurityEvent(user.id, 'GUEST_CREATED', meta);
    return this.issueTokens(user, meta);
  }

  async convertGuest(
    currentUser: AuthenticatedUser,
    dto: ConvertGuestDto,
    meta: RequestMeta = {},
  ): Promise<AuthTokens> {
    if (currentUser.role !== 'GUEST') {
      throw new ForbiddenException('NOT_A_GUEST');
    }
    validatePasswordPolicy(dto.password);
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    if (!isValidUsername(username)) {
      throw new BadRequestException('El nombre de usuario no es válido.');
    }
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());
    const user = await this.db.transaction(async (client) => {
      const { rows: byUsername } = await client.query<UserRow>(
        'SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2',
        [username, currentUser.id],
      );
      const { rows: byEmail } = await client.query<UserRow>(
        'SELECT id FROM users WHERE email = $1 AND id <> $2',
        [email, currentUser.id],
      );
      if (byUsername.length > 0 || byEmail.length > 0) {
        throw new ConflictException('USERNAME_OR_EMAIL_TAKEN');
      }
      const { rows } = await client.query<UserRow>(
        `UPDATE users
         SET username = $1, email = $2, password_hash = $3, role = 'USER',
             status = 'PENDING_VERIFICATION', email_verified_at = NULL
         WHERE id = $4 RETURNING *`,
        [username, email, passwordHash, currentUser.id],
      );
      return rows[0];
    });
    const rawToken = await this.createEmailVerificationToken(user.id);
    // La conversión crea la billetera con los créditos de bienvenida
    // (CONTRACTS.md §9.2).
    await this.grantWelcomeBonusBestEffort(user.id);
    // La sesión de invitado se revoca: el par nuevo ya es de usuario registrado.
    await this.db.query(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2',
      [currentUser.sessionId, user.id],
    );
    await this.logSecurityEvent(user.id, 'GUEST_CONVERTED', meta);
    this.logDevLink('verificación de correo', user.id, rawToken);
    return this.issueTokens(user, meta);
  }

  // ------------------------------------------------------- OAuth (Google/FB)

  /** ¿Están configuradas las credenciales del proveedor? (503 si no). */
  isOAuthConfigured(provider: OAuthProvider): boolean {
    const config = this.getOAuthConfig(provider);
    return config !== null;
  }

  /** URL de autorización de Google (GET /auth/google). */
  async buildGoogleAuthUrl(): Promise<string> {
    const config = this.requireOAuthConfig('GOOGLE');
    const state = await this.signOAuthState('GOOGLE');
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** URL de autorización de Facebook (GET /auth/facebook). */
  async buildFacebookAuthUrl(): Promise<string> {
    const config = this.requireOAuthConfig('FACEBOOK');
    const state = await this.signOAuthState('FACEBOOK');
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  /** Callback de Google: intercambia el code y devuelve tokens (find-or-create). */
  async handleGoogleCallback(
    code: string,
    state: string,
    meta: RequestMeta = {},
  ): Promise<AuthTokens> {
    this.requireOAuthConfig('GOOGLE');
    await this.verifyOAuthState(state, 'GOOGLE');
    if (!code) {
      throw new BadRequestException('OAUTH_CODE_REQUIRED');
    }
    const config = this.getOAuthConfig('GOOGLE') as OAuthConfig;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('OAUTH_EXCHANGE_FAILED');
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException('OAUTH_EXCHANGE_FAILED');
    }
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileRes.ok) {
      throw new UnauthorizedException('OAUTH_PROFILE_FAILED');
    }
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.sub || !profile.email) {
      throw new BadRequestException('OAUTH_EMAIL_REQUIRED');
    }
    if (profile.email_verified === false) {
      throw new BadRequestException('OAUTH_EMAIL_NOT_VERIFIED');
    }
    return this.handleOAuthLogin(
      {
        provider: 'GOOGLE',
        providerUserId: profile.sub,
        email: profile.email.trim().toLowerCase(),
        displayName: (profile.name ?? '').trim() || profile.email.split('@')[0],
      },
      meta,
    );
  }

  /** Callback de Facebook: intercambia el code y devuelve tokens (find-or-create). */
  async handleFacebookCallback(
    code: string,
    state: string,
    meta: RequestMeta = {},
  ): Promise<AuthTokens> {
    this.requireOAuthConfig('FACEBOOK');
    await this.verifyOAuthState(state, 'FACEBOOK');
    if (!code) {
      throw new BadRequestException('OAUTH_CODE_REQUIRED');
    }
    const config = this.getOAuthConfig('FACEBOOK') as OAuthConfig;
    const tokenParams = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      client_secret: config.clientSecret,
      code,
    });
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams.toString()}`,
    );
    if (!tokenRes.ok) {
      throw new UnauthorizedException('OAUTH_EXCHANGE_FAILED');
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException('OAUTH_EXCHANGE_FAILED');
    }
    const meParams = new URLSearchParams({
      fields: 'id,name,email',
      access_token: tokenData.access_token,
    });
    const profileRes = await fetch(
      `https://graph.facebook.com/v18.0/me?${meParams.toString()}`,
    );
    if (!profileRes.ok) {
      throw new UnauthorizedException('OAUTH_PROFILE_FAILED');
    }
    const profile = (await profileRes.json()) as {
      id?: string;
      name?: string;
      email?: string;
    };
    if (!profile.id) {
      throw new BadRequestException('OAUTH_PROFILE_FAILED');
    }
    // Facebook puede no devolver el correo si el usuario no concedió el
    // permiso `email`: sin correo verificado no se puede crear ni vincular.
    if (!profile.email) {
      throw new BadRequestException('OAUTH_EMAIL_REQUIRED');
    }
    return this.handleOAuthLogin(
      {
        provider: 'FACEBOOK',
        providerUserId: profile.id,
        email: profile.email.trim().toLowerCase(),
        displayName: (profile.name ?? '').trim() || profile.email.split('@')[0],
      },
      meta,
    );
  }

  /**
   * Find-or-create OAuth:
   * - Si el proveedor ya está vinculado a una cuenta, entra con ella.
   * - Si el correo ya existe en `users`, vincula el proveedor a esa cuenta.
   * - Si no existe, crea la cuenta (username derivado del correo, con
   *   sufijo si hace falta; email_verified_at = ahora, porque el
   *   proveedor ya verificó el correo).
   * Devuelve el mismo par de tokens que el login.
   */
  async handleOAuthLogin(profile: OAuthProfile, meta: RequestMeta = {}): Promise<AuthTokens> {
    const user = await this.db.transaction(async (client) => {
      const { rows: linked } = await client.query<OAuthAccountRow>(
        'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        [profile.provider, profile.providerUserId],
      );
      if (linked.length > 0) {
        const { rows } = await client.query<UserRow>(
          'SELECT * FROM users WHERE id = $1',
          [linked[0].user_id],
        );
        if (rows.length === 0) {
          throw new UnauthorizedException('OAUTH_ACCOUNT_NOT_FOUND');
        }
        return { user: rows[0], event: 'OAUTH_LOGIN' as const };
      }
      const { rows: byEmail } = await client.query<UserRow>(
        'SELECT * FROM users WHERE email = $1',
        [profile.email],
      );
      if (byEmail.length > 0) {
        const existing = byEmail[0];
        if (existing.status === 'SUSPENDED') {
          throw new ForbiddenException('ACCOUNT_SUSPENDED');
        }
        await client.query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
           VALUES ($1, $2, $3, $4)`,
          [existing.id, profile.provider, profile.providerUserId, profile.email],
        );
        return { user: existing, event: 'OAUTH_LINKED' as const };
      }
      const username = await this.deriveUniqueUsername(client, profile.email);
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (username, email, password_hash, display_name, role, status, email_verified_at)
         VALUES ($1, $2, NULL, $3, 'USER', 'ACTIVE', now()) RETURNING *`,
        [username, profile.email, profile.displayName.slice(0, 100)],
      );
      const created = rows[0];
      await client.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [created.id]);
      await client.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
         VALUES ($1, $2, $3, $4)`,
        [created.id, profile.provider, profile.providerUserId, profile.email],
      );
      return { user: created, event: 'OAUTH_REGISTERED' as const };
    });
    if (user.user.status === 'SUSPENDED') {
      throw new ForbiddenException('ACCOUNT_SUSPENDED');
    }
    // Misma bienvenida que en el registro con correo, solo cuando el
    // OAuth creó la cuenta (CONTRACTS.md §4.1).
    if (user.event === 'OAUTH_REGISTERED') {
      await this.grantWelcomeBonusBestEffort(user.user.id);
    }
    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.user.id]);
    await this.logSecurityEvent(user.user.id, user.event, meta, {
      provider: profile.provider,
    });
    return this.issueTokens(user.user, meta);
  }

  // ------------------------------------------------------------ auxiliares

  private accessSecret(): string {
    return this.configService.get<string>('jwt.accessSecret') as string;
  }

  private bcryptRounds(): number {
    return Number(this.configService.get<number>('bcryptRounds') ?? 12);
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private randomToken(): string {
    return randomBytes(32).toString('hex');
  }

  private parseTtlToMs(ttl: string, fallbackMs: number): number {    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) {
      return fallbackMs;
    }
    const value = Number(match[1]);
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * (multipliers[match[2]] ?? 1);
  }

  private ttlSeconds(ttl: string | undefined, fallbackSeconds: number): number {
    if (!ttl) {
      return fallbackSeconds;
    }
    return Math.floor(this.parseTtlToMs(ttl, fallbackSeconds * 1000) / 1000);
  }

  /**
   * Emite un par de tokens y crea la fila de sesión con el hash del
   * refresh token (nunca se guarda el token en claro).
   */
  private async issueTokens(user: UserRow, meta: RequestMeta): Promise<AuthTokens> {
    const refreshToken = this.randomToken();
    const refreshTtl = this.configService.get<string>('jwt.refreshTtl') ?? '7d';
    const expiresAt = new Date(Date.now() + this.parseTtlToMs(refreshTtl, 7 * 24 * 60 * 60 * 1000));
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.id, this.hashToken(refreshToken), meta.userAgent ?? null, meta.ip ?? null, expiresAt],
    );
    const sessionId = rows[0].id;
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.username, role: user.role, sid: sessionId },
      {
        secret: this.accessSecret(),
        expiresIn: this.ttlSeconds(this.configService.get<string>('jwt.accessTtl'), 900),
      },
    );
    return { accessToken, refreshToken, user: toSafeUser(user) };
  }

  private async findUserById(id: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  private async findUserByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ?? null;
  }

  private async createGuestUser(displayName: string): Promise<UserRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = `invitado-${randomBytes(4).toString('hex')}`;
      try {
        const { rows } = await this.db.query<UserRow>(
          `INSERT INTO users (username, email, password_hash, display_name, role, status)
           VALUES ($1, NULL, NULL, $2, 'GUEST', 'ACTIVE') RETURNING *`,
          [username, displayName],
        );
        await this.db.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [rows[0].id]);
        return rows[0];
      } catch (err) {
        // Colisión del username generado (UNIQUE lower(username)): reintentar.
        if ((err as { code?: string }).code === '23505' && attempt < 4) {
          continue;
        }
        throw err;
      }
    }
    throw new HttpException('GUEST_CREATION_FAILED', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async createEmailVerificationToken(userId: string): Promise<string> {
    const rawToken = this.randomToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
    await this.db.query(
      `UPDATE email_verification_tokens SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    await this.db.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, this.hashToken(rawToken), expiresAt],
    );
    return rawToken;
  }

  private async createPasswordResetToken(userId: string): Promise<string> {
    const rawToken = this.randomToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
    await this.db.query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    await this.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, this.hashToken(rawToken), expiresAt],
    );
    return rawToken;
  }

  /**
   * Rate limiting de login (CONTRACTS.md §4.1): 5 intentos fallidos en
   * 15 min por IP+email, apoyado en la tabla `login_attempts`. El guard
   * de `@nestjs/throttler` en el controlador aplica el mismo umbral.
   */
  private async checkLoginRateLimit(email: string, ip?: string): Promise<void> {
    const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);
    const { rows } = ip
      ? await this.db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM login_attempts
           WHERE email = $1 AND ip_address = $2 AND success = FALSE AND attempted_at > $3`,
          [email, ip, since],
        )
      : await this.db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM login_attempts
           WHERE email = $1 AND success = FALSE AND attempted_at > $2`,
          [email, since],
        );
    if (Number(rows[0]?.count ?? 0) >= LOGIN_MAX_FAILURES) {
      await this.logSecurityEvent(null, 'LOGIN_RATE_LIMITED', { ip }, { email });
      throw new HttpException('TOO_MANY_LOGIN_ATTEMPTS', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordLoginAttempt(email: string, ip: string | undefined, success: boolean): Promise<void> {
    await this.db.query(
      'INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)',
      [email, ip ?? null, success],
    );
  }

  private async logSecurityEvent(
    userId: string | null,
    eventType: string,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO security_events (user_id, event_type, ip_address, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, eventType, meta.ip ?? null, meta.userAgent ?? null, JSON.stringify(metadata)],
      );
    } catch (err) {
      // La auditoría nunca debe romper el flujo principal.
      this.logger.warn(`No se pudo registrar el evento ${eventType}: ${(err as Error).message}`);
    }
  }

  /**
   * Enlace de desarrollo (sin SMTP, DECISIONS.md D3). Solo se registra
   * si no hay SMTP configurado y no es producción; en producción el
   * enlace se envía por correo y NO se registra.
   */
  private logDevLink(kind: string, userId: string, rawToken: string): void {
    const smtpHost = this.configService.get<string>('smtp.host') ?? '';
    if (smtpHost || process.env.NODE_ENV === 'production') {
      return;
    }
    const webUrl = this.configService.get<string>('webUrl') ?? 'http://localhost:3000';
    this.logger.log(
      `[SOLO DESARROLLO — sin SMTP] Enlace de ${kind} para el usuario ${userId}: ` +
        `${webUrl}/verificar?token=${rawToken}. En producción este enlace se envía por correo y no se registra.`,
    );
  }

  // ------------------------------------------------------------ OAuth aux.

  private getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
    const clientId =
      provider === 'GOOGLE'
        ? this.configService.get<string>('GOOGLE_CLIENT_ID')
        : this.configService.get<string>('FACEBOOK_APP_ID');
    const clientSecret =
      provider === 'GOOGLE'
        ? this.configService.get<string>('GOOGLE_CLIENT_SECRET')
        : this.configService.get<string>('FACEBOOK_APP_SECRET');
    const redirectUri =
      provider === 'GOOGLE'
        ? this.configService.get<string>('GOOGLE_REDIRECT_URI')
        : this.configService.get<string>('FACEBOOK_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) {
      return null;
    }
    return { clientId, clientSecret, redirectUri };
  }

  private requireOAuthConfig(provider: OAuthProvider): OAuthConfig {
    const config = this.getOAuthConfig(provider);
    if (!config) {
      throw new HttpException(
        'OAUTH_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return config;
  }

  /** Estado OAuth firmado (JWT de 10 min) contra CSRF en el callback. */
  private async signOAuthState(provider: OAuthProvider): Promise<string> {
    return this.jwtService.signAsync(
      { purpose: 'oauth-state', provider, nonce: randomBytes(16).toString('hex') },
      { secret: this.accessSecret(), expiresIn: OAUTH_STATE_TTL },
    );
  }

  private async verifyOAuthState(state: string, provider: OAuthProvider): Promise<void> {
    if (!state) {
      throw new BadRequestException('OAUTH_INVALID_STATE');
    }
    try {
      const payload = await this.jwtService.verifyAsync(state, {
        secret: this.accessSecret(),
      });
      if (payload.purpose !== 'oauth-state' || payload.provider !== provider) {
        throw new Error('state inválido');
      }
    } catch {
      throw new BadRequestException('OAUTH_INVALID_STATE');
    }
  }

  /** Deriva un username único del correo (local part saneada + sufijo). */
  private async deriveUniqueUsername(client: PoolClient, email: string): Promise<string> {
    const local = email.split('@')[0].toLowerCase();
    let base = local.replace(/[^a-z0-9_.]/g, '').slice(0, 30);
    if (base.length < 3) {
      base = `jugador${base}`;
    }
    if (isValidUsername(base)) {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(username) = lower($1)',
        [base],
      );
      if (rows.length === 0) {
        return base;
      }
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomBytes(2).toString('hex');
      const candidate = `${base.slice(0, 25)}-${suffix}`;
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(username) = lower($1)',
        [candidate],
      );
      if (rows.length === 0) {
        return candidate;
      }
    }
    return `jugador-${randomBytes(4).toString('hex')}`;
  }
}
