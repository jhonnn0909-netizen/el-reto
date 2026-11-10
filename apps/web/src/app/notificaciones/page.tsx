// Notificaciones (DESIGN.md §9): lista con no leídas marcadas, cada
// una lleva a su destino, «Marcar todas como leídas».
'use client';

import Link from 'next/link';
import { notificationsApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import { formatDateTime } from '../../lib/format';
import type { AppNotification } from '../../lib/types';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import { Button, PageHeader } from '../../components/ui';

const TYPE_ICON: Record<string, string> = {
  CHALLENGE_RECEIVED: '⚔️',
  CHALLENGE_ACCEPTED: '✓',
  OPPONENT_WAITING: '⏳',
  MATCH_WON: '🏆',
  CREDITS_RECEIVED: '🪙',
  CHALLENGE_CANCELLED: '✕',
};

function destination(n: AppNotification): string {
  const data = n.data as Record<string, unknown>;
  if (typeof data.matchId === 'string') return `/partidas/${data.matchId}`;
  if (typeof data.challengeId === 'string') return `/retos/${data.challengeId}`;
  if (n.type === 'CREDITS_RECEIVED') return '/billetera';
  return '/retos';
}

export default function NotificationsPage() {
  const notifications = useApiData<AppNotification[]>(
    () => notificationsApi.list(1, 20).then((r) => asList(r)),
    'notifications-list',
  );

  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;

  async function markAll() {
    try {
      await notificationsApi.markAllRead();
      notifications.reload();
    } catch {
      // Se mantiene el estado actual; el usuario puede reintentar.
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Notificaciones" subtitle={unread > 0 ? `Tienes ${unread} sin leer.` : 'Estás al día.'} />
        {unread > 0 && (
          <Button variant="secondary" onClick={markAll}>
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {notifications.status === 'loading' && <ListSkeleton count={4} />}
      {notifications.status === 'error' && (
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{notifications.error}</p>
          <Button variant="secondary" className="mt-3" onClick={notifications.reload}>Reintentar</Button>
        </div>
      )}
      {notifications.status === 'ok' && (notifications.data?.length ?? 0) === 0 && (
        <EmptyState illustration="bell" title="No tienes notificaciones nuevas." description="Cuando te reten, acepten un reto o ganes una partida, lo verás aquí." actionLabel="Explorar retos" actionHref="/retos" />
      )}
      {notifications.status === 'ok' && (notifications.data?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-2">
          {notifications.data!.map((n) => (
            <li key={n.id} className={`rounded-card border p-4 ${n.readAt ? 'border-reto-gold/40 bg-reto-surface' : 'border-reto-gold/40 bg-reto-gold/5'}`}>
              <Link href={destination(n)} className="flex items-start gap-3">
                <span aria-hidden="true" className="text-xl">{TYPE_ICON[n.type] ?? '🔔'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{n.title}</span>
                  <span className="mt-0.5 block text-sm text-white/70">{n.body}</span>
                  <span className="mt-1 block text-xs text-white/50">{formatDateTime(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="shrink-0 rounded-full bg-reto-gold px-2 py-0.5 text-[11px] font-bold text-reto-bg">Nueva</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
