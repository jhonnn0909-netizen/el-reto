import { AdminService } from './admin.service';

/* Base de datos falsa: responde según el SQL que emite el servicio. */
function makeDb() {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('(SELECT COUNT(*)::text FROM users) AS users')) {
      return { rows: [{ users: '3', matches: '5', challenges: '2', credits: '2600' }] };
    }
    if (sql.includes('SELECT COUNT(*)::text AS total FROM users')) {
      return { rows: [{ total: '2' }] };
    }
    if (sql.includes('FROM users ORDER BY created_at DESC')) {
      return {
        rows: [
          {
            id: 'u1', username: 'ana', email: 'ana@prueba.local', password_hash: 'x',
            display_name: 'Ana', avatar_url: null, role: 'USER', status: 'ACTIVE',
            email_verified_at: null, mfa_enabled: false, mfa_secret: null,
            last_login_at: null, created_at: '2026-11-10T10:00:00.000Z',
            updated_at: '2026-11-10T10:00:00.000Z',
          },
          {
            id: 'u2', username: 'bruno', email: 'bruno@prueba.local', password_hash: 'x',
            display_name: 'Bruno', avatar_url: null, role: 'ADMIN', status: 'ACTIVE',
            email_verified_at: '2026-11-10T09:00:00.000Z', mfa_enabled: false, mfa_secret: null,
            last_login_at: null, created_at: '2026-11-10T09:00:00.000Z',
            updated_at: '2026-11-10T09:00:00.000Z',
          },
        ],
      };
    }
    if (sql.includes('SELECT COUNT(*)::text AS total FROM matches')) {
      return { rows: [{ total: '1' }] };
    }
    if (sql.includes('FROM matches m')) {
      return {
        rows: [
          {
            id: 'm1', challenge_id: 'c1', format: 'BEST_OF_3', game_type: 'RPS',
            stake_credits: 100, status: 'FINISHED', score1: 1, score2: 0,
            player1_id: 'u1', player2_id: 'u2', winner_id: 'u1',
            player1_username: 'ana', player2_username: 'bruno',
            created_at: '2026-11-10T10:05:00.000Z', finished_at: '2026-11-10T10:06:00.000Z',
          },
        ],
      };
    }
    if (sql.includes('SELECT COUNT(*)::text AS total FROM audit_logs')) {
      return { rows: [{ total: '1' }] };
    }
    if (sql.includes('FROM audit_logs')) {
      return {
        rows: [
          {
            id: '7', actor_id: 'u2', action: 'PROMO_CREATED', entity_type: 'promo_code',
            entity_id: null, old_value: null, new_value: { code: 'PROMO10' },
            ip_address: null, created_at: '2026-11-10T10:07:00.000Z',
          },
        ],
      };
    }
    throw new Error(`SQL no esperado en la prueba: ${sql}`);
  });
  return { query };
}

describe('AdminService (lecturas de administración)', () => {
  let db: ReturnType<typeof makeDb>;
  let service: AdminService;

  beforeEach(() => {
    db = makeDb();
    service = new AdminService(db as never);
  });

  it('stats: contadores y créditos en circulación', async () => {
    const stats = await service.getStats();
    expect(stats).toEqual({
      users: 3,
      matches: 5,
      challenges: 2,
      creditsInCirculation: 2600,
    });
  });

  it('users: paginado y sin datos sensibles (sin password_hash)', async () => {
    const page = await service.listUsers(1, 20);
    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.data[0]).toMatchObject({
      id: 'u1',
      username: 'ana',
      displayName: 'Ana',
      role: 'USER',
    });
    expect(page.data[0]).not.toHaveProperty('password_hash');
    expect(page.data[1].role).toBe('ADMIN');
  });

  it('matches: vista de partida con nombres y marcador', async () => {
    const page = await service.listMatches(1, 20);
    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({
      id: 'm1',
      player1Username: 'ana',
      player2Username: 'bruno',
      score1: 1,
      score2: 0,
      status: 'FINISHED',
      winnerId: 'u1',
    });
    expect(page.data[0].score).toEqual({ player1: 1, player2: 0 });
  });

  it('audit: entradas del registro con campos en camelCase', async () => {
    const page = await service.listAudit(1, 20);
    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({
      id: 7,
      actorId: 'u2',
      action: 'PROMO_CREATED',
      entityType: 'promo_code',
    });
    expect(page.data[0].newValue).toEqual({ code: 'PROMO10' });
  });
});
