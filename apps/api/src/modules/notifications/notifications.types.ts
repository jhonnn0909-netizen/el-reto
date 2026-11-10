/**
 * Tipos de notificación dentro de la aplicación (CONTRACTS.md §4.5).
 * Solo in-app en el MVP: no hay envío por WhatsApp, correo ni push.
 */
export const NotificationType = {
  CHALLENGE_RECEIVED: 'challenge_received',
  CHALLENGE_ACCEPTED: 'challenge_accepted',
  OPPONENT_WAITING: 'opponent_waiting',
  MATCH_WON: 'match_won',
  MATCH_FINISHED: 'match_finished',
  CREDITS_RECEIVED: 'credits_received',
  CHALLENGE_CANCELLED: 'challenge_cancelled',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
