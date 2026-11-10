import { DatabaseService } from '../../database/database.service';
import { UsersService } from './users.service';
import { UserRow } from '../auth/auth.types';

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

describe('UsersService', () => {
  function createService(query: jest.Mock<any, any>) {
    const db = {
      query,
      transaction: jest.fn(async (fn: (c: { query: jest.Mock<any, any> }) => Promise<unknown>) => fn({ query })),
    } as unknown as DatabaseService;
    return new UsersService(db);
  }

  function routeQuery(query: jest.Mock<any, any>, routes: Array<[string, unknown]>) {
    query.mockImplementation(async (sql: string) => {
      for (const [pattern, result] of routes) {
        if (sql.includes(pattern)) {
          return result as { rows: unknown[] };
        }
      }
      return { rows: [] };
    });
  }

  it('checkUsername: libre → true; ocupado (otra capitalización) → false', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    routeQuery(query, [['SELECT id FROM users WHERE lower(username)', { rows: [{ id: 'other' }] }]]);
    await expect(service.checkUsername('JHON')).resolves.toEqual({ available: false });
  });

  it('checkUsername: nombre libre → true; formato inválido o reservado → false', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    await expect(service.checkUsername('nuevo_usuario')).resolves.toEqual({ available: true });
    await expect(service.checkUsername('ab')).resolves.toEqual({ available: false });
    await expect(service.checkUsername('admin')).resolves.toEqual({ available: false });
    await expect(service.checkUsername('con espacios')).resolves.toEqual({ available: false });
  });

  it('getMe devuelve perfil + billetera (resumen) y nunca el hash', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    routeQuery(query, [
      ['SELECT * FROM users WHERE id', { rows: [userRow()] }],
      ['SELECT bio, country FROM user_profiles', { rows: [{ bio: 'Hola', country: 'CO' }] }],
      [
        'SELECT available_balance',
        { rows: [{ available_balance: '1000', reserved_balance: '0', currency: 'CREDITO' }] },
      ],
    ]);
    const me = await service.getMe('user-1');
    expect(me.username).toBe('jhon');
    expect(me.bio).toBe('Hola');
    expect(me.country).toBe('CO');
    expect(me.wallet).toEqual({ available: 1000, reserved: 0, currency: 'CREDITO' });
    expect('password_hash' in me).toBe(false);
    expect('email' in me && me.email).toBe('jhon@example.com');
  });

  it('getMe sin billetera devuelve wallet null', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    routeQuery(query, [
      ['SELECT * FROM users WHERE id', { rows: [userRow()] }],
      ['SELECT bio, country FROM user_profiles', { rows: [] }],
      ['SELECT available_balance', { rows: [] }],
    ]);
    const me = await service.getMe('user-1');
    expect(me.wallet).toBeNull();
  });

  it('updateMe actualiza displayName y perfil, y devuelve el perfil actualizado', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    routeQuery(query, [
      ['SELECT * FROM users WHERE id', { rows: [userRow({ display_name: 'Jhon Nuevo' })] }],
      ['SELECT bio, country FROM user_profiles', { rows: [{ bio: 'Nueva bio', country: 'CO' }] }],
      ['SELECT available_balance', { rows: [] }],
    ]);
    const me = await service.updateMe('user-1', { displayName: 'Jhon Nuevo', bio: 'Nueva bio', country: 'CO' });
    expect(me.displayName).toBe('Jhon Nuevo');
    expect(me.bio).toBe('Nueva bio');
    expect(
      query.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_profiles')),
    ).toBe(true);
  });

  it('getPublicProfile devuelve perfil público + ranking con posición, sin correo', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    routeQuery(query, [
      ['SELECT * FROM users WHERE lower(username)', { rows: [userRow()] }],
      [
        'SELECT * FROM rankings',
        { rows: [{ wins: 5, losses: 2, ties: 1, matches_played: 8, points: 15 }] },
      ],
      ['SELECT COUNT(*)::text AS position FROM rankings', { rows: [{ position: '1' }] }],
    ]);
    const profile = await service.getPublicProfile('jhon');
    expect(profile.username).toBe('jhon');
    expect('email' in profile).toBe(false);
    expect(profile.ranking).toEqual({
      wins: 5,
      losses: 2,
      ties: 1,
      matchesPlayed: 8,
      points: 15,
      position: 2,
    });
  });

  it('getPublicProfile de un invitado devuelve ranking null', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    routeQuery(query, [
      [
        'SELECT * FROM users WHERE lower(username)',
        { rows: [userRow({ username: 'invitado-ab12cd34', email: null, role: 'GUEST' })] },
      ],
    ]);
    const profile = await service.getPublicProfile('invitado-ab12cd34');
    expect(profile.role).toBe('GUEST');
    expect(profile.ranking).toBeNull();
  });

  it('getPublicProfile inexistente → 404', async () => {
    const query: jest.Mock<any, any> = jest.fn(async () => ({ rows: [] }));
    const service = createService(query);
    await expect(service.getPublicProfile('nadie')).rejects.toThrow('USER_NOT_FOUND');
  });
});
