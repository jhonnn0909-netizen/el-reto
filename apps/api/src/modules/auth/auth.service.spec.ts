import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../database/database.service';
import { AuthService } from './auth.service';
import { UserRow } from './auth.types';
import { TotpService } from './totp.service';

const ACCESS_SECRET = 'test-access-secret';

/** Fila de `users` con valores por defecto sobrescribibles. */
function userRow(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    username: 'jhon',
    email: 'jhon@example.com',
    password_hash: 'hashed',
    display_name: 'Jhon',
    avatar_url: null,
    role: 'USER',
    status: 'ACTIVE',
    email_verified_at: '2026-11-10T00:00:00.000Z',
    mfa_enabled: false,
    mfa_secret: null,
    last_login_at: null,
    created_at: '2026-11-10T00:00:00.000Z',
    updated_at: '2026-11-10T00:00:00.000Z',
    ...over,
  };
}

type Route = [pattern: string, result: unknown | ((sql: string, params?: unknown[]) => unknown)];

/** Mock de DatabaseService que responde según el SQL (sin Postgres). */
function createDbMock() {
  const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
  const transaction = jest.fn(async (fn: (client: { query: jest.Mock<any, any> }) => Promise<unknown>) =>
    fn({ query }),
  );
  const db = { query, transaction } as unknown as DatabaseService;
  return { db, query, transaction };
}

function routeQuery(query: jest.Mock<any, any>, routes: Route[]) {
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    for (const [pattern, result] of routes) {
      if (sql.includes(pattern)) {
        const value = typeof result === 'function' ? (result as (s: string, p?: unknown[]) => unknown)(sql, params) : result;
        return value as { rows: unknown[] };
      }
    }
    return { rows: [] };
  });
}

function createService(query: jest.Mock<any, any>, configOverrides: Record<string, string | number> = {}) {
  const configMap: Record<string, string | number> = {
    'jwt.accessSecret': ACCESS_SECRET,
    'jwt.accessTtl': '15m',
    'jwt.refreshTtl': '7d',
    bcryptRounds: 4,
    webUrl: 'http://localhost:3000',
    'smtp.host': '',
    ...configOverrides,
  };
  const configService = {
    get: jest.fn((key: string) => configMap[key]),
  } as unknown as ConfigService;
  const service = new AuthService(
    { query, transaction: jest.fn(async (fn: (c: { query: jest.Mock<any, any> }) => Promise<unknown>) => fn({ query })) } as unknown as DatabaseService,
    new JwtService({}),
    configService,
    new TotpService(),
  );
  return { service, configService };
}

const OAUTH_CONFIG = {
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/v1/auth/google/callback',
  FACEBOOK_APP_ID: 'fb-app-id',
  FACEBOOK_APP_SECRET: 'fb-app-secret',
  FACEBOOK_REDIRECT_URI: 'http://localhost:4000/api/v1/auth/facebook/callback',
};

