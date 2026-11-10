import { PresenceService } from './presence.service';

function makeRedis() {
  const store = new Map<string, number>();
  const hashes = new Map<string, Map<string, string>>();
  return {
    store,
    hashes,
    zadd: jest.fn(async (_key: string, score: number, member: string) => {
      store.set(member, score);
      return 1;
    }),
    expire: jest.fn(async () => 1),
    zremrangebyscore: jest.fn(async (_key: string, _min: number, max: number) => {
      let n = 0;
      for (const [m, s] of [...store.entries()]) {
        if (s <= max) {
          store.delete(m);
          n++;
        }
      }
      return n;
    }),
    zrangebyscore: jest.fn(async (_key: string, min: number, _max: string) => {
      return [...store.entries()]
        .filter(([, s]) => s >= min)
        .map(([m]) => m);
    }),
    zrem: jest.fn(async (_key: string, member: string) => {
      store.delete(member);
      return 1;
    }),
    hset: jest.fn(async (key: string, field: string, value: string) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key)!.set(field, value);
      return 1;
    }),
    hdel: jest.fn(async (key: string, field: string) => {
      hashes.get(key)?.delete(field);
      return 1;
    }),
    hgetall: jest.fn(async (key: string) => {
      return Object.fromEntries(hashes.get(key) ?? []);
    }),
  };
}

describe('PresenceService', () => {
  it('heartbeat registra en Redis y getOnline deriva estados', async () => {
    const redis = makeRedis();
    const now = Date.now();
    await redis.zadd('presence:online', now, 'u1');
    await redis.zadd('presence:online', now, 'u2');
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM users')) {
          return {
            rows: [
              { id: 'u1', username: 'ana', display_name: 'Ana' },
              { id: 'u2', username: 'bruno', display_name: 'Bruno' },
            ],
          };
        }
        if (sql.includes('FROM matches')) {
          return {
            rows: [
              { player1_id: 'u1', player2_id: 'u2', status: 'IN_PROGRESS' },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const service = new PresenceService(
      redis as never,
      db as never,
    );
    await service.heartbeat('u1');
    const online = await service.getOnline();
    expect(online).toHaveLength(2);
    expect(online.find((o) => o.userId === 'u1')?.status).toBe('JUGANDO');
    expect(online.find((o) => o.userId === 'u2')?.status).toBe('JUGANDO');
    expect(redis.expire).toHaveBeenCalledWith('presence:online', 60);
  });

  it('sin partida ni reto, el estado es LIBRE; con reto abierto, RETO GENERADO', async () => {
    const redis = makeRedis();
    const now = Date.now();
    await redis.zadd('presence:online', now, 'u1');
    await redis.zadd('presence:online', now, 'u2');
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM users')) {
          return {
            rows: [
              { id: 'u1', username: 'ana', display_name: 'Ana' },
              { id: 'u2', username: 'bruno', display_name: 'Bruno' },
            ],
          };
        }
        if (sql.includes('FROM challenges')) {
          return { rows: [{ creator_id: 'u2' }] };
        }
        return { rows: [] };
      }),
    };
    const service = new PresenceService(redis as never, db as never);
    const online = await service.getOnline();
    expect(online.find((o) => o.userId === 'u1')?.status).toBe('LIBRE');
    expect(online.find((o) => o.userId === 'u2')?.status).toBe('RETO_GENERADO');
  });

  it('espectadores: añadir, listar y quitar por partida', async () => {
    const redis = makeRedis();
    const service = new PresenceService(redis as never, {} as never);
    await service.addSpectator('m1', 'u9', 'Mirona');
    const list = await service.listSpectators('m1');
    expect(list).toEqual({ count: 1, names: ['Mirona'] });
    await service.removeSpectator('m1', 'u9');
    expect(await service.listSpectators('m1')).toEqual({ count: 0, names: [] });
  });
});
