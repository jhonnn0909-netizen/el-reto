import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/database.tokens';
import { DatabaseService } from '../../database/database.service';
import { PresenceEntry, PresenceStatus } from './game.types';

/**
 * Presencia en línea REAL entre dispositivos (mejora 11 de Jhon):
 * solo Redis, sin tabla (CONTRACTS.md §3.4).
 * - `presence:online`: sorted set userId -> último heartbeat (ms).
 *   TTL 60 s; el cliente envía `presence:heartbeat` cada 20 s.
 * - Espectadores de una partida: hash `spectators:<matchId>`
 *   userId -> displayName, con expiración.
 * La lista se reconstruye desde Redis en cada lectura, así que dos
 * teléfonos ven la misma lista. Si Redis no responde, la lectura
 * devuelve lista vacía y registra el error (no se inventa presencia).
 */
export const PRESENCE_KEY = 'presence:online';
export const PRESENCE_TTL_SECONDS = 60;
const SPECTATOR_TTL_SECONDS = 300;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: DatabaseService,
  ) {}

  /** Heartbeat de un usuario en línea. */
  async heartbeat(userId: string): Promise<void> {
    const now = Date.now();
    await this.redis.zadd(PRESENCE_KEY, now, userId);
    await this.redis.expire(PRESENCE_KEY, PRESENCE_TTL_SECONDS);
  }

  /** Quita a un usuario de la presencia (desconexión limpia). */
  async remove(userId: string): Promise<void> {
    await this.redis.zrem(PRESENCE_KEY, userId);
  }

  /** IDs en línea (últimos 60 s), podando los expirados. */
  async onlineIds(): Promise<string[]> {
    const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
    try {
      await this.redis.zremrangebyscore(PRESENCE_KEY, '-inf', cutoff);
      return await this.redis.zrangebyscore(PRESENCE_KEY, cutoff, '+inf');
    } catch (err) {
      this.logger.error(`No se pudo leer la presencia en Redis: ${err}`);
      return [];
    }
  }

  /**
   * Lista de personas en línea con estado derivado (CONTRACTS §3.4):
   * JUGANDO (partida IN_PROGRESS) > RETO PENDIENTE (aceptó un reto,
   * partida WAITING como retado) > POR JUGAR (partida WAITING como
   * creador) > RETO GENERADO (reto OPEN creado) > LIBRE.
   */
  async getOnline(): Promise<PresenceEntry[]> {
    const ids = await this.onlineIds();
    if (ids.length === 0) return [];
    const usersRes = await this.db.query<{
      id: string;
      username: string;
      display_name: string;
    }>('SELECT id, username, display_name FROM users WHERE id = ANY($1)', [
      ids,
    ]);
    const byId = new Map(usersRes.rows.map((u) => [u.id, u]));
    const matchesRes = await this.db.query<{
      player1_id: string;
      player2_id: string;
      status: string;
    }>(
      `SELECT player1_id, player2_id, status FROM matches
       WHERE status IN ('WAITING', 'IN_PROGRESS')
       AND (player1_id = ANY($1) OR player2_id = ANY($1))`,
      [ids],
    );
    const challengesRes = await this.db.query<{ creator_id: string }>(
      `SELECT creator_id FROM challenges
       WHERE status = 'OPEN' AND creator_id = ANY($1)`,
      [ids],
    );
    const openCreators = new Set(challengesRes.rows.map((r) => r.creator_id));
    const statusByUser = new Map<string, PresenceStatus>();
    for (const m of matchesRes.rows) {
      if (m.status === 'IN_PROGRESS') {
        statusByUser.set(m.player1_id, 'JUGANDO');
        statusByUser.set(m.player2_id, 'JUGANDO');
      } else {
        // WAITING: el retado tiene el reto pendiente; el creador está por jugar.
        if (statusByUser.get(m.player2_id) !== 'JUGANDO') {
          statusByUser.set(m.player2_id, 'RETO_PENDIENTE');
        }
        if (statusByUser.get(m.player1_id) !== 'JUGANDO') {
          statusByUser.set(m.player1_id, 'POR_JUGAR');
        }
      }
    }
    const nowIso = new Date().toISOString();
    return ids
      .filter((id) => byId.has(id))
      .map((id) => {
        const u = byId.get(id)!;
        const derived = statusByUser.get(id);
        const status: PresenceStatus =
          derived ?? (openCreators.has(id) ? 'RETO_GENERADO' : 'LIBRE');
        return {
          userId: id,
          username: u.username,
          displayName: u.display_name,
          status,
          lastHeartbeat: nowIso,
        };
      });
  }

  // ---- Espectadores (solo lectura, por partida) ----

  async addSpectator(
    matchId: string,
    userId: string,
    displayName: string,
  ): Promise<void> {
    const key = `spectators:${matchId}`;
    await this.redis.hset(key, userId, displayName);
    await this.redis.expire(key, SPECTATOR_TTL_SECONDS);
  }

  async removeSpectator(matchId: string, userId: string): Promise<void> {
    await this.redis.hdel(`spectators:${matchId}`, userId);
  }

  async listSpectators(
    matchId: string,
  ): Promise<{ count: number; names: string[] }> {
    try {
      const map = await this.redis.hgetall(`spectators:${matchId}`);
      const names = Object.values(map);
      return { count: names.length, names };
    } catch (err) {
      this.logger.error(`No se pudo leer espectadores en Redis: ${err}`);
      return { count: 0, names: [] };
    }
  }
}
