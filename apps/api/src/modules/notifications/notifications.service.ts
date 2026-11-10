import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import {
  NotificationRow,
  NotificationType,
  NotificationView,
} from './notifications.types';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType | string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Notificaciones in-app. La creación ocurre sobre todo desde el
 * servicio de juego (dentro de su misma transacción, pasando el
 * `client`); si no se pasa cliente, usa una consulta propia.
 * La difusión en tiempo real (`notification:new`) la hace el gateway
 * a partir de los eventos del servicio de juego.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(
    input: CreateNotificationInput,
    client?: PoolClient,
  ): Promise<NotificationRow> {
    const sql = `INSERT INTO notifications (user_id, type, title, body, data)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const params = [
      input.userId,
      input.type,
      input.title,
      input.body,
      JSON.stringify(input.data ?? {}),
    ];
    const res = client
      ? await client.query<NotificationRow>(sql, params)
      : await this.db.query<NotificationRow>(sql, params);
    return res.rows[0];
  }

  async list(
    userId: string,
    opts: { page?: number; limit?: number; unread?: boolean },
  ): Promise<{ items: NotificationView[]; total: number; unreadCount: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    const where = opts.unread
      ? 'user_id = $1 AND read_at IS NULL'
      : 'user_id = $1';
    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notifications WHERE ${where}`,
      [userId],
    );
    const unreadRes = await this.db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    const rowsRes = await this.db.query<NotificationRow>(
      `SELECT * FROM notifications WHERE ${where}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return {
      items: rowsRes.rows.map(toView),
      total: Number(totalRes.rows[0]?.count ?? 0),
      unreadCount: Number(unreadRes.rows[0]?.count ?? 0),
    };
  }

  /** Marca una notificación como leída. Devuelve false si no existe o no es del usuario. */
  async markRead(userId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.db.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return res.rowCount ?? 0;
  }
}

export function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}
