// Administración (pantalla sobria, menos neón, más aire): estadísticas,
// usuarios, partidas, movimientos y conciliación. Solo rol ADMIN;
// un usuario normal recibe 403 y ve el estado de error diseñado.
'use client';

import { adminApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import { formatDateTime } from '../../lib/format';
import type { Match, User, WalletMovement } from '../../lib/types';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import { Button, PageHeader, SectionTitle } from '../../components/ui';

export default function AdminPage() {
  const stats = useApiData(() => adminApi.stats(), 'admin-stats');
  const users = useApiData<User[]>(() => adminApi.users(1, 10).then((r) => asList(r)), 'admin-users');
  const matches = useApiData<Match[]>(() => adminApi.matches(1, 10).then((r) => asList(r)), 'admin-matches');
  const transactions = useApiData<WalletMovement[]>(() => adminApi.transactions(1, 10).then((r) => asList(r)), 'admin-transactions');

  if (stats.status === 'loading') return <ListSkeleton count={4} />;
  if (stats.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Administración" />
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">No tienes acceso a esta pantalla. Solo los administradores pueden verla.</p>
          <p className="mt-1 text-xs text-white/60">{stats.error}</p>
          <Button variant="secondary" className="mt-3" onClick={stats.reload}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const s = stats.data!;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Administración" subtitle="Vista general de la plataforma. Solo lectura para los movimientos." />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Usuarios', s.users],
          ['Partidas', s.matches],
          ['Retos', s.challenges],
          ['Créditos DEMO en circulación', s.creditsInCirculation],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-card border border-reto-gold/40 bg-reto-surface p-4">
            <dt className="text-xs text-white/60">{label}</dt>
            <dd className="font-mono text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Usuarios">
        <SectionTitle>Usuarios</SectionTitle>
        {users.status === 'loading' && <ListSkeleton count={3} />}
        {users.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar los usuarios.</p>}
        {users.status === 'ok' && (users.data?.length ?? 0) === 0 && <EmptyState title="No hay usuarios todavía." description="Los usuarios aparecerán aquí cuando se registren." />}
        {users.status === 'ok' && (users.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-2">
            {users.data!.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 rounded-card border border-reto-gold/40 bg-reto-surface px-4 py-3 text-sm">
                <span><strong>{u.displayName}</strong> <span className="text-white/50">@{u.username}</span></span>
                <span className="text-xs text-white/60">{u.role} · {u.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Partidas supervisadas">
        <SectionTitle>Partidas</SectionTitle>
        {matches.status === 'loading' && <ListSkeleton count={3} />}
        {matches.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar las partidas.</p>}
        {matches.status === 'ok' && (matches.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-2">
            {matches.data!.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-card border border-reto-gold/40 bg-reto-surface px-4 py-3 text-sm">
                <span>{m.player1Username ?? 'Jugador 1'} contra {m.player2Username ?? 'Jugador 2'}</span>
                <span className="font-mono">{m.score1}–{m.score2}</span>
                <span className="text-xs text-white/60">{formatDateTime(m.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Movimientos virtuales">
        <SectionTitle>Movimientos virtuales (solo lectura)</SectionTitle>
        {transactions.status === 'loading' && <ListSkeleton count={3} />}
        {transactions.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar los movimientos.</p>}
        {transactions.status === 'ok' && (transactions.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-2">
            {transactions.data!.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-card border border-reto-gold/40 bg-reto-surface px-4 py-3 text-sm">
                <span className="truncate">{t.description}</span>
                <span className={`font-mono font-bold ${t.direction === 'CREDIT' ? 'text-reto-success' : 'text-reto-error'}`}>
                  {t.direction === 'CREDIT' ? '+' : '−'}{t.amount} DEMO
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
