import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { isValidUsername } from '../auth/auth.service';
import { SafeUser, UserRow, toSafeUser } from '../auth/auth.types';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface WalletSummary {
  available: number;
  reserved: number;
  currency: string;
}

export interface RankingSummary {
  wins: number;
  losses: number;
  ties: number;
  matchesPlayed: number;
  points: number;
  position: number | null;
}

export interface MyProfile extends SafeUser {
  bio: string | null;
  country: string | null;
  /** Resumen de billetera (solo lectura). null si aún no tiene billetera. */
  wallet: WalletSummary | null;
}

export interface PublicProfile {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  /** Los invitados no acumulan ranking (CONTRACTS.md §9.2). */
  ranking: RankingSummary | null;
}

/**
 * Usuarios (CONTRACTS.md §4.2).
 * - El perfil público nunca expone el correo ni datos de sesiones.
 * - `check-username` no revela la lista de usuarios: solo responde si
 *   un nombre concreto está libre.
 * - La billetera se lee aquí solo como resumen; la lógica de saldos y
 *   movimientos es del WalletModule.
 */
@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async getMe(userId: string): Promise<MyProfile> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    const { rows: profiles } = await this.db.query<{
      bio: string | null;
      country: string | null;
    }>('SELECT bio, country FROM user_profiles WHERE user_id = $1', [userId]);
    const profile = profiles[0] ?? { bio: null, country: null };
    const { rows: wallets } = await this.db.query<{
      available_balance: string;
      reserved_balance: string;
      currency: string;
    }>(
      'SELECT available_balance, reserved_balance, currency FROM wallet_accounts WHERE user_id = $1',
      [userId],
    );
    const walletRow = wallets[0];
    return {
      ...toSafeUser(user),
      bio: profile.bio,
      country: profile.country,
      wallet: walletRow
        ? {
            available: Number(walletRow.available_balance),
            reserved: Number(walletRow.reserved_balance),
            currency: walletRow.currency,
          }
        : null,
    };
  }

  async updateMe(userId: string, dto: UpdateProfileDto): Promise<MyProfile> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    await this.db.transaction(async (client) => {
      if (dto.displayName !== undefined || dto.avatarUrl !== undefined) {
        await client.query(
          `UPDATE users SET display_name = COALESCE($1, display_name),
           avatar_url = COALESCE($2, avatar_url) WHERE id = $3`,
          [dto.displayName?.trim() ?? null, dto.avatarUrl ?? null, userId],
        );
      }
      if (dto.bio !== undefined || dto.country !== undefined) {
        await client.query(
          `INSERT INTO user_profiles (user_id, bio, country)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
           SET bio = COALESCE(EXCLUDED.bio, user_profiles.bio),
               country = COALESCE(EXCLUDED.country, user_profiles.country)`,
          [userId, dto.bio ?? null, dto.country ?? null],
        );
      }
    });
    return this.getMe(userId);
  }

  async checkUsername(username: string): Promise<{ available: boolean }> {
    if (!isValidUsername(username)) {
      return { available: false };
    }
    const { rows } = await this.db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(username) = lower($1)',
      [username],
    );
    return { available: rows.length === 0 };
  }

  async getPublicProfile(username: string): Promise<PublicProfile> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE lower(username) = lower($1)',
      [username],
    );
    const user = rows[0];
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    let ranking: RankingSummary | null = null;
    if (user.role !== 'GUEST') {
      const { rows: rankingRows } = await this.db.query<{
        wins: number;
        losses: number;
        ties: number;
        matches_played: number;
        points: number;
      }>('SELECT * FROM rankings WHERE user_id = $1', [user.id]);
      const row = rankingRows[0];
      if (row) {
        const { rows: positionRows } = await this.db.query<{ position: string }>(
          `SELECT COUNT(*)::text AS position FROM rankings
           WHERE points > $1 OR (points = $1 AND wins > $2)`,
          [row.points, row.wins],
        );
        ranking = {
          wins: row.wins,
          losses: row.losses,
          ties: row.ties,
          matchesPlayed: row.matches_played,
          points: row.points,
          position: Number(positionRows[0]?.position ?? 0) + 1,
        };
      }
    }
    return {
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role,
      createdAt: user.created_at,
      ranking,
    };
  }

  private async findUserById(id: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }
}
