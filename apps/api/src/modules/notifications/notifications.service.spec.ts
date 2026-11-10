import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const rows = [
    {
      id: 'n1',
      user_id: 'u1',
      type: 'match_won',
      title: '¡Ganaste!',
      body: 'Ganaste la partida.',
      data: {},
      read_at: null,
      created_at: '2026-11-10T00:00:00.000Z',
    },
    {
      id: 'n2',
      user_id: 'u1',
      type: 'challenge_accepted',
      title: 'Reto aceptado',
      body: 'Aceptaron tu reto.',
      data: {},
      read_at: '2026-11-10T01:00:00.000Z',
      created_at: '2026-11-10T00:30:00.000Z',
    },
  ];

  function makeService() {
    const db = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.startsWith('INSERT INTO notifications')) {
          return {
            rows: [
              {
                id: 'n9',
                user_id: params?.[0],
                type: params?.[1],
                title: params?.[2],
                body: params?.[3],
                data: {},
                read_at: null,
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (sql.includes('COUNT(*)') && sql.includes('read_at IS NULL') && !sql.includes('ORDER BY')) {
          return { rows: [{ count: '1' }] };
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '2' }] };
        }
        if (sql.startsWith('UPDATE notifications SET read_at')) {
          return { rows: [], rowCount: params?.[0] === 'n1' ? 1 : 0 };
        }
        return { rows };
      }),
    };
    return { db, service: new NotificationsService(db as never) };
  }

  it('crea una notificación y la lista con total y no leídas', async () => {
    const { service } = makeService();
    const created = await service.create({
      userId: 'u1',
      type: 'match_won',
      title: '¡Ganaste!',
      body: 'Ganaste.',
    });
    expect(created.id).toBe('n9');
    const list = await service.list('u1', { page: 1, limit: 20 });
    expect(list.total).toBe(2);
    expect(list.unreadCount).toBe(1);
    expect(list.items[0].read).toBe(false);
    expect(list.items[1].read).toBe(true);
  });

  it('filtra solo no leídas y marca una/all como leídas', async () => {
    const { db, service } = makeService();
    const unread = await service.list('u1', { page: 1, limit: 20, unread: true });
    expect(unread.total).toBe(1); // con unread=true el total cuenta solo no leídas
    expect(unread.unreadCount).toBe(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('read_at IS NULL'),
      expect.anything(),
    );
    expect(await service.markRead('u1', 'n1')).toBe(true);
    expect(await service.markRead('u1', 'inexistente')).toBe(false);
    expect(await service.markAllRead('u1')).toBe(0);
  });
});
