// Panel del usuario (DESIGN.md §9): saludo, saldo DEMO, retos
// activos, últimas 3 partidas y accesos rápidos.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { gameApi, usersApi, walletApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import { getStoredUser, isGuestUser } from '../../lib/session';
import type { Match, User, WalletSummary } from '../../lib/types';
import { formatScore } from '../../lib/format';
import WalletCard from '../../components/WalletCard';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import { Button, PageHeader, SectionTitle } from '../../components/ui';
import Toast from '../../components/Toast';

/** Etiqueta de estado de una partida (la cancelada no es «Esperando»:
 * antes caía en el caso por defecto y se leía como pendiente). */
function matchStatusLabel(status: Match['status']): string {
  switch (status) {
    case 'FINISHED':
      return 'Terminada';
    case 'IN_PROGRESS':
      return 'En curso';
    case 'WAITING':
      return 'Esperando';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return 'Esperando';
  }
}

export default function PanelPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [guest, setGuest] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    setGuest(isGuestUser(u));
    if (!u) router.push('/login?next=/panel');
  }, [router]);

  const wallet = useApiData<WalletSummary | null>(
    () => (guest ? Promise.resolve(null) : walletApi.summary()),
    `panel-wallet-${guest}`,
  );
  const matches = useApiData<Match[]>(
    () => gameApi.listMatches(1, 3).then((r) => asList(r)),
    'panel-matches',
  );

  if (!user) return <ListSkeleton count={3} />;

  return (
    <div className="flex flex-col gap-6">
      <Toast message={toast} kind="success" onClose={() => setToast(null)} />
      <PageHeader title={`Hola, ${user.displayName}`} subtitle={guest ? 'Sesión de invitado' : 'Esto es lo tuyo hoy.'} />

      {guest && (
        <div className="rounded-card border border-reto-gold/40 bg-reto-gold/10 p-4">
          <p className="text-sm font-semibold">Guarda tu nombre y tu ranking creando una cuenta.</p>
          <p className="mt-1 text-sm text-white/70">Tu historial de partidas se conserva.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/registro">
              <Button>Crear cuenta</Button>
            </Link>
            <Button variant="secondary" onClick={() => setToast('Seguimos jugando como invitado.')}>
              Ahora no
            </Button>
          </div>
        </div>
      )}

      {guest ? (
        <div className="rounded-card border border-reto-gold/40 bg-reto-surface p-5">
          <p className="text-sm text-white/70">
            Los invitados no tienen billetera. Crea una cuenta para recibir créditos DEMO de bienvenida.
          </p>
        </div>
      ) : wallet.status === 'loading' ? (
        <ListSkeleton count={1} />
      ) : wallet.status === 'error' ? (
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{wallet.error}</p>
          <Button variant="secondary" className="mt-3" onClick={wallet.reload}>Reintentar</Button>
        </div>
      ) : wallet.data ? (
        <WalletCard available={wallet.data.available} reserved={wallet.data.reserved} />
      ) : null}

      <section aria-label="Partidas recientes">
        <SectionTitle>Últimas partidas</SectionTitle>
        {matches.status === 'loading' && <ListSkeleton count={3} />}
        {matches.status === 'error' && (
          <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
            <p className="text-sm">{matches.error}</p>
            <Button variant="secondary" className="mt-3" onClick={matches.reload}>Reintentar</Button>
          </div>
        )}
        {matches.status === 'ok' && (matches.data?.length ?? 0) === 0 && (
          <EmptyState
            illustration="hands"
            title="Aún no tienes partidas. Crea tu primer reto."
            description="Tu primera partida puede empezar en menos de un minuto."
            actionLabel="Crear reto"
            actionHref="/retos/crear"
          />
        )}
        {matches.status === 'ok' && (matches.data?.length ?? 0) > 0 && (
          <ul className="grid gap-3 md:grid-cols-3">
            {matches.data!.map((m) => (
              <li key={m.id} className="rounded-card border border-reto-gold/40 bg-reto-surface p-4">
                <p className="text-sm font-semibold">
                  {m.player1Username ?? 'Jugador 1'} contra {m.player2Username ?? 'Jugador 2'}
                </p>
                <p className="mt-1 font-mono text-lg font-bold">{formatScore(m.score1, m.score2)}</p>
                <p className="text-xs text-white/60">{matchStatusLabel(m.status)}</p>
                <Link href={`/partidas/${m.id}`} className="mt-2 inline-block text-sm text-reto-gold underline underline-offset-2">
                  Ver partida
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Accesos rápidos">
        <SectionTitle>Accesos rápidos</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Link href="/retos/crear"><Button>Crear reto</Button></Link>
          <Link href="/retos"><Button variant="secondary">Ver retos</Button></Link>
          <Link href="/ranking"><Button variant="secondary">Ranking</Button></Link>
          <Link href="/ayuda"><Button variant="secondary">Centro de ayuda</Button></Link>
        </div>
      </section>
    </div>
  );
}