describe('AuthService', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------- registro
  describe('register', () => {
    it('crea el usuario PENDING_VERIFICATION con token de verificación y sin exponer el hash', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const created = userRow({ username: 'Jhon', status: 'PENDING_VERIFICATION', email_verified_at: null });
      routeQuery(query, [
        ['SELECT id FROM users WHERE lower(username)', { rows: [] }],
        ['SELECT id FROM users WHERE email', { rows: [] }],
        ['INSERT INTO users', { rows: [created] }],
      ]);
      const result = await service.register({
        username: 'Jhon',
        email: 'Jhon@Example.com',
        password: 'Password1',
        displayName: 'Jhon',
      });
      expect(result.user.username).toBe('Jhon');
      expect(result.user.status).toBe('PENDING_VERIFICATION');
      expect('password_hash' in result.user).toBe(false);
      expect('mfa_secret' in result.user).toBe(false);
      // Se creó el token de verificación (hash, no en claro).
      expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO email_verification_tokens'))).toBe(true);
    });

    it('rechaza el nombre duplicado sin distinción de mayúsculas (409 genérico)', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      routeQuery(query, [
        ['SELECT id FROM users WHERE lower(username)', { rows: [{ id: 'other' }] }],
        ['SELECT id FROM users WHERE email', { rows: [] }],
      ]);
      await expect(
        service.register({ username: 'JHON', email: 'nuevo@example.com', password: 'Password1', displayName: 'X' }),
      ).rejects.toThrow('USERNAME_OR_EMAIL_TAKEN');
    });

    it('rechaza contraseñas débiles (menos de 8, sin letra o sin número)', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      await expect(
        service.register({ username: 'nuevo', email: 'n@example.com', password: 'corta1', displayName: 'X' }),
      ).rejects.toThrow();
      await expect(
        service.register({ username: 'nuevo', email: 'n@example.com', password: 'sinnumeros', displayName: 'X' }),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------- login
  describe('login', () => {
    function loginRoutes(user: UserRow, failures = '0'): Route[] {
      return [
        ['FROM login_attempts', { rows: [{ count: failures }] }],
        ['SELECT * FROM users WHERE email', { rows: [user] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-1' }] }],
      ];
    }

    it('devuelve el par de tokens y el access token lleva sub/sid/rol', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow({ password_hash: bcrypt.hashSync('Password1', 4) });
      routeQuery(query, loginRoutes(user));
      const result = await service.login({ email: 'jhon@example.com', password: 'Password1' }, { ip: '10.0.0.1' });
      expect('mfaRequired' in result).toBe(false);
      const tokens = result as { accessToken: string; refreshToken: string; user: unknown };
      expect(tokens.refreshToken).toBeTruthy();
      const payload = await new JwtService({}).verifyAsync(tokens.accessToken, { secret: ACCESS_SECRET });
      expect(payload.sub).toBe('user-1');
      expect(payload.sid).toBe('sess-1');
      expect(payload.role).toBe('USER');
    });

    it('contraseña incorrecta → 401 genérico y registra el intento fallido', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow({ password_hash: bcrypt.hashSync('Password1', 4) });
      routeQuery(query, loginRoutes(user));
      await expect(
        service.login({ email: 'jhon@example.com', password: 'WrongPass1' }, { ip: '10.0.0.1' }),
      ).rejects.toThrow('INVALID_CREDENTIALS');
      const attempt = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO login_attempts'));
      expect(attempt?.[1]?.[2]).toBe(false);
    });

    it('5 fallos en 15 min por IP+email → 429 TOO_MANY_LOGIN_ATTEMPTS', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow({ password_hash: bcrypt.hashSync('Password1', 4) });
      routeQuery(query, loginRoutes(user, '5'));
      await expect(
        service.login({ email: 'jhon@example.com', password: 'Password1' }, { ip: '10.0.0.1' }),
      ).rejects.toMatchObject({ status: 429 });
    });

    it('cuenta suspendida → 403', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow({ status: 'SUSPENDED', password_hash: bcrypt.hashSync('Password1', 4) });
      routeQuery(query, loginRoutes(user));
      await expect(
        service.login({ email: 'jhon@example.com', password: 'Password1' }, {}),
      ).rejects.toThrow('ACCOUNT_SUSPENDED');
    });

    it('con MFA activado devuelve el desafío y loginWithMfa completa el login', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
      const user = userRow({
        password_hash: bcrypt.hashSync('Password1', 4),
        mfa_enabled: true,
        mfa_secret: secret,
      });
      routeQuery(query, [
        ...loginRoutes(user),
        ['SELECT * FROM users WHERE id', { rows: [user] }],
      ]);
      const challenge = await service.login({ email: 'jhon@example.com', password: 'Password1' }, {});
      expect(challenge).toMatchObject({ mfaRequired: true });
      const { mfaToken } = challenge as { mfaToken: string };
      const code = new TotpService().generateCode(secret);
      const tokens = await service.loginWithMfa(mfaToken, code, {});
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.user.mfaEnabled).toBe(true);
    });

    it('3 códigos MFA incorrectos agotan el desafío', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow({
        password_hash: bcrypt.hashSync('Password1', 4),
        mfa_enabled: true,
        mfa_secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      });
      routeQuery(query, [
        ...loginRoutes(user),
        ['SELECT * FROM users WHERE id', { rows: [user] }],
      ]);
      const { mfaToken } = (await service.login(
        { email: 'jhon@example.com', password: 'Password1' },
        {},
      )) as { mfaToken: string };
      await expect(service.loginWithMfa(mfaToken, '000000', {})).rejects.toThrow('MFA_CODE_INVALID');
      await expect(service.loginWithMfa(mfaToken, '000000', {})).rejects.toThrow('MFA_CODE_INVALID');
      await expect(service.loginWithMfa(mfaToken, '000000', {})).rejects.toThrow('MFA_ATTEMPTS_EXCEEDED');
    });
  });

  // --------------------------------------------------------------- refresh
  describe('refresh (rotación)', () => {
    it('rota el refresh token: revoca el anterior y emite un par nuevo', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow();
      const session = {
        id: 'sess-old',
        user_id: 'user-1',
        refresh_token_hash: 'x',
        user_agent: null,
        ip_address: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
        last_used_at: null,
      };
      routeQuery(query, [
        ['SELECT s.* FROM sessions', { rows: [session] }],
        ['SELECT * FROM users WHERE id', { rows: [user] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-new' }] }],
      ]);
      const result = await service.refresh({ refreshToken: 'raw-refresh-token' }, {});
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).not.toBe('raw-refresh-token');
      const payload = await new JwtService({}).verifyAsync(result.accessToken, { secret: ACCESS_SECRET });
      expect(payload.sid).toBe('sess-new');
    });

    it('reutilizar un refresh token ya rotado revoca TODAS las sesiones (401)', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow();
      const revokedSession = {
        id: 'sess-old',
        user_id: 'user-1',
        refresh_token_hash: 'x',
        user_agent: null,
        ip_address: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: new Date().toISOString(),
        last_used_at: null,
      };
      routeQuery(query, [
        ['SELECT s.* FROM sessions', { rows: [revokedSession] }],
        ['SELECT * FROM users WHERE id', { rows: [user] }],
      ]);
      await expect(service.refresh({ refreshToken: 'reused-token' }, {})).rejects.toThrow(
        'REFRESH_TOKEN_REUSED',
      );
      expect(
        query.mock.calls.some(
          ([sql]) =>
            sql.includes('UPDATE sessions SET revoked_at = now()') && sql.includes('user_id = $1'),
        ),
      ).toBe(true);
    });
  });

  // --------------------------------------------- verificación y recuperación
  describe('verifyEmail / forgotPassword / resetPassword', () => {
    it('verify-email activa la cuenta PENDING_VERIFICATION', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const pending = userRow({ status: 'PENDING_VERIFICATION', email_verified_at: null });
      routeQuery(query, [
        [
          'SELECT * FROM email_verification_tokens',
          { rows: [{ id: 'tok-1', user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), used_at: null }] },
        ],
        ['SELECT * FROM users WHERE id', { rows: [pending] }],
      ]);
      const result = await service.verifyEmail({ token: 'raw-token' });
      expect(result).toEqual({ verified: true });
    });

    it('verify-email con token caducado → 400', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      routeQuery(query, [
        [
          'SELECT * FROM email_verification_tokens',
          { rows: [{ id: 'tok-1', user_id: 'user-1', expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null }] },
        ],
      ]);
      await expect(service.verifyEmail({ token: 'raw-token' })).rejects.toThrow(
        'VERIFICATION_TOKEN_EXPIRED',
      );
    });

    it('verify-email con token ya usado → 400', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      routeQuery(query, [
        [
          'SELECT * FROM email_verification_tokens',
          { rows: [{ id: 'tok-1', user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), used_at: new Date().toISOString() }] },
        ],
      ]);
      await expect(service.verifyEmail({ token: 'raw-token' })).rejects.toThrow(
        'VERIFICATION_TOKEN_ALREADY_USED',
      );
    });

    it('forgot-password responde siempre 200, exista o no la cuenta', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      routeQuery(query, [['SELECT * FROM users WHERE email', { rows: [] }]]);
      const result = await service.forgotPassword({ email: 'nadie@example.com' }, {});
      expect(result.message).toBeTruthy();
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO password_reset_tokens')),
      ).toBe(false);
    });

    it('reset-password válido cambia el hash y revoca todas las sesiones', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow({ password_hash: bcrypt.hashSync('OldPass1', 4) });
      routeQuery(query, [
        [
          'SELECT * FROM password_reset_tokens',
          { rows: [{ id: 'tok-1', user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), used_at: null }] },
        ],
        ['SELECT * FROM users WHERE id', { rows: [user] }],
      ]);
      const result = await service.resetPassword({ token: 'raw-token', newPassword: 'NewPass9' }, {});
      expect(result.message).toBeTruthy();
      const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE users SET password_hash'));
      expect(update).toBeTruthy();
      await expect(bcrypt.compare('NewPass9', update?.[1]?.[0] as string)).resolves.toBe(true);
      expect(
        query.mock.calls.some(([sql]) => sql.includes('UPDATE sessions SET revoked_at = now()')),
      ).toBe(true);
    });
  });

  // ------------------------------------------------------------ invitado
  describe('guest / convertGuest', () => {
    it('guest crea un GUEST sin correo ni contraseña y devuelve tokens', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const guest = userRow({
        username: 'invitado-ab12cd34',
        email: null,
        password_hash: null,
        display_name: 'Invitado',
        role: 'GUEST',
      });
      routeQuery(query, [
        ['INSERT INTO users', { rows: [guest] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-g' }] }],
      ]);
      const result = await service.guest({ displayName: 'Invitado' }, {});
      expect(result.user.role).toBe('GUEST');
      expect(result.user.status).toBe('ACTIVE');
      expect(result.user.username.startsWith('invitado-')).toBe(true);
      expect(result.user.email).toBeNull();
      expect(result.accessToken).toBeTruthy();
    });

    it('convert-guest convierte a USER PENDING_VERIFICATION y emite tokens nuevos', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const guestUser = {
        id: 'guest-1',
        username: 'invitado-ab12cd34',
        displayName: 'Invitado',
        email: null,
        avatarUrl: null,
        role: 'GUEST' as const,
        status: 'ACTIVE' as const,
        emailVerifiedAt: null,
        mfaEnabled: false,
        lastLoginAt: null,
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
        sessionId: 'sess-g',
      };
      const converted = userRow({
        id: 'guest-1',
        username: 'jhon',
        email: 'jhon@example.com',
        display_name: 'Invitado',
        role: 'USER',
        status: 'PENDING_VERIFICATION',
        email_verified_at: null,
      });
      routeQuery(query, [
        ['SELECT id FROM users WHERE lower(username)', { rows: [] }],
        ['SELECT id FROM users WHERE email', { rows: [] }],
        ['UPDATE users', { rows: [converted] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-new' }] }],
      ]);
      const result = await service.convertGuest(
        guestUser,
        { username: 'jhon', email: 'jhon@example.com', password: 'Password1' },
        {},
      );
      expect(result.user.role).toBe('USER');
      expect(result.user.status).toBe('PENDING_VERIFICATION');
      expect(result.user.id).toBe('guest-1');
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO email_verification_tokens')),
      ).toBe(true);
    });

    it('convert-guest con un usuario no invitado → 403', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const normalUser = {
        id: 'user-1',
        username: 'jhon',
        displayName: 'Jhon',
        email: 'jhon@example.com',
        avatarUrl: null,
        role: 'USER' as const,
        status: 'ACTIVE' as const,
        emailVerifiedAt: '2026-11-10T00:00:00.000Z',
        mfaEnabled: false,
        lastLoginAt: null,
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
        sessionId: 'sess-1',
      };
      await expect(
        service.convertGuest(
          normalUser,
          { username: 'otro', email: 'o@example.com', password: 'Password1' },
          {},
        ),
      ).rejects.toThrow('NOT_A_GUEST');
    });
  });

  // ------------------------------------------------------------------ MFA
  describe('mfa setup/verify', () => {
    it('setup devuelve secreto + URL otpauth y verify activa el MFA con el código correcto', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow();
      routeQuery(query, [['SELECT * FROM users WHERE id', { rows: [user] }]]);
      const setup = await service.mfaSetup('user-1');
      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.otpauthUrl).toContain('otpauth://totp/');
      const code = new TotpService().generateCode(setup.secret);
      const result = await service.mfaVerify('user-1', code);
      expect(result).toEqual({ mfaEnabled: true });
      expect(
        query.mock.calls.some(([sql]) => sql.includes('UPDATE users SET mfa_secret')),
      ).toBe(true);
    });

    it('verify con código incorrecto → 400', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      const user = userRow();
      routeQuery(query, [['SELECT * FROM users WHERE id', { rows: [user] }]]);
      await service.mfaSetup('user-1');
      await expect(service.mfaVerify('user-1', '000000')).rejects.toThrow('MFA_CODE_INVALID');
    });
  });

  // -------------------------------------------------------------- sesiones
  describe('sessions', () => {
    it('listSessions marca la sesión actual', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      routeQuery(query, [
        [
          'SELECT * FROM sessions',
          {
            rows: [
              { id: 'sess-1', user_agent: 'UA', ip_address: '10.0.0.1', created_at: '2026-11-10T00:00:00.000Z', expires_at: '2026-11-17T00:00:00.000Z', last_used_at: null },
              { id: 'sess-2', user_agent: 'UA2', ip_address: '10.0.0.2', created_at: '2026-11-10T00:00:00.000Z', expires_at: '2026-11-17T00:00:00.000Z', last_used_at: null },
            ],
          },
        ],
      ]);
      const sessions = await service.listSessions('user-1', 'sess-1');
      expect(sessions).toHaveLength(2);
      expect(sessions[0].current).toBe(true);
      expect(sessions[1].current).toBe(false);
    });

    it('revokeSession de una sesión ajena → 404 (no revela si existe)', async () => {
      const { query } = createDbMock();
      const { service } = createService(query);
      routeQuery(query, [['UPDATE sessions SET revoked_at', { rows: [] }]]);
      await expect(service.revokeSession('user-1', 'sess-ajena')).rejects.toThrow(
        'SESSION_NOT_FOUND',
      );
    });
  });

  // ------------------------------------------------------- OAuth (Google/FB)
  describe('OAuth Google / Facebook', () => {
    async function signState(provider: 'GOOGLE' | 'FACEBOOK'): Promise<string> {
      return new JwtService({}).signAsync(
        { purpose: 'oauth-state', provider, nonce: 'nonce-1' },
        { secret: ACCESS_SECRET, expiresIn: '10m' },
      );
    }

    function mockGoogleFetch(profile: Record<string, unknown>) {
      global.fetch = jest.fn(async (url: string) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return { ok: true, json: async () => ({ access_token: 'google-at' }) } as Response;
        }
        if (String(url).includes('openidconnect.googleapis.com/v1/userinfo')) {
          return { ok: true, json: async () => profile } as Response;
        }
        return { ok: false, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch;
    }

    function mockFacebookFetch(profile: Record<string, unknown>) {
      global.fetch = jest.fn(async (url: string) => {
        if (String(url).includes('/oauth/access_token')) {
          return { ok: true, json: async () => ({ access_token: 'fb-at' }) } as Response;
        }
        if (String(url).includes('/me?')) {
          return { ok: true, json: async () => profile } as Response;
        }
        return { ok: false, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch;
    }

    it('sin credenciales configuradas → 503 OAUTH_NOT_CONFIGURED (y la app no depende de ellas)', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, {});
      await expect(service.buildGoogleAuthUrl()).rejects.toMatchObject({
        status: 503,
        message: 'OAUTH_NOT_CONFIGURED',
      });
      await expect(service.buildFacebookAuthUrl()).rejects.toMatchObject({
        status: 503,
        message: 'OAUTH_NOT_CONFIGURED',
      });
      expect(service.isOAuthConfigured('GOOGLE')).toBe(false);
      expect(service.isOAuthConfigured('FACEBOOK')).toBe(false);
    });

    it('con credenciales, buildGoogleAuthUrl apunta a Google con scope openid email profile', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      const url = await service.buildGoogleAuthUrl();
      expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
      expect(url).toContain(`client_id=${OAUTH_CONFIG.GOOGLE_CLIENT_ID}`);
      expect(url).toContain('scope=openid+email+profile');
      const fbUrl = await service.buildFacebookAuthUrl();
      expect(fbUrl.startsWith('https://www.facebook.com/v18.0/dialog/oauth?')).toBe(true);
      expect(fbUrl).toContain(`client_id=${OAUTH_CONFIG.FACEBOOK_APP_ID}`);
    });

    it('callback de Google con perfil válido crea la cuenta y devuelve tokens', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      mockGoogleFetch({
        sub: 'google-123',
        email: 'nueva@example.com',
        email_verified: true,
        name: 'Nueva Jugadora',
      });
      const created = userRow({
        id: 'user-oauth',
        username: 'nueva',
        email: 'nueva@example.com',
        password_hash: null,
        display_name: 'Nueva Jugadora',
        status: 'ACTIVE',
        email_verified_at: '2026-11-10T00:00:00.000Z',
      });
      routeQuery(query, [
        ['SELECT * FROM oauth_accounts', { rows: [] }],
        ['SELECT * FROM users WHERE email', { rows: [] }],
        ['SELECT id FROM users WHERE lower(username)', { rows: [] }],
        ['INSERT INTO users', { rows: [created] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-oauth' }] }],
      ]);
      const result = await service.handleGoogleCallback('code-valido', await signState('GOOGLE'), {});
      expect(result.user.email).toBe('nueva@example.com');
      expect(result.user.status).toBe('ACTIVE');
      expect(result.user.username).toBe('nueva');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO oauth_accounts')),
      ).toBe(true);
    });

    it('callback de Google vincula el proveedor si el correo ya existe', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      mockGoogleFetch({
        sub: 'google-999',
        email: 'jhon@example.com',
        email_verified: true,
        name: 'Jhon',
      });
      const existing = userRow();
      routeQuery(query, [
        ['SELECT * FROM oauth_accounts', { rows: [] }],
        ['SELECT * FROM users WHERE email', { rows: [existing] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-oauth' }] }],
      ]);
      const result = await service.handleGoogleCallback('code-valido', await signState('GOOGLE'), {});
      expect(result.user.id).toBe('user-1');
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO oauth_accounts')),
      ).toBe(true);
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO users')),
      ).toBe(false);
    });

    it('callback de Google con code inválido → error sin crear cuenta', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) }) as Response) as unknown as typeof fetch;
      await expect(
        service.handleGoogleCallback('code-malo', await signState('GOOGLE'), {}),
      ).rejects.toThrow('OAUTH_EXCHANGE_FAILED');
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO users')),
      ).toBe(false);
    });

    it('callback de Google con state inválido → 400 sin llamar al proveedor', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      await expect(
        service.handleGoogleCallback('code-valido', 'state-falso', {}),
      ).rejects.toThrow('OAUTH_INVALID_STATE');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('callback de Facebook con perfil válido crea/vincula y devuelve tokens', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      mockFacebookFetch({ id: 'fb-1', name: 'Face User', email: 'fb@example.com' });
      const created = userRow({
        id: 'user-fb',
        username: 'fb',
        email: 'fb@example.com',
        password_hash: null,
        display_name: 'Face User',
        status: 'ACTIVE',
        email_verified_at: '2026-11-10T00:00:00.000Z',
      });
      routeQuery(query, [
        ['SELECT * FROM oauth_accounts', { rows: [] }],
        ['SELECT * FROM users WHERE email', { rows: [] }],
        ['SELECT id FROM users WHERE lower(username)', { rows: [] }],
        ['INSERT INTO users', { rows: [created] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-fb' }] }],
      ]);
      const result = await service.handleFacebookCallback('code-valido', await signState('FACEBOOK'), {});
      expect(result.user.email).toBe('fb@example.com');
      expect(result.accessToken).toBeTruthy();
    });

    it('callback de Facebook sin correo → 400 OAUTH_EMAIL_REQUIRED', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      mockFacebookFetch({ id: 'fb-1', name: 'Face User' });
      await expect(
        service.handleFacebookCallback('code-valido', await signState('FACEBOOK'), {}),
      ).rejects.toThrow('OAUTH_EMAIL_REQUIRED');
    });

    it('username derivado del correo con sufijo si el nombre ya está ocupado', async () => {
      const { query } = createDbMock();
      const { service } = createService(query, OAUTH_CONFIG);
      mockGoogleFetch({
        sub: 'google-555',
        email: 'jhon@example.com',
        email_verified: true,
        name: 'Otro Jhon',
      });
      // El correo no existe como cuenta, pero el username 'jhon' sí.
      routeQuery(query, [
        ['SELECT * FROM oauth_accounts', { rows: [] }],
        ['SELECT * FROM users WHERE email', { rows: [] }],
        ['SELECT id FROM users WHERE lower(username)', { rows: [{ id: 'other' }] }],
        ['INSERT INTO users', { rows: [userRow({ username: 'jhon-ab12', email: 'jhon@example.com' })] }],
        ['INSERT INTO sessions', { rows: [{ id: 'sess-oauth' }] }],
      ]);
      // Segunda comprobación de unicidad (con sufijo) devuelve libre.
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id FROM users WHERE lower(username)')) {
          const calls = query.mock.calls.filter(([s]) => s.includes('SELECT id FROM users WHERE lower(username)'));
          return { rows: calls.length > 1 ? [] : [{ id: 'other' }] };
        }
        if (sql.includes('SELECT * FROM oauth_accounts')) return { rows: [] };
        if (sql.includes('SELECT * FROM users WHERE email')) return { rows: [] };
        if (sql.includes('INSERT INTO users')) return { rows: [userRow({ username: 'jhon-ab12', email: 'jhon@example.com' })] };
        if (sql.includes('INSERT INTO sessions')) return { rows: [{ id: 'sess-oauth' }] };
        return { rows: [] };
      });
      const result = await service.handleGoogleCallback('code-valido', await signState('GOOGLE'), {});
      expect(result.user.username).not.toBe('jhon');
      expect(result.user.username.startsWith('jhon-')).toBe(true);
    });
  });
});
