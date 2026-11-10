import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SafeUser, UserRow, toSafeUser } from '../auth/auth.types';

export interface AdminStats {
  users: number;
  matches: number;
  challenges: number;
  /** Créditos DEMO en circulación: suma de (disponible + reservado) de todas las billeteras (misma definición que la conciliación). */
  creditsInCirculation: number;
}

export interface AdminMatchView {
  id: string;
  challengeId: string;
  format: string;
  gameType: string;
  stakeCredits: number;
  status: string;
  score: { player1: number; player2: number };
  player1Id: string;
  player2Id: string;
  player1Username: string;
  player2Username: string;
  score1: number;
  score2: number;
  winnerId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AdminAuditView {
  id: number;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminPage<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

function clampPage(page?: number, limit?: number): { page: number; limit: number; offset: number } {
  const p = Math.max(1, page ?? 1);
  const l = Math.min(100, Math.max(1, limit ?? 20));
  return { page: p, limit: l, offset: (p - 1) * l };
}

/**
 * Lecturas de administración (CONTRACTS.md §4.6, solo lectura).
 * Antes solo existían los endpoints de billetera (AdminWalletController);
 * GET /admin/stats, /admin/users, /admin/matches y /admin/audit no
 * existían, así que el panel /admin mostraba «No tienes acceso»
 * (stats 404) y «No pudimos cargar…» incluso para un ADMIN.
 */
@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  async getStats(): Promise<AdminStats> {
    const { rows } = await this.db.query<{
      users: string;
      matches: string;
      challenges: string;
      credits: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM users) AS users,
         (SELECT COUNT(*)::text FROM matches) AS matches,
         (SELECT COUNT(*)::text FROM challenges) AS challenges,
         (SELECT COALESCE(SUM(available_balance + reserved_balance), 0)::text
          FROM wallet_accounts) AS credits`,
    );
    const row = rows[0] ?? { users: '0', matches: '0', challenges: '0', credits: '0' };
    return {
      users: Number(row.users),
      matches: Number(row.matches),
      challenges: Number(row.challenges),
      creditsInCirculation: Number(row.credits),
    };
  }

  async listUsers(page?: number, limit?: number): Promise<AdminPage<SafeUser>> {
    const { page: p, limit: l, offset } = clampPage(page, limit);
    const totalRes = await this.db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM users',
    );
    const { rows } = await this.db.query<UserRow>(
      `SELECT id, username, email, password_hash, display_name, avatar_url,
              role, status, email_verified_at, mfa_enabled, mfa_secret,
              last_login_at, created_at, updated_at
       FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [l, offset],
    );
    return {
      data: rows.map((r) => toSafeUser(r)),
      page: p,
      limit: l,
      total: Number(totalRes.rows[0]?.total ?? 0),
    };
  }

  async listMatches(page?: number, limit?: number): Promise<AdminPage<AdminMatchView>> {
    const { page: p, limit: l, offset } = clampPage(page, limit);
    const totalRes = await this.db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM matches',
    );
    const { rows } = await this.db.query<
      Record<string, unknown> & {
        id: string;
        challenge_id: string;
        format: string;
        game_type: string;
        stake_credits: number | string;
        status: string;
        score1: number | string;
        score2: number | string;
        player1_id: string;
        player2_id: string;
        player1_username: string;
        player2_username: string;
        winner_id: string | null;
        created_at: string | Date;
        finished_at: string | Date | null;
      }
    >(
      `SELECT m.id, m.challenge_id, m.format, m.game_type, m.stake_credits,
              m.status, m.score1, m.score2, m.player1_id, m.player2_id,
              m.winner_id, m.created_at, m.finished_at,
              p1.username AS player1_username, p2.username AS player2_username
       FROM matches m
       JOIN users p1 ON p1.id = m.player1_id
       JOIN users p2 ON p2.id = m.player2_id
       ORDER BY m.created_at DESC LIMIT $1 OFFSET $2`,
      [l, offset],
    );
    return {
      data: rows.map((m) => ({
        id: m.id,
        challengeId: m.challenge_id,
        format: m.format,
        gameType: m.game_type,
        stakeCredits: Number(m.stake_credits),
        status: m.status,
        score: { player1: Number(m.score1), player2: Number(m.score2) },
        player1Id: m.player1_id,
        player2Id: m.player2_id,
        player1Username: m.player1_username,
        player2Username: m.player2_username,
        score1: Number(m.score1),
        score2: Number(m.score2),
        winnerId: m.winner_id,
        createdAt: new Date(m.created_at).toISOString(),
        finishedAt: m.finished_at ? new Date(m.finished_at).toISOString() : null,
      })),
      page: p,
      limit: l,
      total: Number(totalRes.rows[0]?.total ?? 0),
    };
  }

  async listAudit(page?: number, limit?: number): Promise<AdminPage<AdminAuditView>> {
    const { page: p, limit: l, offset } = clampPage(page, limit);
    const totalRes = await this.db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM audit_logs',
    );
    const { rows } = await this.db.query<{
      id: string;
      actor_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      old_value: unknown;
      new_value: unknown;
      ip_address: string | null;
      created_at: string | Date;
    }>(
      `SELECT id, actor_id, action, entity_type, entity_id, old_value,
              new_value, ip_address, created_at
       FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [l, offset],
    );
    return {
      data: rows.map((r) => ({
        id: Number(r.id),
        actorId: r.actor_id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        oldValue: r.old_value ?? null,
        newValue: r.new_value ?? null,
        ipAddress: r.ip_address,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      page: p,
      limit: l,
      total: Number(totalRes.rows[0]?.total ?? 0),
    };
  }
}
